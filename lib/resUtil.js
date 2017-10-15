/*jshint esversion: 6, node: true */
const dateutil = require("dateutil");
const toRoman = require("roman-numerals").toRoman;

const resUtil = {};
module.exports = resUtil;

//inspection function with settings applied
resUtil.inspect = ((spect) => {
  return (obj) => console.log(spect(obj, {
    colors: true,
    depth: null,
    breakLength: 0
  }));
})(require("util").inspect);

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

  //send given message and status
  res.status(status).send(msg);
};

//checks if given permission code doc allows access to given resolution doc
resUtil.checkPermissionMatch = function(resolution, permission) {
  /* Permission Levels:
    DE: Delegate
    AP: Approval Panel
    FC: Formal Clearing
    CH: Chair (master resolution access)
    MA: Master administration access (rights that require administration outside of resolutions)
  */
  //check permission and stage matching conditions
  return permission.level === "CH" || permission.level === "MA" || //chair access always ok
    //allow if at active editing state and has delegate permission
    resolution.stage <= 1 && permission.level === "DE" ||
    //allow AP or FC if at their respective stages
    resolution.stage === 2 && permission.level === "AP" ||
    resolution.stage === 3 && permission.level === "FC";
};

//combines objects with numerical fields by addition, all should have the same fields as the first
function combineAdd(...args) {
  return args.reduce((sum, obj) => {
    //for every field of sum, add the value of that field in obj to the field in sum
    for (const field in sum) {
      if (obj.hasOwnProperty(field)) {
        sum[field] += obj[field];
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
function countRecursive(obj) {
  //if its a resolution doc, count both clause parts
  if (obj instanceof Array) {
    //reduce to sum of nodes
    return obj.reduce((sum, clause) => {
      //add one because for content
      sum.nodes ++;

      //stop now if it's just a string
      if (typeof clause === "string") {
        //count words on subclause that is just a a string
        sum.words += countWords(clause);
      } else {
        //add number of words in phrase and content
        sum.words += countWords(clause.content);

        //add words of phrase if there is one
        if (clause.hasOwnProperty("phrase")) {
          sum.words += countWords(clause.phrase);
        }

        //add one for phrase
        sum.nodes ++;

        //add one node and count words for the ext content
        if (clause.hasOwnProperty("contentExt")) {
          sum.nodes ++;
          sum.words += countWords(clause.contentExt);
        }

        //add sums of all subclauses
        if (clause.hasOwnProperty("sub")) {
          sum = combineAdd(sum, countRecursive(clause.sub));
        }
      }

      //return extended sum
      return sum;
    }, { //start off with 0 for counting
      nodes: 0,
      words: 0
    });
  } else if (typeof obj === "object" && obj.hasOwnProperty("content")) {
    //return counts of preamb and op clause lists
    const clauses = obj.content.resolution.clauses;
    return combineAdd(countRecursive(clauses.preambulatory), countRecursive(clauses.operative));
  }

  //somethign went wrong, return signifier
  return {
    nodes: "!",
    words: "!"
  };
}

//preformats the date into a string
function getFormattedDate(ms) {
  //return string of date object to be displayed on view
  return ms ? dateutil.format(new Date(ms), "H:i:s - D, d M Y") : "n/a";
}

//prepares an object with the metadata that is always displayed, given the resolution doc
resUtil.getMetaInfo = function(resDoc) {
  //if there is any resolution content
  let countInfo = {};
  if (resDoc.stage) {
    //count both parts with recurisve function
    countInfo = countRecursive(resDoc);
  }

  //create object with data
  return {
    created: getFormattedDate(resDoc.created),
    changed: getFormattedDate(resDoc.changed),
    stageHistory: resDoc.stageHistory.map((ms) => getFormattedDate(ms)),
    lastRender: getFormattedDate(resDoc.lastRender),
    stage: resDoc.stage,
    nodeCount: countInfo.nodes || "?",
    wordCount: countInfo.words || "?"
  };
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

    //check for single string entity
    if (typeof clause === "string") {
      mainContent = clause;
    } else {
      //check for subclauses
      subExists = clause.hasOwnProperty("sub");

      //chck for phrase
      hasPhrase = clause.hasOwnProperty("phrase");

      //use phrase and clause or just clause
      mainContent = hasPhrase ? clause.phrase + "_ " + clause.content : clause.content;
    }

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
      secondary: (index) => indent(iUnit),
    },
    {
      primary: (index) => indent(secIUnit + iUnit) +
        indentConstant("abcdefghijklmnopqrstuvwxyz"[(index + 1) % 26] + ")", iUnit),
      secondary: (index) => indent(secIUnit + iUnit * 2),
    },
    {
      primary: (index) => indent(secIUnit * 2 + iUnit * 2) +
        indentConstant(toRoman(index + 1).toLowerCase() + ".", iUnit),
      secondary: (index) => indent(secIUnit * 2 + iUnit * 3),
    }
  ], "op");

  //return with newlines between lines
  return out.join("\n");
};
