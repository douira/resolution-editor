/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

/* GET home page. */
router.get("/", function(req, res, next) {
  //render page with token for resolution
  res.render("index", { promo: true });
});
