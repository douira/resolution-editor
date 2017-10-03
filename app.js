/*jshint esversion: 6, node: true */
const express = require("express");
const path = require("path");
const compression = require("compression");
const favicon = require("serve-favicon");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");

const index = require("./routes/index");
const resolution = require("./routes/resolution");

//start database connection
const db = require("./lib/database");

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
app.use(cookieParser());
app.use("/resolution", express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", index);
app.use("/resolution", resolution);

//catch 404 and forward to error handler
app.use(function(req, res, next) {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

//error handler
app.use(function(err, req, res, next) {
  //set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  //render the error page
  res.status(err.status || 500);
  res.render("error");

  //also log error to console
  console.log(err);
});

module.exports = app;
