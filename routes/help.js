/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const resolutionFormat = require("../public/js/resolutionFormat").resolutionFormat;

//GET help page
router.get("/", function(req, res, next) {
  //render help page
  res.render("help");
});

//GET resolution stucture definition
router.get("/formatdefinition", function(req, res, next) {
  //render help page
  res.render("formatdefinition", {
    data: JSON.stringify(resolutionFormat.resolutionFileFormat, null, 2)
  });
});
