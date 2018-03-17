/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const routingUtil = require("../lib/routingUtil");

//const { issueError } = require("../lib/logger");

//GET display enter access code page
router.get("/login", function(req, res) {
  //render login page with code input, notfiy if already logged in
  res.render("login", { loggedIn: typeof req.session.code === "string" });
});

//POST access code to auth
router.post("/open", function(req, res) {
  //do code auth and require admin access level
  routingUtil.checkCodeStaticPerm(req, res, "admin", codeDoc => {
    //register permission in session
    req.session.doc = codeDoc;
    req.session.code = codeDoc.code;

    //extend with field session to make sure we can distinguish normal and session code docs
    req.session.doc.isSessionDoc = true;

    //redirect to where the get query param backto refers to, use /list/overview as default
    res.redirect(req.query.backto || "/list/overview");
  }, () => res.render("weakperm", { type: "adminlogin" })); //render weakperm instead
});

//GET closes login and directs to login page
router.get("/logout", function(req, res) {
  //destroy the session and redirect to login
  req.session.destroy(() => res.redirect("/session/login"));
});
