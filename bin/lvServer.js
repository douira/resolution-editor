#!/usr/bin/env node
const { createServer } = require("http");
const { logger } = require("../lib/logger");
const { normalizePort, applyServerListeners } = require("../lib/httpUtil");
const lvWS = require("../lib/lvWS");

//start message for log
logger.info("start program");

//for db promise fll init wait
const db = require("../lib/database");

//register process stop listener
require("../lib/processStop.js");

//Get port from environment, 17750 is default for lv server
const port = normalizePort(process.env.PORT || "17750");

//wait for database to finish loading
db.fullInit.then(() => {
  //create a http server to bind the lv handler on
  const server = createServer();

  //pass the server to th lv websocket handler
  lvWS(server);

  //start listening for connections
  server.listen(port);

  //apply extra error and startup handlers to server
  applyServerListeners(server, port);
});
