/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const { logger: libLogger, issueError } = require("../lib/logger");

//create a child logger for clients
const logger = libLogger.child({ source: "client" });

//POST an error
router.post("/", function(req, res) {
  //if content is given and messages array present
  if (req.body && req.body.messages && req.body.messages.length) {
    //get messages
    const { messages } = req.body;

    //log all messages individually
    messages.forEach(msg => logger.error(msg, "client error"));

    //respond with ok
    res.send("ok");
  } else {
    //invalid request
    issueError(req, res, 400, "invalid logging request");
  }
});
