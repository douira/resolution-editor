/*jshint esversion: 6, node: true */
const MongoClient = require("mongodb").MongoClient;
const credentials = require("../lib/credentials");

//callbacks to call on loading of db
const callbackOnLoad = [];

//catches index creation errors
function catchIndexCreationError(err) {
  //log error info
  console.error("index creation error");

  //also throw error, this is bad enough that
  //starting the server makes no sense if this has happened
  throw err;
}

//connect to mongodb
const dbPromise = MongoClient.connect(`mongodb://resolutionEditor:${
  credentials.dbUserPassword}@localhost:27017/resolution-editor`)
.then(db => {
  //init indexes on collections
  db.collection("resolutions").createIndex({ token: "text" }, { unique: true })
    .then(db.collection("access").createIndex({ code: "text" }, { unique: true }))
    .then(db.collection("resolutionId").createIndex({ year: 1 }, { unique: true }))

    //index also on stages for stats and print queue
    .then(db.collection("resolutions").createIndex({ stage: 1 }))

    //index for session autoremove, this is exactly like it is in the source of connect-mongo
    .then(db.collection("sessions").createIndex({ expires: 1 }, { expireAfterSeconds: 0 }))

    //isn't unique because the resolutions that are put in here
    //can have tokens that were already released back and then re-used
    .then(db.collection("resolutionArchive").createIndex({ token: "text" }),
      catchIndexCreationError)

    //start server with this uncommented to clear the database without removing the data folder
    /*const dbRemovalError = e => { throw e; };
    db.collection("access").deleteMany({}).catch(dbRemovalError);
    db.collection("resolutions").deleteMany({}).catch(()=>{});
    db.collection("resolutionArchive").deleteMany({}).catch(()=>{});
    db.collection("resolutionId").deleteMany({}).catch(()=>{});*/

    //get collections of database
    .then(() => db.listCollections().toArray())
    .then(collInfos => {
      //map to collections
      const collections = {};
      collInfos.forEach(info => collections[info.name] = db.collection(info.name));

      //create id document for this year if it doesn't exist yet
      //and reset it to start at id 1 if it hasn't been set to anything else yet
      collections.resolutionId.updateOne({ year: new Date().getFullYear() }, {
        //only set if a new id document is created
        $setOnInsert: { counter: 1 }
      }, { upsert: true })
      //call callacks when setup work is done
      .then(
        () => callbackOnLoad.forEach((c) => c(collections)),
        err => console.error("mongo resolution id init error", err));
    }, err => console.error("mongo list collections error", err));

  //return database to allow following .then to receive it too
  return db;
}, err => {
  //stop if can't connect to db
  throw Error("mongo connect error", err);
});

//export with two options: callacks for connections
//or db promise for other controllers like sessions
module.exports = {
  //adds to list of load callbacks
  callback: c => callbackOnLoad.push(c),

  //return connection promise
  promise: dbPromise
};
