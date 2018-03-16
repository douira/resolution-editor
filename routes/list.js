/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const resUtil = require("../lib/resUtil");
const routingUtil = require("../lib/routingUtil");
const databaseInterface = require("../lib/database").callback;
const validateCode = require("../lib/token").check;

const issueError = resUtil.issueError;

//get resolutions collection
let resolutions, resolutionArchive, access;
databaseInterface(collections => {
  resolutions = collections.resolutions;
  resolutionArchive = collections.resolutionArchive;
  access = collections.access;
});

//GET display overview of all resolutions
router.get("/overview", function(req, res) {
  //require session admin right
  routingUtil.requireAdminSession(req, res, () => {
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
});

//regular dispaly of codes page
function codesPage(req, res) {
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
  ]).toArray().then(codes => {
    //display code overview page
    res.render("codeoverview", { codes: codes});
  }, err => issueError(res, 500, "could not query codes for overview", err));
}

//GET display overview of all codes and associated information
router.get("/codes", function(req, res) {
  //require session admin right
  routingUtil.requireAdminSession(req, res, () => {
    //display codes page
    codesPage(req, res);
  });
});

//post to codes page performs action and then displays page like normal
router.post("/codes/:action", function(req, res) {
  //require session admin right
  routingUtil.requireAdminSession(req, res, () => {
    //get the list of codes to process
    if (req.body && req.body.codes && req.body.codes.length && req.body.codes instanceof Array) {
      //remove the current session code and codes that are no valid codes
      const sessionCode = req.session.code;
      const codes = req.body.codes.filter(code => code !== sessionCode && validateCode(code));

      //if there are codes
      if (codes.length) {
        //check for valid action
        switch(req.params.action) {
          //revoke codes
          case "revoke":
            //remove all codes that were given
            access.deleteMany({ code: { "$in": codes }}).then(() => codesPage(req, res), err => {
              issueError(res, 500, "couldn't remove specified codes", err);
            });
            break;

          //change codes
          case "change":
            //require correct new level to be set
            const setLevel = req.body.level;
            if (["FC", "AP", "SC", "MA", "CH"].includes(setLevel)) {
              //change level for all codes
              access.deleteMany(
                { code: { $in: codes }},
                { $set: { level: setLevel }}
              ).then(() => codesPage(req, res), err => {
                issueError(res, 500, "couldn't change specified codes to " + setLevel, err);
              });
            } else {
              issueError(res, 400, "invalid code level set " + req.body.level);
            }
            break;

          //error if not handled
          default:
            issueError(res, 404, "no such code action " + req.params.action);
        }
      } else {
        //render normally
        codesPage();
      }
    }
  });
});

//GET display enter access code page
router.get("/print", function(req, res) {
  //check if a session is open to display without entering code for admin
  if (req.session.code && req.session.doc.level === "MA") {
    //redirect to queue
    res.redirect("/list/print/queue");
  } else {
    //render entry page
    res.render("printqueueopen");
  }
});

//POST secreteriat print queue page, gets code from post
routingUtil.getAndPost(router, "/print/queue", function(req, res) {
  //do code auth and permission check
  routingUtil.checkCodeStaticPerm(req, res, "printqueue",
    //render the list page
    codeDoc => res.render("printqueue", { code: codeDoc.code }),

    //show the weakperm page for work queues
    () => res.render("weakperm", { type: "workqueue" })
  );
});

//POST return list of items to be printed
router.post("/print/getitems", function(req, res) {
  //do code auth and permission check
  routingUtil.checkCodeStaticPerm(req, res, "printqueue", () => {
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
      //send data to client, rewrite stageHistory
      res.send(items.map(i => {
        //set new property with value at index 4
        i.waitTime = i.stageHistory[4];

        //remove stageHistory
        delete i.stageHistory;

        //return original object
        return i;
      }));
    }, err => issueError(res, 500, "could not query print queue items", err));
  });
});
