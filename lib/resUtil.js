const dateutil = require("dateutil");
const toRoman = require("roman-numerals").toRoman;
const { logger, issueError } = require("../lib/logger");
const tokenProcessor = require("../lib/token");

//make resUtil object and export
const resUtil = {};
module.exports = resUtil;

//time after which unsaved resolutions are deleted (24 hours, see stages.pug) in milliseconds
const unsavedResolutionTTL = 24 * 60 * 60 * 1000;

//interval in which to remove unsaved resolutions (1 hour)
const removeUnsavedInterval = 60 * 60 * 1000;

//checks permission with correct type of match, given mode
resUtil.checkPermission = (resolution, permission, matchMode) => {
  /* Permission Levels:
    DE: Delegate (editing right on stages 0 and 1)
    AP: Approval Panel (editing rights on stage 2)
    FC: Formal Clearing (editing rights on stage 3), incorporates SC
    SC: Secretariat (same editing rights as DE, but allowed to advance from 4 to 5)
    CH: Chair (master resolution access, always editing rights)
    MA: Master administration access (rights that require administration outside of resolutions)
  */

  //default "editor" match mode if none given
  if (typeof matchMode === "undefined") {
    matchMode = "editor";
  }

  //chairlike permission means CH or SG and only SG at stages > 6
  const chairlikePerm =
    permission.level === "CH" && resolution.stage < 7 ||
    permission.level === "SG" && resolution.stage < 11;

  //saving is allowed when not readonly and not static
  const saveAllowed = resolution.attributes !== "readonly" && resolution.attributes !== "static";

  //switch to correct matching mode
  switch (matchMode) {
    default:
    case "editor":
      //chair ok in all stages if generally allowed
      return chairlikePerm || permission.level === "MA" ||
        //allow if at active editing state and has Delegate permission
        resolution.stage <= 1 && permission.level === "DE" ||
        //allow AP or FC if at their respective stages
        resolution.stage === 2 && permission.level === "AP" ||
        resolution.stage === 3 && permission.level === "FC";
    case "save":
      return permission.level === "MA" || ( //master can override restrictions
        //chair ok in all stages if generally allowed
        chairlikePerm ||
        //allow if at active editing state and has Delegate  permission
        resolution.stage <= 1 && permission.level === "DE" ||
        //allow AP or FC if at their respective stages
        resolution.stage === 2 && permission.level === "AP" ||
        resolution.stage === 3 && permission.level === "FC"
      //must be allowed to save(change) at all
      ) && saveAllowed;
    case "advance":
      //only when still stages left to advance to
      return resolution.stage < 11 && (
        //master can override restrictions
        permission.level === "MA" || (
          //chair ok in all stages if generally allowed
          chairlikePerm ||
          //allow AP, FC and SC to advance if at their respective stages
          //FC is also allowed to advance and use print features
          resolution.stage === 2 && permission.level === "AP" ||
          resolution.stage === 3 && permission.level === "FC" ||
          resolution.stage === 4 && (permission.level === "FC" || permission.level === "SC")
        //must be allowed to advance at all
        ) && resolution.attributes !== "noadvance" && resolution.attributes !== "static"
      );
    case "liveview":
      //always allow MA to do lv
      return permission.level === "MA" || (
        //SG/CH in stage 6 (in debate) and SG in stage 10
        resolution.stage === 6 && chairlikePerm ||
        resolution.stage === 10 && permission.level === "SG"
      ) && saveAllowed;

    /*master only access, note that this doesn't allow on unsaved documents,
    because the actions delete and setattribs this mode is used for, only make sense
    with already saved documents*/
    case "admin":
      return permission.level === "MA" && resolution.stage;
  }
};

//checks the permission for an access level to do something without being bound to a resolution
resUtil.checkStaticPermission = (permission, mode) => {
  //chairlike permission is CH and SG
  const chairlikePerm = permission.level === "SG" || permission.level === "CH";
  
  //switch to given mode
  switch (mode) {
    default:
      logger.fatal("invalid match mode " + mode + " specified for static permission check!");
      break;
    case "printqueue":
      //secreteriat, chair and master ok
      return permission.level === "SC" || permission.level === "FC" || permission.level === "MA" ||
        chairlikePerm;
    case "semi-admin":
      return permission.level === "MA" || permission.level === "SG";
    case "admin":
      //only master
      return permission.level === "MA";
    case "fcqueue":
      //fc work queue
      return permission.level === "MA" || chairlikePerm || permission.level === "FC";
    case "forum":
      //forum overview
      return permission.level === "MA" || chairlikePerm;
  }
};

