/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const routingUtil = require("../lib/routingUtil");
const tokenProcessor = require("../lib/token");
const { issueError } = require("../lib/logger");

//get resolutions collection
let resolutions, resolutionArchive, access, metadata;
require("../lib/database").fullInit.then(collections => {
  resolutions = collections.resolutions;
  resolutionArchive = collections.resolutionArchive;
  access = collections.access;
  metadata = collections.metadata;
});

//require admin session for overview and code management
router.use(["/overview", "/codes"], (req, res, next) =>
  routingUtil.requireSession("admin", req, res, () => next()));

//GET display overview of all resolutions
router.get("/overview", function(req, res) {
  //check if the archive was requested
  const useArchive = req.query.archive == "1"; //jshint ignore: line

  //aggregate resolutions, use archive if get flag set
  (useArchive ? resolutionArchive : resolutions).aggregate([
    //project to only transmit token, current stage and committee
    { $project: {
      token: 1,
      stage: 1,
      forum: "$content.resolution.address.forum",
      sponsor: "$content.resolution.address.sponsor.main",
      _id: 0,
      resolutionId: 1,
      idYear: 1
    }},

    //group into stages
    { $group: {
      _id: "$stage",
      list: { $push: "$$ROOT" } //append whole object to list
    }},

    //sort by stage
    { $sort: {
      _id: 1
    }}
  ]).toArray().then(items => {
    //send data to client
    res.render("listoverview", { items: items, isArchive: useArchive });
  }, err => issueError(res, 500, "could not query resolution in overview", err));
});

//gets the current insert group counter
function getInsertGroupCounter() {
  return metadata.findOne({ _id: "codeInsertGroupCounter" });
}

//GET display overview of all codes and associated information
router.get("/codes", function(req, res) {
  Promise.all([
    //get current insert group counter
    getInsertGroupCounter(),

    //aggregate codes from access collection of codes
    access.aggregate([
      //sort by code alphabetically
      { $sort: {
        code: 1
      }},

      //group into levels
      { $group: {
        _id: "$level",
        list: { $push: "$$ROOT" } //append whole object to list
      }},

      //sort by group level
      { $sort: {
        _id: 1
      }}
    ]).toArray()
  ]).then(results => {
    //codes are in the second result
    const codes = results[1];

    //the first result is the current insert group id
    const insertGroupId = results[0].value;

    //list of the recently added codes, they have the current insert group counter
    const latestCodes = codes.reduce(
      //append all codes thatmatch the current insert group index
      (acc, group) => acc.concat(
        group.list.filter(codeObj => codeObj.insertGroupId === insertGroupId)), []);

    //display code overview page
    res.render("codeoverview", {
      codes: codes,
      latestCodes: latestCodes,
      sessionCode: req.session.code
    });
  }, err => issueError(res, 500, "could not query codes or insert group id for overview", err));
});

//checks that level is given and is valid
function validatePostedAccessLevel(level) {
  //need to be a string and one of the allowed level names
  return typeof level === "string" && ["FC", "AP", "SC", "MA", "CH"].includes(level);
}

//GET print codes displays items in a plaintext table view that can be easily printed
router.get("/codes/print/:group", function(req, res, next) {
  //the given print group type
  const printGroupType = req.params.group;

  //query to perform
  let query;

  //for the all group, prepare query for all codes
  if (printGroupType === "all") {
    //query all codes
    query = Promise.resolve({ });
  } else if (printGroupType === "latest") {
    //get insert group counter
    query = getInsertGroupCounter().then(counterResult => ({
      insertGroupId: counterResult.value
    }), err => issueError(res, 500, "could not query insert group id for code print table", err));
  } else if (validatePostedAccessLevel(printGroupType)) {
    //query for codes with this access level
    query = Promise.resolve({
      level: printGroupType
    });
  } else {
    //no correct action
    next();
    return;
  }

  //resolve promise for query
  query.then(
    //query codes
    query => access.find(query, { sort: ["level", "code"] }).toArray().then(
      //render result
      result => res.render("codetable", {
        codes: result,
        groupType: printGroupType
      }),
      err => issueError(res, 500, "could not query codes for print table", err))
  );
});

