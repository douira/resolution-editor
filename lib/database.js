/*jshint esversion: 6, node: true */
const MongoClient = require("mongodb").MongoClient;
const credentials = require("../lib/credentials");
const { logger } = require("../lib/logger");
const co = require("co");

//module exports two promises, full init and db connection
module.exports = { };

//has a complicated promise strcuture
module.exports.fullInit = co(function*() {
  //wait for connection to be established
  let db;
  try {
    //connect to mongodb and export promise
    db = yield (module.exports.dbPromise = MongoClient.connect(`mongodb://resolutionEditor:${
      credentials.dbUserPassword}@localhost:27017/resolution-editor`));
  } catch (err) {
    logger.fatal(err, "mongo connection error");
  }

  //init indexes on collections
  try {
    yield [
      db.collection("resolutions").createIndex({ token: "text" }, { unique: true }),

      //collection of access codes
      db.collection("access").createIndex({ code: "text" }, { unique: true }),

      //stores the id counter for each year
      db.collection("resolutionId").createIndex({ year: 1 }, { unique: true }),

      //metadata counters uses the _id as the name of the coutner, no init necessary

      //index also on stages for stats and print queue
      db.collection("resolutions").createIndex({ stage: 1 }),

      //index for session autoremove, this is exactly like it is in the source of connect-mongo
      db.collection("sessions").createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),

      //isn't unique because the resolutions that are put in here
      //can have tokens that were already released back and then re-used
      db.collection("resolutionArchive").createIndex({ token: "text" })
    ];
  } catch (err) {
    logger.fatal(err, "failed to init collection indexes");
  }

  //start server with this uncommented to clear the database without removing the data folder
  /*try {
    yield [
      //db.collection("access").deleteMany({})
      //db.collection("resolutions").deleteMany({}),
      //db.collection("resolutionArchive").deleteMany({}),
      //db.collection("resolutionId").deleteMany({}),
      //db.collection("metadata").deleteMany({}),
      //db.collection("sessions").deleteMany({}),
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

  //init collection contents
  yield [
    //create id document for this year if it doesn't exist yet
    //and reset it to start at id 1 if it hasn't been set to anything else yet
    collections.resolutionId.updateOne({ year: new Date().getFullYear() }, {
      //only set if a new id document is created
      $setOnInsert: { counter: 1 }
    }, { upsert: true }).catch(err => logger.fatal(err, "mongo init resolutionId error")),

    //metadata should be inited at 0, we don't know if the collection exists yet
    db.collection("metadata").updateOne({ _id: "codeInsertGroupCounter" }, {
      //only set if a new counter document is created
      $setOnInsert: { value: 0 }
    }, { upsert: true }).catch(err => logger.fatal(err, "mongo init codeInsertGroupCounter error")),
  ];

  //return collections to be used by module users
  return Promise.resolve(collections);
}).catch(err => logger.fatal(err, "db init procedure error"));
