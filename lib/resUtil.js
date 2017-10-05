/*jshint esversion: 6, node: true */
const dateutil = require("dateutil");

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
  //check permission and stage matching conditions
  return permission.level === "CH" || //chair access always ok
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
        sum.words += countWords(clause.phrase) + countWords(clause.content);

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
  return dateutil.format(new Date(ms), "H:i:s - D, d M Y");
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