//maximum number of times codes are generated and sent to the database
//50 makes it extremely unlikely that an error is produced,
//although there are still plenty of codes left
const maximumCodeGenerationTries = 50;

//post to codes page performs action and then sends ok message for page reload
router.post("/codes/:action", function(req, res) {
  //for revoke and change action type
  if (req.params.action === "change" || req.params.action === "revoke") {
    //get the list of codes to process
    if (req.body && req.body.codes && req.body.codes instanceof Array && req.body.codes.length) {
      //remove the current session code
      const sessionCode = req.session.code;
      const codes = req.body.codes.filter(code => code !== sessionCode);

      //if there are codes
      if (! codes.length) {
        //send error
        issueError(res, 404, "no valid codes given");
        return;
      }

      //for specified action
      if (req.params.action === "revoke") {
        //remove all codes that were given
        access.deleteMany({ code: { "$in": codes }}).then(() => res.send("ok"), err => {
          issueError(res, 500, "couldn't remove specified codes", err);
        });
      } else { //change action
        //require correct new level to be set
        const setLevel = req.body.level;
        if (validatePostedAccessLevel(setLevel)) {
          //change level for all codes
          access.updateMany(
            { code: { $in: codes }},
            { $set: { level: setLevel }}
          ).then(() => res.send("ok"), err => {
            issueError(res, 500, "couldn't change specified codes to " + setLevel, err);
          });
        } else {
          issueError(res, 400, "invalid code level set " + setLevel + " for change op");
        }
      }
    } else {
      //send error
      issueError(res, 400, "no valid codes for endpoint given");
    }
  } else if (req.params.action === "new") {
    //require list of names and/or number of codes
    if (req.body) {
      //require valid level to be specified
      const useLevel = req.body.accessLevel;
      if (! validatePostedAccessLevel(useLevel)) {
        //complain and stop
        issueError(res, 400, "invalid code level set " + useLevel + " for new codes op");
        return;
      }

      //add names if given
      let codesArr = req.body.names;
      if (codesArr && codesArr instanceof Array && codesArr.length) {
        //use names a already given objects in codes
        codesArr = codesArr
          .filter(name => typeof name === "string")
          .map(name => ({ name: name }));
      } else {
        //init empty
        codesArr = [];
      }

      //number of codes specified
      const amountSpecified = parseInt(req.body.amount);

      //normalize to number and cap at max value
      const codeAmount = Math.min(100, Math.max(codesArr.length, amountSpecified || 0));

      //fill with empty objects until amount reached
      for (let i = codesArr.length; i < codeAmount; i ++) {
        //add empty
        codesArr[i] = { };
      }

      //get the current value of the insertion group counter
      metadata.findOneAndUpdate({
        _id: "codeInsertGroupCounter"
      }, {
        $inc: { value: 1 }
      }, { returnOriginal: false }).then(result => {
        //pass gotten counter value to next step
        return Promise.resolve({
          remainingCodes: codesArr,
          depth: 0, //init with depth 0
          insertGroupId: result.value.value
        });
      }).then(function handleRemaining(opts) { //insert codes until all codes are inserted
        //remaining codes are in opts
        const remainingCodes = opts.remainingCodes;

        //object of codes to be generated
        const codesObj = {};

        //generate codes for entries
        for (let i = 0; i < remainingCodes.length; i ++) {
          //generate new codes until it hasn't been generated yet
          let newCode;
          do {
            //generate random unverified code for this entry
            newCode = tokenProcessor.makeCode();
          } while (codesObj[newCode]);

          //code holding object for this index
          const currentCodeObj = remainingCodes[i];

          //add new unique code to object with name
          codesObj[newCode] = currentCodeObj.name || true;

          //add code to code object
          currentCodeObj.code = newCode;

          //set level to that specified and set recent insert counter value
          currentCodeObj.level = useLevel;
          currentCodeObj.insertGroupId = opts.insertGroupId;
        }

        //insert all into collection
        access.insertMany(remainingCodes, {
          //continue inserting if one fails
          ordered: false
        }).then(() => {
          //no duplicate codes need to be handled, send ok
          res.send("ok");
        }, err => {
          //stop at maximum depth, in case of code space exhaustion
          if (opts.depth > maximumCodeGenerationTries) {
            issueError(res, 500, "most likely no codes left to give out, too many tries", err);
            return;
          }

          //get the write errors, if the error has .writeErrors there is an array
          //otherwise the given error is an write error
          const writeErrors = err.writeErrors ? err.writeErrors : [err];

          //construct array of remaining codes (some of which may have name properties)
          //and handle as remaining
          handleRemaining({
            remainingCodes: writeErrors.map(err => {
              //get the not inserted object
              const doc = err.getOperation();

              //construct object with level
              const newCodeObj = {
                level: doc.level
              };

              //add name if there is one
              if (doc.name) {
                newCodeObj.name = doc.name;
              }

              //return to be inserted again with new code
              return newCodeObj;
            }),

            //increment recursion depth
            depth: opts.depth + 1
          });
        });
      }, err => issueError(res, 500, "error while inserting new codes", err));
    }
  } else {
    //error for unhandled (invalid) action type
    issueError(res, 404, "no such code action " + req.params.action);
  }
});

