/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

//GET help page
router.get("/", function(req, res, next) {
  //render help page
  res.render("help");
});
