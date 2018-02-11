/*jshint esversion: 6, node: true */
const devEnv = require("../lib/devEnv");
const bunyan = require("bunyan");
const morgan = require("morgan");
const fs = require("fs-extra");
const rfs = require("rotating-file-stream");
const uuidv4 = require("uuid/v4");
const path = require("path");

//logging dir paths
const loggingDir =  {
  root: path.join(__dirname, "../log")
};
loggingDir.access = path.join(loggingDir.root, "access");
loggingDir.events = path.join(loggingDir.root, "events");

//setup directory for logging
try {
  fs.ensureDirSync(loggingDir.access);
  fs.ensureDirSync(loggingDir.events);
} catch (err) {
  console.error("failed to init logging directory");
}

//rotating logger config
const logStreamConfig = {
  interval: "1d", //rotate daily
  size: "10M", //also rotate when the file reaches 10 megabytes
  initialRotation: true //make sure log writes go in the right file
};

//rotating logger that makes a new file after a while
const accessLogStream = rfs("access.log", Object.assign(
  { path: loggingDir.access }, logStreamConfig
));

//events logger stream
const eventsLogStream = rfs("events.log", Object.assign(
  { path: loggingDir.events }, logStreamConfig
));

//array of logger streams
const loggerStreams = [
  {
    //regular log to event file
    level: "info",
    stream: eventsLogStream
  }
];

//add console output stream in dev mode
if (devEnv) {
  loggerStreams.push({
    //dev stream to console
    level: "debug",
    stream: process.stdout
  });
}

//setup bunyan event logger
const logger = bunyan.createLogger({
  name: "resolution-editor",
  streams: loggerStreams,
  serializers: bunyan.stdSerializers
});

//function that is called by the app to apply the logging middleware to the express stack
function applyLoggerMiddleware(app) {
  //complete console logging when in dev env
  app.use(morgan("dev", {
    //only log errors to console if in production
    skip: (req, res) => ! devEnv && res.statusCode < 400,
    stream: process.stdout
  }));

  //give logger file stream to access logger middleware
  app.use(morgan("common", { stream: accessLogStream }));

  //add child logger as middleware to express
  app.use(function(req, res, next) {
    //add bound field reqId to chain all log entries for a single request
    req.log = logger.child({ req_id: uuidv4() });

    //continue app stack
    next();
  });
}

//export event logger and middleware applier
module.exports = { logger: logger, applyLoggerMiddleware };
