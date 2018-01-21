/*jshint esversion: 6, node: true */
const MongoClient = require("mongodb").MongoClient;
const credentials = require("../lib/credentials");

//callbacks to call on loading of db
const callbackOnLoad = [];

//adds to list of load callbacks
module.exports = c => callbackOnLoad.push(c);

//catches index creation errors
function catchIndexCreationError(err) {
  //log error info
  console.error("index creation error");

  //also throw error, this is bad enough that
  //starting the server makes no sense if this has happened
  throw err;
}

//connect to mongodb
MongoClient.connect(`mongodb://resolutionEditor:${
                    credentials.dbUserPassword}@localhost:27017/resolution-editor`)
.then(db => {
  //init indexes on collections
  db.collection("resolutions").createIndex({ token: "text" }, { unique: true })
    .then(db.collection("access").createIndex({ code: "text" }, { unique: true }))
    .then(db.collection("resolutionId").createIndex({ year: 1 }, { unique: true }))

    //isn't unique because the resolutions that are put in here
    //can have tokens that were already released back and then re-used
    .then(db.collection("resolutionArchive").createIndex({ token: "text" }),
      catchIndexCreationError)

    //run server with this uncommented to clear the database without removing the data folder
    /*const dbRemovalError = e => { throw e; };
    db.collection("access").deleteMany({}).catch(dbRemovalError);
    db.collection("resolutions").deleteMany({}).catch(()=>{});
    db.collection("resolutionArchive").deleteMany({}).catch(()=>{});*/

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
}, err => console.error("mongo connect error", err));
