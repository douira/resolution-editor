/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

//GET textbox page
router.get("/", function(req, res) {
  //render textbox page
  res.render("handytextbox");
});
