/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const { logger: libLogger, issueError } = require("../lib/logger");
const { getAndPost } = require("../lib/routingUtil");

//create a child logger for clients
const logger = libLogger.child({ source: "client" });

//POST or GET an error
getAndPost(router, "/", function(req, res) {
  //messages array
  let messages;

  //if content is given and messages array present
  if (req.body && req.body.messages && req.body.messages.length) {
    //unwrap from body
    messages = req.body.messages;
  } //alternatively allow passing of message as url object
  else if (req.query) {
    //use query as messages
    messages = req.query;
  }

  //convert to array if not array
  if (! (messages instanceof Array)) {
    //create a new array
    const newArr = [];

    //for every property of the object
    for (const prop in messages) {
      //add to array if numeric
      if (! isNaN(prop)) {
        newArr[prop] = messages[prop];
      }
    }

    //copy over
    messages = newArr;
  }

  //if messages given
  if (messages && messages.length) {
    //get user agent from headers
    const reqUserAgent = req.headers["user-agent"];

    //log all messages individually
    messages.forEach(msg => {
      //attach user agent
      msg.userAgent = reqUserAgent;

      //log message
      logger.error(msg, "client log message");
    });

    //respond with ok
    res.send("ok");
  } else {
    //invalid request
    issueError(req, res, 400, "invalid logging request");
  }
});
