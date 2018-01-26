/*jshint esversion: 6, node: true */
const dateutil = require("dateutil");
const toRoman = require("roman-numerals").toRoman;
const databaseInterface = require("../lib/database");

const resUtil = {};
module.exports = resUtil;

//time after which unsaved resolutions are deleted (24 hours, see stages.pug) in milliseconds
const unsavedResolutionTTL = 24 * 60 * 60 * 1000;

//interval in which to remove unsaved resolutions (1 hour)
const removeUnsavedInterval = 60 * 60 * 1000;

//sends an error and logs it
resUtil.issueError = function(res, status, msg, errorItself) {
  //prepend error text
  msg = "error: " + msg;

  //log message to console
  console.error(msg);

  //also log error if there was one
  if (errorItself) {
    console.error(errorItself);
  }

  //send given message and status if res is an object
  if (typeof res === "object") {
    res.status(status).send(msg);
  } //pass falsy value to prevent sending of error to client
};

//checks permission with correct type of match, given mode
resUtil.checkPermission = function(resolution, permission, matchMode) {
  /* Permission Levels:
    DE: Delegate (editing right on stages 0 and 1)
    AP: Approval Panel (editing rights on stage 2)
    FC: Formal Clearing (editing rights on stage 3)
    SC: Secretariat (same editing rights as DE, but allowed to advance from 4 to 5)
    CH: Chair (master resolution access, always editing rights)
    MA: Master administration access (rights that require administration outside of resolutions)
  */

  //default "editor" match mode if none given
  if (typeof matchMode === "undefined") {
    matchMode = "editor";
  }

  //switch to correct matching mode
  switch (matchMode) {
    default:
    case "editor":
      //chair ok in all stages if generally allowed
      return permission.level === "CH" || permission.level === "MA" ||
        //allow if at active editing state and has Delegate or Secretariat permission
        resolution.stage <= 1 && (permission.level === "DE" || permission.level === "SC") ||
        //allow AP or FC if at their respective stages
        resolution.stage === 2 && permission.level === "AP" ||
        resolution.stage === 3 && permission.level === "FC";
    case "save":
      return permission.level === "MA" || //master can override restrictions
        (permission.level === "CH" || //chair ok in all stages if generally allowed
        //allow if at active editing state and has Delegate or Secretariat permission
        resolution.stage <= 1 && (permission.level === "DE" || permission.level === "SC") ||
        //allow AP or FC if at their respective stages
        resolution.stage === 2 && permission.level === "AP" ||
        resolution.stage === 3 && permission.level === "FC") &&
        //must be allowed to save(change) at all
        resolution.attributes !== "readonly" && resolution.attributes !== "static";
    case "advance":
      return permission.level === "MA" || //master can override restrictions
        (permission.level === "CH" || //chair ok in all stages if generally allowed
        //allow AP, FC and SC to advance if at their respective stages
        resolution.stage === 2 && permission.level === "AP" ||
        resolution.stage === 3 && permission.level === "FC" ||
        resolution.stage === 4 && permission.level === "SC") &&
        //must be allowed to advance at all
        resolution.attributes !== "noadvance" && resolution.attributes !== "static";
    case "liveview":
      return permission.level === "MA" || //always allow MA
        resolution.stage === 6 && permission.level === "CH"; //CH in stage 6 (in debate)

    /*master only access, note that this doesn't allow on unsaved documents,
    because the actions delete and setattribs this mode is used on only makes sense
    with already saved documents*/
    case "admin":
      return permission.level === "MA" && resolution.stage;
  }
};

//checks the permission for an access level to do something without being bound to a resolution
resUtil.checkStaticPermission = function(permission, mode) {
  //switch to given mode
  switch (mode) {
    default:
      throw Error("invalid match mode " + mode + " specified for static permission check!");
    case "printqueue":
      //secreteriat, chair and master ok
      return permission.level === "SC" || permission.level === "MA" ||
        permission.level === "CH";
  }
};

//combines objects with numerical fields by addition, all should have the same fields as the first
//also adds up nested arrays if there is an array in all of them
function combineAdd(...args) {
  //add all args given
  return args.reduce((sum, obj) => {
    //function to add elements in array
    const arrayAdder = (addTo, value, index) =>
      addTo[index] = addTo[index] ? addTo[index] + value : value;

    //for every field of sum, add the value of that field in obj to the field in sum
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
}

//counts the number of words in a given string
function countWords(str) {
  return str.trim().split(" ").length;
}

//counts nodes of given resolution clause list (array)
function countRecursive(obj, depth) {
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
      clauseCount: depthCounts,
    });
  } else if (typeof obj === "object" && obj.hasOwnProperty("content")) {
    //return counts of preamb and op clause lists
    const clauses = obj.content.resolution.clauses;
    return combineAdd(countRecursive(clauses.preambulatory),
                      countRecursive(clauses.operative));
  }

  //wrong thing given
  return {};
}

