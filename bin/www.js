#!/usr/bin/env node
const { logger } = require("../lib/logger");
const { createServer } = require("http");

//log start message
logger.info("start program");

//require other parts
const app = require("../app");
const db = require("../lib/database");
const { normalizePort, applyServerListeners } = require("../lib/httpUtil");
const lvWS = require("../lib/lvWS");

//register process stop listener
require("../lib/processStop.js");

//get port from environment and store in express
const port = normalizePort(process.env.PORT || "3000");
app.set("port", port);

//wait for database to finish loading
db.fullInit.then(() => {
  //create HTTP server
  const server = createServer(app);

  //check of env variable disabling lv websockets is not set
  if (process.env.WS_LV === "off") {
    //attach liveview websocket handler to server
    lvWS(server);
  }

  //start lisening on connections
  server.listen(port);

  //apply extra error and startup handlers to server
  applyServerListeners(server, port);
});
