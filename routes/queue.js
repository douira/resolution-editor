/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

//GET display enter access code page
router.get("/print", function(req, res) {
  res.render("printqueueopen");
});

//POST secreteriat print queue page, gets code from post
router.post("/print", function(req, res) {

});
