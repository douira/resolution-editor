/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const resolutionFormat = require("../public/js/resolutionFormat");
const phrases = require("../public/phrases.json");

//GET help page
router.get("/", function(req, res) {
  //render help page
  res.render("help", { phrases });
});

//GET resolution stucture definition
router.get("/formatdefinition", function(req, res) {
  //render help page
  res.render("formatdefinition", {
    data: resolutionFormat.resolutionFileFormat,
    dataJson: JSON.stringify(resolutionFormat.resolutionFileFormat, null, 2)
  });
});

//GET content guideliens page (static)
router.get("/contentguidelines", function(req, res) {
  //render page
  res.render("contentguidelines");
});