//valid and allowed access level names
resUtil.validAccessLevels = ["SC", "AP", "FC", "CH", "SG", "MA"];

//checks that level is given and is valid
resUtil.validateAccessLevel = level =>
  //need to be a string and one of the allowed level names
   typeof level === "string" && resUtil.validAccessLevels.includes(level);

//combines objects with numerical fields by addition, all should have the same fields as the first
//also adds up nested arrays if there is an array in all of them
const combineAdd = (...args) =>
  //add all args given
   args.reduce((sum, obj) => {
    //function to add elements in array
    const arrayAdder = (addTo, value, index) =>
      addTo[index] = addTo[index] ? addTo[index] + value : value;

    //for every field of the sum, add the value of that field in obj to the field in sum
    for (const field in sum) {
      if (obj.hasOwnProperty(field)) {
        //add each in array if array
        if (sum[field] instanceof Array) {
          //no action if source not also array
          if (obj[field] instanceof Array) {
            //add all
            obj[field].forEach(arrayAdder.bind(null, sum[field]));
          }
        } else {
          //normal add
          sum[field] += obj[field];
        }
      }
    }

    //return added to sum
    return sum;
  });

//counts the number of words in a given string
const countWords = str => str.trim().split(" ").length;

//counts nodes of given resolution clause list (array)
const countRecursive = (obj, depth) => {
  //depth 0 if not given
  if (typeof depth === "undefined") {
    depth = 0;
  }

  //if its a resolution doc, count both clause parts
  if (obj instanceof Array) {
    //count length of array in relation to its tree depth
    const depthCounts = [].fill(0, 0, 3);
    depthCounts[depth] = obj.length;

    //reduce to sum of nodes
    return obj.reduce((sum, clause) => {
      //add one because for content
      sum.nodes ++;

      //words counted in this clause, without child clause words
      let localWords = 0;

      //add number of words in content
      localWords += countWords(clause.content);

      //add words of phrase if there is one
      if (clause.hasOwnProperty("phrase")) {
        sum.nodes ++;
        localWords += countWords(clause.phrase);
      }

      //add one node and count words for the ext content
      if (clause.hasOwnProperty("contentExt")) {
        sum.nodes ++;
        localWords += countWords(clause.contentExt);
      }

      //add sums of all subclauses
      if (clause.hasOwnProperty("sub")) {
        sum = combineAdd(sum, countRecursive(clause.sub, depth + 1));
      }

      //depth index is words times depth (startin at 1), use localWords to not count subclause words
      sum.depthIndex += (depth + 1) * localWords;

      //add local words to sum after processing them for index
      sum.words += localWords;

      //return extended sum
      return sum;
    }, { //start off with 0 for counting
      nodes: 0,
      words: 0,
      depthIndex: 0,
      clauseCount: depthCounts
    });
  } else if (typeof obj === "object" && obj.hasOwnProperty("content")) {
    //return counts of preamb and op clause lists
    const clauses = obj.content.resolution.clauses;
    return combineAdd(countRecursive(clauses.preambulatory),
                      countRecursive(clauses.operative));
  }

  //wrong thing given
  return {};
};

//preformats the date into a string
resUtil.getFormattedDate = ms => {
  /* Note on timezone handling in this project:
    Timestamps are always saved in Date.now() UTC format and
    can therefore also be properly subtracted. For display the local timezone offset (of the server)
    is added after being converted to ms so the rendered page contains the correct time
    at the time of viewing it. changing timezone offsets are not considered so times may change
    if the timezone offset of the server changes throughout the year.
  */
  //return the string of date object to be displayed on view
  const when = new Date(ms);
  return ms ? dateutil.format(
    new Date(when.getTime() - when.getTimezoneOffset() * 60 * 1000),
    "H:i:s - D, d M Y") : "n/a";
};

//round to a specific decimal point
const round = (number, digits) => {
  //calculate factor
  const factor = Math.pow(10, digits);

  //return rounded number
  return Math.round(number * factor) / factor;
};

