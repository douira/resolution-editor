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

//require route controllers
const index = require("./routes/index");
const help = require("./routes/help");
const resolution = require("./routes/resolution");
const handytextbox = require("./routes/handytextbox");
const list = require("./routes/list");
const sessionRoute = require("./routes/session");

//start database connection
require("./lib/database");

//make express app
const app = module.exports = express();

//view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

//check if we are in a dev environment, unefined if not set and in dev env
const devEnv = ! process.env.NODE_ENV;

//register express middleware
app.use(compression()); //use compression to make it faster

//complete console logging when in dev env
app.use(morgan("dev", {
  //only log errors to console if in production
  skip: (req, res) => devEnv || res.statusCode < 400
}));

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

//rotating logger that makes a new file after a while
const accessLogStream = rfs("access.log", {
  interval: "1d", //rotate daily
  path: loggingDir.access,
  size: "10M", //also rotate when the file reaches 10 megabytes
  initialRotation: true //make sure log writes go in the right file
});
app.use(morgan("common", { stream: accessLogStream }));

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

//static serve on anything in /public
app.use(express.static(path.join(__dirname, "public")));

//attach routes
app.use("/", index);
app.use("/help", help);
app.use("/resolution", resolution);
app.use("/handytextbox", handytextbox);
app.use("/list", list);
app.use("/session", sessionRoute);

//catch 404 and forward to error handler
app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

//error handler
app.use((err, req, res) => {
  //render the error page
  res.status(err.status || 500);
  res.render("error", {
    error: devEnv ? err : {}, //only provide error detail in dev
    message: devEnv && err.message
  });

  //also log error to console
  console.error(err);
});
