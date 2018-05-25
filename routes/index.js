/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const extDataPromise = require("../lib/extData");
const phrases = require("../public/phrases.json");

//GET front page
router.get("/", function(req, res) {
  //render page with token for resolution
  res.render("index", { promo: true });
});

//respond with env variable, for checking if the env was set correctly
//updated every time the server starts, doesn't change more than that anyway
const nodeEnv = process.env.NODE_ENV;
router.get("/env", function(req, res) {
  //send env as plain text
  res.send("NODE_ENV=" + nodeEnv);
});

//wait for extData to load
const extDataDone = extDataPromise.then(extData => {
  //attach ext data forums and countries to phrases
  phrases.forumsFlat = extData.forumsFlat;
  phrases.countriesFlat = extData.countriesFlat;

  //return extended data to be served to clients
  return phrases;
});

//GET external data (forum names and countries and later also phrases)
router.get("/extData", function(req, res) {
  //send extended extData
  extDataDone.then(data => res.send(data));
});
