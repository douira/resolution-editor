/*jshint esversion: 6, node: true */
const mongo = require("mongodb");

//callbacks to call on loading of db
const callbackOnLoad = [];

//adds to list of load callbacks
module.exports = (c) => callbackOnLoad.push(c);

//connect to mongodb
mongo.connect("mongodb://localhost:27017/resolution-editor", (err, db) => {
  if (err) {
    throw err;
  }

  //get collections of database
  db.listCollections().toArray((err, collInfos) => {
    if (err) {
      throw err;
    }

    //map to collections
    const collections = {};
    collInfos.forEach((info) => collections[info.name] = db.collection(info.name));

    //init indexes on collections
    collections.resolutions.createIndex({ token: "text" });
    collections.access.createIndex({ code: "text" });

    //call callacks on connection established
    callbackOnLoad.forEach((c) => c(collections));
  });
});
