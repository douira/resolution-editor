/*jshint esversion: 6, node: true */
const mongo = require("mongodb");

//export object that will have the database driver attached
const exposed = {
  onload: false,
  db: null
};

//expose for export
module.exports = exposed;

//connect to mongodb
mongo.connect("mongodb://localhost:27017/resolution-editor", (err, db) => {
  if (err) {
    throw err;
  }

  //init indexes on collections
  db.collection("resolutions").createIndex({ token: "text" });
  db.collection("access").createIndex({ code: "text" });

  //make database available after connecting
  exposed.db = db;

  //call callack on connection established
  if (exposed.onload) {
    exposed.onload(db);
  }
});
