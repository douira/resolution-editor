/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const resUtil = require("../lib/resUtil");

const issueError = resUtil.issueError;

//GET display enter access code page
router.get("/print", function(req, res) {

});

