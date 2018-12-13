const express = require("express");
const path = require("path");
const compression = require("compression");
const favicon = require("serve-favicon");
const session = require("express-session");
const MongoStore = require("connect-mongo")(session);
const credentials = require("./lib/credentials");
const { dbPromise, sessionExpireSeconds } = require("./lib/database");
const mongoSanitize = require("express-mongo-sanitize");
const getTimeText = require("./public/js/getTimeText");
const devEnv = require("./lib/devEnv");
const { logger, applyLoggerMiddleware } = require("./lib/logger");
const pick = require("object.pick");

//require route controllers
const index = require("./routes/index");
const help = require("./routes/help");
const resolution = require("./routes/resolution");
const handytextbox = require("./routes/handytextbox");
const list = require("./routes/list");
const sessionRoute = require("./routes/session");
const logRoute = require("./routes/log");

//make express app
const app = express();
module.exports = app;

//view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

//add libraries that should be available within the templates
app.locals.getTimeText = getTimeText;

//if we are serving external libaries ourselves now
app.locals.serveLocalExt = process.env.SERVE_LOCAL === "on";

//register express middleware
app.use(compression()); //use compression to make it faster

//prevent mongodb query injection
app.use(mongoSanitize({
  replaceWith: "___" //something that can be easily found
}));

//apply logger middlewares to app
applyLoggerMiddleware(app);

//static favicon serve
app.use(favicon(path.join(__dirname, "public/favicon", "favicon.ico")));

//parse post bodies
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//register session parser
app.use(session({
  secret: credentials.cookieSecret,
  resave: false,
  saveUninitialized: false,
  //rolling: true, //reset ttl on every opening of a page
  store: new MongoStore({
    dbPromise, //pass the already created mongodb connection promise
    autoRemove: "disabled", //we implement our own removal index in database.js
    collection: "sessions", //make sure this collection is used

    //more efficient if not stringyfied for every save, mongodb can handle nested objects!
    stringify: false,

    //expire after specified time
    ttl: sessionExpireSeconds
  })
}));

//material icons installed in modules
app.use(
  "/materialicons",
  express.static(path.join(__dirname, "node_modules/@mdi/font/"), { maxage: "7d" }));

//set specific caching params if in production mode
if (devEnv) {
  //static serve on anything in public with no caching in dev mode
  app.use(express.static(path.join(__dirname, "public")));
} else {
  //cache regular content for a week, see pug mixin static for cache busting
  app.use(express.static(path.join(__dirname, "public"), { maxage: "7d" }));
}

//attach request local session info
app.use((req, res, next) => {
  //check for present code in session
  if (typeof req.session.code === "string") {
    //attach simple session info
    res.locals.loggedIn = true;
    res.locals.sessionCode = req.session.code;
    res.locals.sessionLevel = req.session.doc.level;
  } else {
    res.locals.loggedIn = false;
  }

  //continue processing request
  next();
});

//attach routes
app.use("/", index);
app.use("/help", help);
app.use("/resolution", resolution);
app.use("/handytextbox", handytextbox);
app.use("/list", list);
app.use("/session", sessionRoute);
app.use("/log", logRoute);

//catch 404 and forward to error handler
app.use((req, res) => {
  //make an error
  const err = Error("Not Found");
  err.status = 404;

  //send the error page
  res.status(err.status);
  res.render("error", {
    devEnv,
    error: err
  });
});

//general error handler, express needs the error handler signature to be exactly like this!
//the default error page is displayed too sometimes though, when worse errors happen
app.use(function(err, req, res, next) { //eslint-disable-line no-unused-vars, prefer-arrow-callback
  //render the error page
  res.status(err.status || 500);
  res.render("error", {
    error: err,
    devEnv
  });

  //log error with logger
  logger.error("express error", { stack: err.stack });
});
