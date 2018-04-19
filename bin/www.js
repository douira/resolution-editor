#!/usr/bin/env node
/*jshint esversion: 6, node: true */
const app = require("../app");
const { logger } = require("../lib/logger");
const db = require("../lib/database");

//normalizes a port into a number, string, or false
function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

//Get port from environment and store in Express.
const port = normalizePort(process.env.PORT || "3000");
app.set("port", port);

//wait for database to finish loading
db.fullInit.then(() => {
  //create HTTP server
  const server = app.listen(port);

  //give server to liveview to attach websockets
  require("../routes/liveview").giveHttpServer(server);

  //http server error handler
  server.on("error", error => {
    if (error.syscall !== "listen") {
      throw error;
    }

    const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
      case "EACCES":
        logger.fatal(bind + " requires elevated privileges");
        process.exit(1);
        break;
      case "EADDRINUSE":
        logger.fatal(bind + " is already in use");
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  //server starts listening handler
  server.on("listening", () => {
    //print message
    const addr = server.address();
    const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
    logger.info("Listening on " + bind);

    //only if process send if possible
    if (process.send) {
      //when database is done loading, notify process manager of start
      db.dbPromise.then(() => process.send("ready"));
    }
  });

  //listen on process close signals
  process.on("SIGINT", () =>
    //require client to be present
    db.dbClient.close().then(
      //exit process
      () => process.exit(),

      //error exititing db connection
      err => {
        logger.error("could not end db connection", { stack: err.stack });
        process.exit(1);
      }
    )
  );
});