//prepares an object with the metadata that is always displayed, given the resolution doc
resUtil.getMetaInfo = resDoc => {
  //create object with data
  const infoObj = {
    created: resUtil.getFormattedDate(resDoc.created),
    changed: resUtil.getFormattedDate(resDoc.changed),
    stageHistory: resDoc.stageHistory.map(resUtil.getFormattedDate),
    lastRender: resUtil.getFormattedDate(resDoc.lastRender),
    lastLiveview: resUtil.getFormattedDate(resDoc.lastLiveview),
    stage: resDoc.stage,
    voteResults: resDoc.voteResults,
    attributes: resDoc.attributes,
    amendments: resDoc.amendments
  };

  //add resolutionId from doc if present
  if (resDoc.resolutionId && resDoc.idYear) {
    infoObj.resolutionId = resDoc.resolutionId;
    infoObj.idYear = resDoc.idYear;
  }

  //if there is any resolution content
  if (resDoc.stage) {
    //count both parts with recurisve function
    const countInfo = countRecursive(resDoc);

    //add fields
    infoObj.nodeCount = countInfo.nodes;
    infoObj.wordCount = countInfo.words;
    infoObj.depthIndex = round(countInfo.depthIndex / countInfo.clauseCount[0], 2);
    infoObj.avrgClauseWords = round(countInfo.words / countInfo.clauseCount[0], 2);
    infoObj.clauseCount = countInfo.clauseCount;
  }

  //return created object
  return infoObj;
};

//indents the second string until it's the specified amount
//of spaces away from the beginning of the line
function indentConstant(prefix, toIndent, dist, delim) {
  //dist is in toIndent if onyl two given
  if (arguments.length === 2) {
    dist = toIndent;
  }

  //use space delimeter if none given
  if (typeof delim === "undefined") {
    delim = " ";
  }

  //return prefix, spaces for indent and string to append
  return prefix + delim.repeat(Math.max(dist - prefix.length, 0)) +
    (typeof toIndent === "string" ? toIndent : "");
}

//returns indent distanced spaces
const indent = (dist, delim) => {
  //use space delimeter if none given
  if (typeof delim === "undefined") {
    delim = " ";
  }

  //return repeated delimeter
  return delim.repeat(dist);
};

//pushes all clauses and subclauses into an array and applies indenters
const pushClauses = (pushInto, clauses, indenters, clauseType, depth) => {
  //start with 0 if no depth given
  if (typeof depth === "undefined") {
    depth = 0;
  }

  //get indenter for this clause level
  const indenter = indenters[depth];

  //for all clauses
  clauses.forEach((clause, index) => {
    //check for subclauses
    const subExists = clause.hasOwnProperty("sub");

    //chck for phrase
    const hasPhrase = clause.hasOwnProperty("phrase");

    //use phrase and clause or just clause
    let mainContent = hasPhrase ? clause.phrase + "_ " + clause.content : clause.content;

    //if doesn't have phrase and not first in a subsub, capitalize first letter
    mainContent = mainContent[0][
      (clauseType === "op" ? depth === 2 && ! index : depth) ? "toLowerCase" : "toUpperCase"
    ]() + mainContent.substr(1);

    //add colon if there are subclauses
    if (subExists) {
      mainContent += ":";
    } else if (! hasPhrase || clauseType === "preamb") {
      mainContent += ",";
    }

    //add content with indenter
    pushInto(indenter.primary(index) + mainContent);

    //add subclauses
    if (subExists) {
      pushClauses(pushInto, clause.sub, indenters, clauseType, depth + 1);
    }

    //add ext content if there is any
    if (clause.hasOwnProperty("contentExt")) {
      //add with end of clause colon
      pushInto(indenter.secondary(index) + clause.contentExt + ",");
    }

    //at top clause level
    if (! depth) {
      //if on op clauses, things for ends of clauses
      if (clauseType === "op") {
        //get array of lines
        const arr = pushInto();

        //remove , from end of clause
        arr[arr.length - 1] = arr[arr.length - 1].replace(",", "");

        //if at end of resolution, add dot
        if (index === clauses.length - 1) {
          arr[arr.length - 1] += ".";
        } else {
          //add simicolon for end of clause
          arr[arr.length - 1] += ";";
        }
      }

      //add newline for next clause
      pushInto("");
    }
  });
};

