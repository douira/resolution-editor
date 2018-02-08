/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

//GET front page
router.get("/", function(req, res) {
  //render page with token for resolution
  res.render("index", { promo: true });
});

//respond with env variable, for checking if the env was set correctly
//updated every tiem the server starts, doesn't change more than that anyway
const nodeEnv = process.env.NODE_ENV;
router.get("/env", function(req, res) {
  //send env as plain text
  res.send("NODE_ENV=" + nodeEnv);
});
