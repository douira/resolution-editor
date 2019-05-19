const MongoClient = require("mongodb").MongoClient;
const credentials = require("../lib/credentials");
const { logger } = require("../lib/logger");
const co = require("co");

//time after which sessions expire and are removed
const sessionExpireSeconds = 60 * 60 * 5;

//module exports two promises, full init and db connection
module.exports = { sessionExpireSeconds };

//intervall time between tries (in ms)
const dbConnectTryInterval = 1000;

//maximum amount of connection attempts to make
const maxAttempts = 15;

//tries to connect to the database once, retries if it fails
const attemptDBConnect = (resolve, reject, attemptCount) => {
  //default to attempt 1 if not given
  attemptCount = attemptCount || 1;

  //error and stop on reached max attempts
  if (attemptCount > maxAttempts) {
    //log error, reject and stop
    const msg = `Reached max number of db connect attempts: ${maxAttempts}`;
    logger.fatal(msg);
    reject(msg);
    return;
  }

  //make a connection to the db server
  MongoClient.connect(
    `mongodb://resolutionEditor:${
      credentials.dbUserPassword
    }@localhost:27017/resolution-editor`,
    { useNewUrlParser: true }
  ).then(
    //resolve on made connection
    client => resolve(client),

    //try again on error
    err => {
      //check that it is a network error
      if (err && err.name === "MongoNetworkError") {
        //log error
        logger.warn(
          `error connecting to db, trying again. attempt #${attemptCount}`,
          { stack: err.stack }
        );

        //try again in dbConnectTryInterval
        setTimeout(
          attemptDBConnect,
          dbConnectTryInterval,
          resolve,
          reject,
          ++attemptCount
        );
      } else {
        //other problem, log and reject
        logger.fatal("Could not connect to mongodb", { stack: err.stack });
        reject(err);
      }
    }
  );
};

//has a complicated promise structure
module.exports.fullInit = co(function*() {
  //wait for a connection to be established
  let db;
  try {
    /*We need to only use one yield here because if the client promise
    is yielded as well, then co returns and halts execution of this file
    allowing app.js to try to create a session store and fail because the
    db promise is created later. (and I wanted to avoid making a promise to return a promise)
    no race condition can occur as nothing else modifies the db variable
    */
    //eslint-disable-next-line require-atomic-updates
    db = yield (module.exports.dbPromise = new Promise(attemptDBConnect).then(
      client => {
        logger.info("connected to database, setting up connection and indexes");

        //export client
        module.exports.dbClient = client;

        //return database
        return client.db("resolution-editor");
      }
    ));
  } catch (err) {
    logger.fatal("mongo connection error", { stack: err.stack });
  }

  //start the server with this uncommented to clear the database without removing the data folder
  /*try {
    yield [
      //db.collection("access").drop(),
      //db.collection("resolutions").drop(),
      //db.collection("resolutionArchive").drop(),
      //db.collection("resolutionId").drop(),
      //db.collection("metadata").drop(),
      //db.collection("sessions").drop(),
      //db.collection("booklets").drop(),
    ];
  } catch (err) {
    logger.fatal("db-emptying error", { stack: err.stack });
  }*/

  //init indexes on collections or create collections
  try {
    yield [
      db
        .collection("resolutions")
        .createIndex({ token: "text" }, { unique: true }),

      //collection of access codes
      db.collection("access").createIndex({ code: "text" }, { unique: true }),

      //stores the id counter for each year
      db.collection("resolutionId").createIndex({ year: 1 }, { unique: true }),

      //create metadata collection
      db.createCollection("metadata"),

      //index also on stages for stats and print queue
      db.collection("resolutions").createIndex({ stage: 1 }),

      //index for session autoremove
      db.collection("sessions").createIndex(
        //expire after specified time expire seems to work although the property isn't printed
        { expires: 1 },
        { expireAfterSeconds: sessionExpireSeconds }
      ),

      //isn't unique because the resolutions that are put in here
      //can have tokens that were already released back and then re-used
      db.collection("resolutionArchive").createIndex({ token: "text" }),

      //create booklets collection
      db.createCollection("booklets"),

      //create feedback collection
      db.createCollection("feedback")
    ];
  } catch (err) {
    logger.fatal("failed to init collections and indexes", {
      stack: err.stack
    });
  }

  //get full year
  const currentYear = new Date().getFullYear();

  //create resolution id doc, inserts only if not document present yet
  db.collection("resolutionId")
    .insertMany(
      [
        {
          year: currentYear,
          counter: 1
        },
        {
          //also insert next year to prepare for date change
          year: currentYear + 1,
          counter: 1
        }
      ],
      { ordered: false }
    )
    .catch(err => {
      //normalize error format, use write errors array if given
      const writeErrors = err.writeErrors || [err];

      //filter out any with code 11000 (duplicate key errors, expected in normal operation),
      //and handle the rest one by one
      writeErrors
        .filter(e => e.code !== 11000)
        .forEach(err =>
          logger.fatal("failed to init resolutionId counter document", {
            stack: err.stack
          })
        );
    });

  //map to collections
  logger.info("retrieving collections");
  const collections = {};
  try {
    (yield db.listCollections().toArray()).forEach(
      collInfo => (collections[collInfo.name] = db.collection(collInfo.name))
    );
  } catch (err) {
    logger.fatal("mongo list collections error", { stack: err.stack });
    process.exit(1);
  }

  //info on done initializing database
  logger.info("db done initializing");

  //return collections to be used by module users
  return Promise.resolve(collections);
}).catch(err => logger.fatal("db init procedure error", { stack: err.stack }));