//prepares pushClauses by passing fucntion that pushes into given array
const preparePushClauses = linesArr => pushClauses.bind(null, line => {
    //push onto array
    if (typeof line === "string") {
      linesArr.push(line);
    }

    //and return array for manipulation
    return linesArr;
  });

//returns resolution doc as plaintext, fallback option
resUtil.renderPlaintext = doc => {
  //string accumulator
  const out = [];

  //indenting units
  const iUnit = 6; //main indenting
  const secIUnit = 3; //indenting thats put befoe normal indenting
  const addressIndent = 15; //indenting for the address blcok

  //status title
  out.push("Resolution Plaintext Render");
  out.push("Token: " + doc.token +
           ", Stage: #" + doc.stage +
           ", FormatVersion: " + doc.content.version);
  out.push("Author: " + doc.content.author + "\n");

  //address
  const res = doc.content.resolution;
  out.push(indentConstant("FORUM:", res.address.forum, addressIndent) + "\n");
  out.push(indentConstant("QUESTION OF:", res.address.questionOf, addressIndent) + "\n");
  out.push(indentConstant("SPONSOR:", res.address.sponsor.main, addressIndent) + "\n");
  out.push(indentConstant("CO-SPONSORS:", res.address.sponsor.co.join(", "), addressIndent) + "\n");
  out.push("\nTHE " + res.address.forum.toUpperCase() + ",\n");

  //push preamb clauses into array and specify indenting functions
  preparePushClauses(out)(res.clauses.preambulatory, [
    {
      primary: () => "",
      secondary: () => ""
    },
    {
      primary: () => indent(iUnit) + indentConstant("-", secIUnit),
      secondary: () => indent(secIUnit + iUnit)
    }
  ], "preamb");

  //push op clauses into array and specify indenting functions
  preparePushClauses(out)(res.clauses.operative, [
    {
      primary: index => indentConstant(index + 1 + ".", iUnit),
      secondary: () => indent(iUnit)
    },
    {
      primary: index => indent(secIUnit + iUnit) +
        indentConstant("abcdefghijklmnopqrstuvwxyz"[(index + 1) % 26] + ")", iUnit),
      secondary: () => indent(secIUnit + iUnit * 2)
    },
    {
      primary: index => indent(secIUnit * 2 + iUnit * 2) +
        indentConstant(toRoman(index + 1).toLowerCase() + ".", iUnit),
      secondary: () => indent(secIUnit * 2 + iUnit * 3)
    }
  ], "op");

  //return with newlines between lines
  return out.join("\n");
};

//removes unsaved resolutions older than a set time
const removeUnsavedResolutions = resolutions => {
  //send database query to delete old entries
  resolutions.deleteMany({
    stage: 0, //must be unsaved
    changed: { //save time must be more than unsavedResolutionTTL ms ago
      $lte: Date.now() - unsavedResolutionTTL
    }
  })
  .then(result => {
    if (result.deletedCount) {
      logger.info("Released " + result.deletedCount + " tokens back.");
    }
  }, err => {
    logger.error("error 'deleting' old resolutions", { stack: err.stack });
  });
};

//on database loading
let resolutions, access;
require("../lib/database").fullInit.then(collections => {
  //get resolution collection
  resolutions = collections.resolutions;
  access = collections.access;

  //run now and every timer interval
  removeUnsavedResolutions(resolutions);
  setInterval(removeUnsavedResolutions.bind(null, resolutions), removeUnsavedInterval);
});

//generates a token/code and queries the database to see if it's already present (recursive)
resUtil.makeNewThing = (req, res, isToken) =>
  //return promise, pass recursive function
   new Promise(function attempt(resolve, reject) {
    //make new token or code
    const thing = tokenProcessor[isToken ? "makeToken" : "makeCode"]();

    //query if it exists in db
    (isToken ? resolutions.findOne({ token: thing }) :
     access.findOne({ code: thing })).then(document => {
      //if it exists
      if (document) {
        //try again randomly
        attempt(resolve, reject);
      } else {
        //doesn't exist yet, call callback with found thing
        resolve(thing);
      }
    }, () => {
      reject("db read error");
    });
  }).catch(() => issueError(req, res, 500, "db read error"));

