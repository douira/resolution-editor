/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

/* GET home page. */
router.get("/", function(req, res, next) {
  res.render("index");
});
