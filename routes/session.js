/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const routingUtil = require("../lib/routingUtil");
const credentials = require("../lib/credentials");
const resUtil = require("../lib/resUtil");
const { issueError } = require("../lib/logger");

//get resolutions collection
let access;
require("../lib/database").fullInit.then(collections => {
  access = collections.access;
});

//GET session display info
router.get("/", function(req, res) {
  //require session auth
  routingUtil.requireSession("any", req, res, codeDoc => {
    //render info page
    res.render("sessioninfo", codeDoc);
  });
});

//GET display enter access code page
router.get("/login", function(req, res) {
  //wether or not there is an existing session
  const renderOpts = { loggedIn: typeof req.session.code === "string" };

  //add code doc if logged in
  if (renderOpts.loggedIn) {
    //add code doc (code and level)
    renderOpts.code = req.session.code;
    renderOpts.level = req.session.doc.level;
  }

  //render login page with code input, notfiy if already logged in
  res.render("login", renderOpts);
});

//POST access code to auth
router.post("/open", function(req, res) {
  //code must be valid, any valid code can create a session
  routingUtil.checkCode(req, res, codeDoc => {
    //register permission in session
    req.session.doc = codeDoc;
    req.session.code = codeDoc.code;

    //extend with field session to make sure we can distinguish normal and session code docs
    req.session.doc.isSessionDoc = true;

    //redirect to where the get query param backto refers to, use main page as default
    res.redirect((req.query && req.query.backto) || "/");
  });
});

//GET closes login and directs to login page
router.get("/logout", function(req, res) {
  //destroy the session and redirect to login
  req.session.destroy(() => res.redirect("/session/login"));
});

//GET a master code with the key stored in keys.json
router.get("/getaccess/" + credentials.makeCodesSuffix, function(req, res) {
  //try to find a existing MA code
  access.findOne({
    level: "MA"
  }).then(
    result => {
      //if there is a result
      if (result) {
        //respond with gotten code
        res.send("MA: " + result.code);
      } else {
        //make a new valid code
        resUtil.makeNewThing(res, false).then(code =>
          //add to the database
          access.insertOne({ level: "MA", code: code }).then(
            //respond with code as content
            () => res.send("MA: " + code),
            err => issueError(res, 500, "Error inserting getaccess code", err))
        );
      }
    },
    err => issueError(res, 500, "could not check for existing code in getaccess", err)
  );
});
