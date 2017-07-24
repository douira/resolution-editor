/*jshint asi: false, esnext: true, node: true, indent: 2*/
const express = require("express");
const router = module.exports = express.Router();

/* POST generate pdf. */
router.post("/", function(req, res, next) {
  console.log(req.body);
  //res.render("index");
});
