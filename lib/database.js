/*jshint esversion: 6, node: true */
const MongoClient = require("mongodb").MongoClient;
const credentials = require("../lib/credentials");
const { logger } = require("../lib/logger");
const co = require("co");

//module exports two promises, full init and db connection
module.exports = { };

//has a complicated promise strcuture
module.exports.fullInit = co(function*() {
  //wait for a connection to be established
  let db;
  try {
    //connect to mongodb and export promise
    db = yield (
      //export the db promise: then to return unpacking promise
      module.exports.dbPromise = MongoClient.connect(`mongodb://resolutionEditor:${
        credentials.dbUserPassword}@localhost:27017/resolution-editor`)
      .then(client => client.db())
    );
  } catch (err) {
    logger.fatal(err, "mongo connection error");
  }

  //init indexes on collections or ceaate collections
  try {
    yield [
      db.collection("resolutions").createIndex({ token: "text" }, { unique: true }),

      //collection of access codes
      db.collection("access").createIndex({ code: "text" }, { unique: true }),

      //stores the id counter for each year
      db.collection("resolutionId").createIndex({ year: 1 }, { unique: true }),

      //create metadata counters collection
      db.createCollection("metadata"),

      //index also on stages for stats and print queue
      db.collection("resolutions").createIndex({ stage: 1 }),

      //index for session autoremove, this is exactly like it is in the source of connect-mongo
      db.collection("sessions").createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),

      //isn't unique because the resolutions that are put in here
      //can have tokens that were already released back and then re-used
      db.collection("resolutionArchive").createIndex({ token: "text" }),

      //create booklets collection
      db.createCollection("booklets")
    ];
  } catch (err) {
    logger.fatal(err, "failed to init collection indexes");
  }

  //start the server with this uncommented to clear the database without removing the data folder
  /*try {
    yield [
      //db.collection("access").deleteMany({}),
      //db.collection("resolutions").deleteMany({}),
      //db.collection("resolutionArchive").deleteMany({}),
      //db.collection("resolutionId").deleteMany({}),
      //db.collection("metadata").deleteMany({}),
      //db.collection("sessions").deleteMany({}),
      //db.collection("booklets").deleteMany({}),
    ];
  } catch (err) {
    logger.fatal(err, "db-emptying error");
  }*/

  //map to collections
  const collections = {};
  try {
    (yield db.listCollections().toArray())
      .forEach(collInfo => collections[collInfo.name] = db.collection(collInfo.name));
  } catch (err) {
    logger.fatal(err, "mongo list collections error");
  }

  //return collections to be used by module users
  return Promise.resolve(collections);
}).catch(err => logger.fatal(err, "db init procedure error"));