//preformats the date into a string
function getFormattedDate(ms) {
  /* Note on timezone handling in this project:
    Timestamps are always saved in Date.now() UTC format and
    can therefore also be properly subtracted. For display the local timezone offset (of the server)
    is added after being converted to ms so the rendered page contains the correct time
    at the time of vieweing it. changing timezone offsets are not considered so times may change
    if the timezone offset of the server changes throughout the year.
  */
  //return string of date object to be displayed on view
  const when = new Date(ms);
  return ms ? dateutil.format(
    new Date(when.getTime() - when.getTimezoneOffset() * 60 * 1000),
    "H:i:s - D, d M Y") : "n/a";
}

//round to a specific decimal point
function round(number, digits) {
  //calculate factor
  const factor = Math.pow(10, digits);

  //return rounded number
  return Math.round(number * factor) / factor;
}

//prepares an object with the metadata that is always displayed, given the resolution doc
resUtil.getMetaInfo = function(resDoc) {
  //create object with data
  const infoObj = {
    created: getFormattedDate(resDoc.created),
    changed: getFormattedDate(resDoc.changed),
    stageHistory: resDoc.stageHistory.map((ms) => getFormattedDate(ms)),
    lastRender: getFormattedDate(resDoc.lastRender),
    lastLiveview: getFormattedDate(resDoc.lastLiveview),
    stage: resDoc.stage,
    voteResults: resDoc.voteResults,
    attributes: resDoc.attributes
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
function indent(dist, delim) {
  //use space delimeter if none given
  if (typeof delim === "undefined") {
    delim = " ";
  }

  //return repeated delimeter
  return delim.repeat(dist);
}

//pushes all clauses and subclauses into array and applies indenters
function pushClauses(pushInto, clauses, indenters, clauseType, depth) {
  //start with 0 if no depth given
  if (typeof depth === "undefined") {
    depth = 0;
  }

  //get indenter for this clause level
  const indenter = indenters[depth];

  //for all clauses
  clauses.forEach((clause, index) => {
    //if is string only use that
    let hasPhrase, subExists, mainContent;

    //check for subclauses
    subExists = clause.hasOwnProperty("sub");

    //chck for phrase
    hasPhrase = clause.hasOwnProperty("phrase");

    //use phrase and clause or just clause
    mainContent = hasPhrase ? clause.phrase + "_ " + clause.content : clause.content;

    //if doesn't have phrase and not first in a subsub, capitalize first letter
    mainContent = mainContent[0]
      [(clauseType === "op" ? depth === 2 && ! index : depth) ? "toLowerCase" : "toUpperCase"]() +
      mainContent.substr(1);

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
}

//prepares pushClauses by passing fucntion that pushes into given array
function preparePushClauses(linesArr) {
  return pushClauses.bind(null, (line) => {
    //push onto array
    if (typeof line === "string") {
      linesArr.push(line);
    }

    //and return array for manipulation
    return linesArr;
  });
}

//returns resolution doc as plaintext, fallback option
resUtil.renderPlaintext = function(doc) {
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
      secondary: () => "",
    },
    {
      primary: () => indent(iUnit) + indentConstant("-", secIUnit),
      secondary: () => indent(secIUnit + iUnit),
    }
  ], "preamb");

  //push op clauses into array and specify indenting functions
  preparePushClauses(out)(res.clauses.operative, [
    {
      primary: (index) => indentConstant((index + 1) + ".", iUnit),
      secondary: () => indent(iUnit),
    },
    {
      primary: (index) => indent(secIUnit + iUnit) +
        indentConstant("abcdefghijklmnopqrstuvwxyz"[(index + 1) % 26] + ")", iUnit),
      secondary: () => indent(secIUnit + iUnit * 2),
    },
    {
      primary: (index) => indent(secIUnit * 2 + iUnit * 2) +
        indentConstant(toRoman(index + 1).toLowerCase() + ".", iUnit),
      secondary: () => indent(secIUnit * 2 + iUnit * 3),
    }
  ], "op");

  //return with newlines between lines
  return out.join("\n");
};

//removes unsaved resolutions older than a set time
function removeUnsavedResolutions(resolutions) {
  //send database query to delete old entries
  resolutions.deleteMany({
    stage: 0, //must be unsaved
    changed: { //save time must be more than unsavedResolutionTTL ms ago
      $lte: Date.now() - unsavedResolutionTTL
    }
  })
  .then((result) => {
    if (result.deletedCount) {
      console.log("Released " + result.deletedCount + " tokens back.");
    }
  }, (err) => {
    console.log("error deleting old resolutions:" + err);
  });
}

//on database loading
databaseInterface((collections) => {
  //get resolution collection
  const resolutions = collections.resolutions;

  //run now and every timer interval
  removeUnsavedResolutions(resolutions);
  setInterval(removeUnsavedResolutions.bind(null, resolutions), removeUnsavedInterval);
});

