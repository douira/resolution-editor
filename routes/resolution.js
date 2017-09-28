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
let resolutions, access, db;
databaseInterface.onload = (loadedDb) => {
  resolutions = loadedDb.collection("resolutions");
  access = loadedDb.collection("access");
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
  //get token from params
  const token = req.params.token;

  //must be "token" type and be valid
  if (token.length && token[0] === "@" && tokenProcessor.check(token)) {
    //load corresponding resolution
    resolutions.findOne({ token: token }).toArray((err, documents) => {
      if (documents.length) {
        //call callback with gotten document
        callback(token, documents[0]);
      } else {
        issueError(400, "token wrong");
      }
    });
  } else {
    issueError(400, "token invalid");
  }
}

//deals with access code in POST and checks permissions
function checkCode(req, res, callback) {
  //get code from params
  const code = req.body.code;

  //must be "code" type and be valid
  if (code.length && code[0] === "!" && tokenProcessor.check(code)) {
    //load corresponding access entry
    access.findOne({ code: code }).toArray((err, documents) => {
      //code found
      if (documents.length) {
        //call callback with gotten code doc
        callback(documents[0]);
      } else {
        issueError(400, "code wrong");
      }
    });
  } else {
    issueError(400, "code invalid");
  }
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
