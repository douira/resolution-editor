//See here for logging levels and their meaning: https://github.com/trentm/node-bunyan#levels

const devEnv = require("../lib/devEnv");
const winston = require("winston");
const morgan = require("morgan");
const fs = require("fs-extra");
const rfs = require("rotating-file-stream");
const path = require("path");

//logging dir paths
const loggingDir = {
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

//format used for timestamps
const timestampFormat = { format: "DD-MM-YYYY ddd HH:mm:ss.SSS" };

//a logger formatter that adds the pid to the log message object
const processPid = process.pid;
const addPid = winston.format(info => {
  //add pid
  info.pid = processPid;

  //return updated message object
  return info;
});

//create a new winston logger
const logger = winston.createLogger({
  //default npm levels extended with fatal which means the process has probably crashed
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    verbose: 4,
    debug: 5,
    silly: 6
  },
  level: "silly", //log all
  format: winston.format.combine(
    //add timestamp and print json
    addPid(),
    winston.format.timestamp(timestampFormat),
    winston.format.json()
  ),
  exitOnError: false,
  transports: [
    new winston.transports.File({
      filename: "./log/events/combined.log",
      level: "info"
    })
  ]
});

//add colors taking fatal into account
winston.addColors({
  fatal: "red bold"
});

//add console output transport if set
if (process.env.PRINT_ERR === "on") {
  //symbol for message prop
  const MESSAGE = Symbol.for("message");

  //add simple output for console
  logger.add(new winston.transports.Console({
    //display in a semi-nice way
    format: winston.format.combine(
      //add pid to message
      addPid(),

      //pass nice fecha formatting form
      winston.format.timestamp(timestampFormat),

      //colorize console output
      winston.format.colorize(),

      //nicely align messages
      winston.format.align(),

      //finally a custom solution to prepend the time
      //partially adapted from
      //https://github.com/winstonjs/logform
      //by Charlie Robbins under MIT license
      winston.format(info => {
        //get timestamp, attach space if present
        const timePrefix = info.timestamp ? `${info.timestamp} ` : "";

        //get error stack trace
        const stackTrace = info.stack ? `\n${info.stack}` : "";

        //remove toptions that should not be rendered
        delete info.level;
        delete info.message;
        delete info.splat;
        delete info.timestamp;
        delete info.stack;
        delete info.pid;

        //create the content suffix from any other remaining data passed
        const contentSuffix = JSON.stringify(info);

        //if what is left over is empty
        info[MESSAGE] = `${timePrefix}${info.pid} ${info.level}: ${info.message}${
          contentSuffix === "{}" ? "" : ` ${contentSuffix}`}${stackTrace}`;

        //return updated info object
        return info;
      })()
    ),

    //log everything
    level: "silly"
  }));
}

//handle uncaught exceptions
/*logger.exceptions.handle(
  new winston.transports.File({ filename: "./log/events/exceptions.log" })
);*/

//get flag value for LOG_NORM_ACCESS
const logNormAccess = process.env.LOG_NORM_ACCESS === "on";

//function that is called by the app to apply the logging middleware to the express stack
const applyLoggerMiddleware = app => {
  //complete console logging when in dev env
  app.use(morgan("dev", {
    //only log errors to console if in production
    skip: (req, res) => ! devEnv && ! logNormAccess && res.statusCode < 400,
    stream: process.stdout
  }));

  //give logger file stream to access logger middleware
  app.use(morgan("common", { stream: accessLogStream }));
};

//used for error codes in router responses
const issueError = (req, res, status, msg, ...otherArgs) => {
  //object with additional info passed to the logger
  const extraInfo = { };

  //if the first arg is given and is an error
  if (otherArgs.length && otherArgs[0] instanceof Error) {
    //remove from args and attach the stack trace to the extra info object
    extraInfo.stack = otherArgs.shift().stack;
  }

  //attach other args if still any present
  if (otherArgs.length) {
    //attach on data
    extraInfo.data = otherArgs;
  }

  //also log other arguments if given
  logger.error(msg, extraInfo);

  //send given message and status if res is an object
  if (res && typeof res === "object") {
    //catch duplicate send error
    try {
      res.status(status).send(`error: ${msg}`);
    } catch (err) {
      logger.error(
        "critical error logging other error because of duplicate response header set",
        { stack: err.stack }
      );
    }
  } //pass falsy value as res to prevent sending of error to client
};
//export event logger and middleware applier
module.exports = { logger, applyLoggerMiddleware, issueError };
