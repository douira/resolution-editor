/*jshint esversion: 6, node: true */
const express = require("express");
const path = require("path");
const compression = require("compression");
const favicon = require("serve-favicon");
const morgan = require("morgan");
const session = require("express-session");
const MongoStore = require("connect-mongo")(session);
const bodyParser = require("body-parser");
const credentials = require("./lib/credentials");
const dbPromise = require("./lib/database").promise;
const fs = require("fs-extra");
const rfs = require("rotating-file-stream");
const mongoSanitize = require("express-mongo-sanitize");
const uuidv4 = require("uuid/v4");
const bunyan = require("bunyan");

//require route controllers
const index = require("./routes/index");
const help = require("./routes/help");
const resolution = require("./routes/resolution");
const handytextbox = require("./routes/handytextbox");
const list = require("./routes/list");
const sessionRoute = require("./routes/session");

//make express app
const app = express();

//expose object with app router
module.exports = {
  router: app
};

//view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

//check if we are in a dev environment, unefined if not set and in dev env
const devEnv = ! process.env.NODE_ENV;

//register express middleware
app.use(compression()); //use compression to make it faster

//prevent mongodb query injection
app.use(mongoSanitize({
  replaceWith: "___" //something that can be easily found
}));

//complete console logging when in dev env
if (devEnv) {
  app.use(morgan("dev", {
    //only log errors to console if in production
    skip: (req, res) => devEnv || res.statusCode < 400
  }));
}

//logging dir paths
const loggingDir =  {
  root: path.join(__dirname, "log")
};
loggingDir.access = path.join(loggingDir.root, "access");
loggingDir.events = path.join(loggingDir.root, "events");

//setup directory for logging
try {
  fs.ensureDirSync(loggingDir.access);
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

//give logger file stream to access logger middleware
app.use(morgan("common", { stream: accessLogStream }));

//events logger stream
const eventsLogStream = rfs("access.log", Object.assign(
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

//add logger to exported object
module.exports.logger = logger;

//add child logger as middleware to express
app.use(function(req, res, next) {
  //add bound field reqId to chain all log entries for a single request
  req.log = logger.child({ req_id: uuidv4() });

  //continue app stack
  next();
});

//static favicon serve
app.use(favicon(path.join(__dirname, "public/favicon", "favicon.ico")));

//parse post bodies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//register session parser
app.use(session({
  secret: credentials.cookieSecret,
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    dbPromise: dbPromise, //pass the already created mongodb connection promise
    autoRemove: "disabled", //we implement our own removal index
    collection: "sessions", //make sure this collection is used

    //more efficient if not stringyfied for every save, mongodb can handle nested objects!
    stringify: false,

    //define ttl to limit length of non-persistent session
    ttl: 1000 * 60 * 60 * 24 //one day
  })
  //non-persistent session
}));

//set specific caching params if in production mode
if (! devEnv) {
  //cache regular content for a week, see pug mixin static for cache busting
  app.use(express.static(path.join(__dirname, "public"), { maxage: "7d" }));
} else {
  //static serve on anything in public with no caching in dev mode
  app.use(express.static(path.join(__dirname, "public")));
}

//attach routes
app.use("/", index);
app.use("/help", help);
app.use("/resolution", resolution);
app.use("/handytextbox", handytextbox);
app.use("/list", list);
app.use("/session", sessionRoute);

//catch 404 and forward to error handler
app.use((req, res) => {
  //make an error
  const err = Error("Not Found");
  err.status = 404;

  //send the error page
  res.status(err.status);
  res.render("error", {
    error: err,
    devEnv: devEnv
  });
});

//general error handler, express needs the error handler signature to be exactly like this!
//the default error page is displayed too sometimes though, when worse errors happen
app.use((err, req, res, next) => { //jshint ignore: line
  //render the error page
  res.status(err.status || 500);
  res.render("error", {
    error: err,
    devEnv: devEnv
  });

  //also log error to console
  logger.error(err);
});
