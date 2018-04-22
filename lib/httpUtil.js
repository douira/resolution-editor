/*jshint esversion: 6, node: true */
const { logger } = require("../lib/logger");
module.exports = {};

//normalizes a port into a number, string, or false
module.exports.normalizePort = val => {
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
};

//register handlers on the given server
module.exports.applyServerListeners = (server, port) => {
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
      //notify process manager of start,
      //db has implicitly finished loading, this is inside fullInit
      process.send("ready");
    }
  });
};
