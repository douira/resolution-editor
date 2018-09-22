const express = require("express");
const router = module.exports = express.Router();
const extDataPromise = require("../lib/extData");
const phrases = require("../public/phrases.json");

//GET render front page with token for resolution
router.get("/", (req, res) => res.render("index", { promo: true }));

//respond with env variable, for checking if the env was set correctly
//updated every time the server starts, doesn't change more than that anyway
const nodeEnv = process.env.NODE_ENV;

//send env as plain text
router.get("/env", (req, res) => res.send(`NODE_ENV=${nodeEnv}`));

//wait for extData to load
const extDataDone = extDataPromise.then(extData => {
  //attach ext data forums and countries to phrases
  phrases.forumsFlat = extData.forumsFlat;
  phrases.countriesFlat = extData.countriesFlat;

  //return extended data to be served to clients
  return phrases;
});

//GET send external data (forum names, countries and phrases)
router.get("/extData", (req, res) => extDataDone.then(data => res.send(data)));
