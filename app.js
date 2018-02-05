/*jshint esversion: 6, node: true */
const express = require("express");
const path = require("path");
const compression = require("compression");
const favicon = require("serve-favicon");
const logger = require("morgan");
const session = require("express-session");
const MongoStore = require("connect-mongo")(session);
const bodyParser = require("body-parser");
const credentials = require("./lib/credentials");
const dbPromise = require("./lib/database").promise;

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
const app = express();

//view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

//register express middleware
app.use(compression());
app.use(logger("dev"));
app.use(favicon(path.join(__dirname, "public/favicon", "favicon.ico")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
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
app.use(express.static(path.join(__dirname, "public")));

//attach routes
app.use("/", index);
app.use("/help", help);
app.use("/resolution", resolution);
app.use("/handytextbox", handytextbox);
app.use("/list", list);
app.use("/session", sessionRoute);

//catch 404 and forward to error handler
app.use(function(req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

//error handler
app.use(function(err, req, res) {
  //set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  //render the error page
  res.status(err.status || 500);
  res.render("error");

  //also log error to console
  console.error(err);
});

module.exports = app;
