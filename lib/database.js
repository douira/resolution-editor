/*jshint esversion: 6, node: true */
const mongo = require("mongodb");
console.log("required");
//connect to mongodb
mongo.connect("mongodb://localhost:27017/resolution-editor", (err, db) => {
  if (err) {
    throw err;
  }
  console.log("connected");

  //init indexes on collections
  db.collection("resolutions").createIndex({ token: "text" });

  //make database available after connecting
  module.exports = db;
});

