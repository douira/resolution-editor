/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const resUtil = require("../lib/resUtil");

const issueError = resUtil.issueError;

//GET display enter access code page
router.get("/login", function(req, res) {
  //render login page with code input
  res.render("login");
});

//POST access code to auth
router.post("/open", function(req, res) {
  //do code auth and require admin access level
  resUtil.checkCodeStaticPerm(req, res, "admin", codeDoc => {
    //register permission in session
    req.session.code = codeDoc.code;

    //redirect to where the get query param backto refers to, use /list/overview as default
    res.redirect(req.query.backto || "/list/overview");
  }, codeDoc => res.render("weakperm", { type: "adminlogin" })); //render weakperm instead
});

//GET closes login and directs to login page
router.get("/logout", function(req, res) {
  //destroy the session and redirect to login
  req.session.destroy(() => res.redirect("/session/login"));
});