//print queue needs SC access
router.use("/print", (req, res, next) =>
  routingUtil.requireSession("printqueue", req, res, () => next()));

//POST secreteriat print queue page, gets code from post
router.get("/print", function(req, res) {
  //render the list page
  res.render("printqueue");
});

//maps the stage history entry from it's nexted form to a property
//also moves the address to a top level property
function mapListItems(items, stageHistoryIndex) {
  //map items and return modified
  return items.map(i => {
    //set new property with value at index
    i.waitTime = i.stageHistory[stageHistoryIndex];

    //remove stageHistory
    delete i.stageHistory;

    //unwrap address
    i.address = i.content.resolution.address;

    //remove old property
    delete i.content;

    //return original object
    return i;
  });
}

//POST return list of items to be printed
router.get("/print/getitems", function(req, res) {
  //query resolutions in stage 4 that are advanceable (and thereby non-static)
  resolutions.find({
    stage: 4,
    $nor: [
      { attributes: "noadvance" },
      { attributes: "static" },
    ]
  }).project({
    //project to only transmit necessary data, basically only want meta data
    token: 1,
    stageHistory: 1,
    resolutionId: 1,
    idYear: 1,
    "content.resolution.address": 1,
    _id: 0,
    unrenderedChanges: 1,
    pageAmount: 1
  }).sort({
    //sort by time in stage 4 (most necessary first), index 4 becase 0 is also a stage
    "stageHistory.4": -1
  }).toArray().then(items => {
    //send data to client, rewrite and address
    res.send(mapListItems(items, 4));
  }, err => issueError(res, 500, "could not query print queue items", err));
});

//uses session auth for FC queue
router.use("/fcqueue", (req, res, next) =>
  routingUtil.requireSession("fcqueue", req, res, () => next()));

//GET fc work queue display
router.get("/fcqueue", function(req, res) {
  //render fc work queue page
  res.render("fcqueue");
});

//GET fc work queue data
router.get("/fcqueue/getitems", function(req, res) {
  //query resolutions thart are in stage 3 and can be advanced
  resolutions.find({
    stage: 3,
    $nor: [
      { attributes: "noadvance" },
      { attributes: "static" },
    ]
  }).project({
    //only need some data
    token: 1,
    stageHistory: 1, //id and year are assigned with advance to stage 4
    "content.resolution.address": 1,
    _id: 0
  }).sort({
    //sort by time in stage 3, most necessary first
    "stageHistory.3": -1
  }).toArray().then(items => {
    //send data to client, rewrite stageHistory and address
    res.send(mapListItems(items, 3));
  }, err => issueError(res, 500, "could not query fc work queue items", err));
});
