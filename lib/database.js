/*jshint esversion: 6, node: true */
const MongoClient = require("mongodb").MongoClient;
const credentials = require("../lib/credentials");

//callbacks to call on loading of db
const callbackOnLoad = [];

//adds to list of load callbacks
module.exports = (c) => callbackOnLoad.push(c);

//catches index creation errors
function catchIndexCreationError(err) {
  console.error("index creation error", err);
}

//connect to mongodb
MongoClient.connect(`mongodb://resolutionEditor:${
                    credentials.dbUserPassword}@localhost:27017/resolution-editor`)
.then(db => {
  //init indexes on collections
  db.collection("resolutions").createIndex({ token: "text" }, { unique: true })
    .catch(catchIndexCreationError);
  db.collection("access").createIndex({ code: "text" }, { unique: true })
    .catch(catchIndexCreationError);

  //isn't unique because the resolutions that are put in here
  //can have tokens that were already released back and then re-used
  db.collection("resolutionArchive").createIndex({ token: "text" })
    .catch(catchIndexCreationError);

  //get collections of database
  db.listCollections().toArray().then(collInfos => {
    //map to collections
    const collections = {};
    collInfos.forEach((info) => collections[info.name] = db.collection(info.name));

    //call callacks on connection established
    callbackOnLoad.forEach((c) => c(collections));
  }, (err) => console.error("mongo list collections error", err));
}, (err) => console.error("mongo connect error", err));
