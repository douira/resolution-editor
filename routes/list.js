/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const resUtil = require("../lib/resUtil");
const routingUtil = require("../lib/routingUtil");
const databaseInterface = require("../lib/database").callback;

const issueError = resUtil.issueError;

//get resolutions collection
let resolutions;
databaseInterface(collections => {
  resolutions = collections.resolutions;
});

//GET display overview o all resolutions
router.get("/overview", function(req, res) {
  //require session admin right
  routingUtil.requireAdminSession(req, res, () => {
    //aggregate resolutions
    resolutions.aggregate([
      //query for saved resolutions
      { $match: {
        stage: { $gt: 0 }
      }},

      //project to only transmit token, current stage and committee
      { $project: {
        token: 1,
        stage: 1,
        "content.resolution.address.forum": "forum",
        _id: 0
      }},

      //finally sort by stage
      { $sort: {
        stage: 1
      }}
    ]).toArray().then(items => {
      //send data to client
      res.send(items);
    }, err => issueError(res, 500, "could not query print queue items", err));
  });
});

//GET display enter access code page
router.get("/print", function(req, res) {
  res.render("printqueueopen");
});

//POST secreteriat print queue page, gets code from post
router.post("/print/queue", function(req, res) {
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
