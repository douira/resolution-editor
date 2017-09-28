/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const pandoc = require("node-pandoc");
const latexGenerator = require("../lib/latex-generator");
const databaseInterface = require("../lib/database");
const resolutionFormat = require("../public/js/resolutionFormat");
const tokenProcessor = require("../lib/token");

const inspect = ((spect) => {
  return (obj) => console.log(spect(obj, {
    colors: true,
    depth: null,
    breakLength: 0
  }));
})(require("util").inspect);

//register callback to get collections on load
let resolutions;
let db;
databaseInterface.onload = (loadedDb) => {
  resolutions = loadedDb.collection("resolutions");
  db = loadedDb;
};

//sends an error and logs it
function issueError(status, res, msg) {
  msg = "error: " + msg;
  console.error(msg);
  res.status(status).send(msg);
}

//deals with token in URL and calls callback if token present in db
function checkToken(req, res, callback) {
  //check if token present
  let token = req.params.token;
  /*if (req.params.token && req.params.token.length) {
    token = req.params.token;
  } else {
    res.send("error: no token");
  }*/

  //allow save of resolution with token if already present
  resolutions.findOne({ token: token }).toArray((err, documents) => {
    if (documents.length) {
      //call callback with gotten document
      callback(token, documents[0]);
    } else {
      issueError(400, "token wrong");
    }
  });
}

//deals with resolutions in req.body and checks them against the format
function checkBodyRes(req, res, callback) {
  //needs to be present
  if (req.body && typeof req.body === "object") {
    if (resolutionFormat.check(req.body)) {
      callback(req.body);
    } else {
      issueError(400, "format invalid");
    }
  } else {
    issueError(400, "nothing sent");
  }
}

//makes the argument string for file for the pandoc cli interface to put the file into
function makePandocArgs(token) {
  return "-o public/" + token + "/out.pdf --template=public/template.latex";
}

//POST (responds with link, no view) render pdf
router.post("/renderpdf/:token", function(req, res) {
  //check for token and save new resolution content
  checkToken((token, doc) => {
    //inspect(doc.content);
    //render gotten resolution to pdf
    pandoc(latexGenerator(doc.content), makePandocArgs(token), (pandocErr, pandocResult) => {
      //throw error if occured
      if (pandocErr) {
        throw pandocErr;
      }

      //send rendered html
      res.send("out.pdf");
    });
  });
});

//GET (no view, processor) redirects to editor page with new registered token
router.get("/new", function(req, res) {
  //make new token

});

//POST (no view) save resolution
router.post("/save/:token", function(req, res) {
  //require resolution content to be present and valid
  checkBodyRes(req, res, (resolution) => {
    //check for token and save new resolution content
    checkToken((token) => {
      //save new document
      resolutions.updateOne(
        { token: token },
        { $set: { content: resolution } }
      ).then(() => res.send("ok"), () => issueError(500, "can't save"));
    });
  });
});

//POST (no view) show editor and thereby load
router.post("/load/:token", function(req, res) {
  //check for token and save new resolution content
  checkToken((token, doc) => {
    //send resolution to client, remove database wrapper
    res.send(doc.content);
  });
});
