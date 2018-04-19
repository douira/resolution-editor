/*jshint esversion: 6, node: true */
const MongoClient = require("mongodb").MongoClient;
const credentials = require("../lib/credentials");
const { logger } = require("../lib/logger");
const co = require("co");

//module exports two promises, full init and db connection
module.exports = { };

//intervall time between tries (in ms)
const dbConnectTryInterval = 1000;

//maximum amount of connection attempts to make
const maxAttempts = 15;

//tries to connect to the database once, retries if it fails
function attemptDBConnect(resolve, reject, attemptCount) {
  //default to attempt 1 if not given
  attemptCount = attemptCount || 1;

  //error and stop on reached max attempts
  if (attemptCount > maxAttempts) {
    //log error, reject and stop
    const msg = "Reached max number of db connect attempts: " + maxAttempts;
    logger.fatal(msg);
    reject(msg);
    return;
  }

  //make a connection to the db server
  MongoClient.connect(`mongodb://resolutionEditor:${
    credentials.dbUserPassword}@localhost:27017/resolution-editor`).then(
    //resolve on made connection
    client => {
      console.log(client);
      resolve(client);
    },

    //try again on error
    err => {
      //check that it is a network error
      if (err && err.name === "MongoNetworkError") {
        //log error
        logger.warn(
          "error connecting to db, trying again. attempt #" + attemptCount, { stack: err.stack });

        //try again in dbConnectTryInterval
        setTimeout(attemptDBConnect, dbConnectTryInterval, resolve, reject, ++attemptCount);
      } else {
        //other problem, log and reject
        logger.fatal("Could not connect to mongodb", { stack: err.stack });
        reject(err);
      }
    }
  );
}

//has a complicated promise strcuture
module.exports.fullInit = co(function*() {
  //wait for a connection to be established
  let db;
  try {
    /*
    We need to only use one yield here because if the client promise
    is yielded as well, then co returns and halts execution of this file
    allowing app.js to try to create a session store and fail because the
    db promise is created laster. (and I wanted to avoid making a promise to return a promise)
    */
    db = yield (module.exports.dbPromise = new Promise(attemptDBConnect).then(client => {
        logger.info("connected to database, setting up connection and indexes");

        //export client
        module.exports.dbClient = client;

        //return database
        return client.db("resolution-editor");
      })
    );
  } catch (err) {
    logger.fatal("mongo connection error", { stack: err.stack });
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
    logger.fatal("failed to init collection indexes", { stack: err.stack });
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
    logger.fatal("db-emptying error", { stack: err.stack });
  }*/

  //map to collections
  logger.info("retrieving collections");
  const collections = {};
  try {
    (yield db.listCollections().toArray())
      .forEach(collInfo => collections[collInfo.name] = db.collection(collInfo.name));
  } catch (err) {
    logger.fatal("mongo list collections error", { stack: err.stack });
  }

  //info on done initing database
  logger.info("db done initializing");

  //return collections to be used by module users
  return Promise.resolve(collections);
}).catch(err => logger.fatal("db init procedure error", { stack: err.stack }));
