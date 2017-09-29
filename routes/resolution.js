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
function issueError(res, status, msg, errorItself) {
  //prepend error text
  msg = "error: " + msg;

  //log message to console
  console.error(msg);

  //also log error if there was one
  if (errorItself) {
    console.error(errorItself);
  }

  //send given message and status
  res.status(status).send(msg);
}

//deals with token in URL and calls callback if token present in db
function checkToken(req, res, modifyResolution, callback) {
  //if only three args, callback is in modifyResolution
  let doModify = false;
  if (arguments.length === 3) {
    callback = modifyResolution;

    //set flag to use findOneAndModify instead
    doModify = true;
  }

  //get token from params
  const token = req.params.token;

  //must be "token" type and be valid
  if (token.length && token[0] === "@" && tokenProcessor.check(token)) {
    //load corresponding resolution
    (doModify ? //modify as well if flag set
     resolutions.findOne({ token: token }) :
     resolutions.findOneAndModify({ token: token }, modifyResolution, { returnOriginal: false })
    ).toArray((err, documents) => {
      if (documents.length) {
        //call callback with gotten document
        callback(token, documents[0]);
      } else {
        issueError(res, 400, "token wrong");
      }
    });
  } else {
    issueError(res, 400, "token invalid");
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
        issueError(res, 400, "code wrong");
      }
    });
  } else {
    issueError(res, 400, "code invalid");
  }
}

//checks if given permission code doc allows access to given resolution doc
function checkPermissionMatch(resolution, permission) {
  //check permission and stage matching conditions
  return permission.level === "CH" || //chair access always ok
    //allow if at active editing state and has delegate permission
    resolution.stage <= 1 && permission.level === "DE" ||
    //allow AP or FC if at their respective stages
    resolution.stage === 2 && permission.level === "AP" ||
    resolution.stage === 3 && permission.level === "FC";
}

//deals with resolutions in req.body and checks them against the format
function checkBodyRes(req, res, callback) {
  //needs to be present
  if (req.body && typeof req.body === "object") {
    //get resolution from post content
    const resolution = req.body.content;

    //must match format
    if (resolutionFormat.check(resolution)) {
      callback(resolution);
    } else {
      issueError(res, 400, "format invalid");
    }
  } else {
    issueError(res, 400, "nothing sent");
  }
}

//does full auth procedure (token, POSTed code and permission match)
function fullAuth(req, res, callback) {
  //check for token and save new resolution content
  checkToken(req, res, (token, resolutionDoc) => {
    //check sent code
    checkCode(req, res, (codeDoc) => {
      //do permission auth
      if (checkPermissionMatch(resolutionDoc, codeDoc)) {
        //call callback with everythign gathered
        callback(token, resolutionDoc, codeDoc);
      } else {
        issueError(res, 400, "not authorized");
      }
    });
  });
}

//GET to /resolution displays front page without promo
router.get("/", function(req, res) {

});

//POST (responds with link, no view) render pdf
router.post("/renderpdf/:token", function(req, res) {
  //check for token and save new resolution content
  checkToken(req, res, {
    //add current time to render history log
    $push: { renderHistory: Date.now() }
  }, (token, doc) => {
    //don't render if nothing saved yet
    if (! doc.stage) {
      issueError(res, 400, "nothing saved (stage 0)");
      return;
    }

    //don't render if hasn't been saved again since last render
    if (doc.changed < doc.renderHistory[doc.renderHistory.length - 1]) {
      //just send url and stop
      res.send("/rendered/" + token + ".pdf");
      return;
    }

    //render gotten resolution to pdf
    pandoc(
      latexGenerator(doc.content),
      "-o public/rendered/" + token + ".pdf --template=public/template.latex",
      (pandocErr, pandocResult) => {
        //hint error if occured
        if (pandocErr) {
          issueError(res, 500, "render problem", pandocErr);
        } else {
          //send url to rendered pdf
          res.send("/rendered/" + token + ".pdf");
        }
      });
  });
});

//GET (no view, processor) redirects to editor page with new registered token
router.get("/new", function(req, res) {
  //make new token
  const token = tokenProcessor.makeToken();

  //get now
  const timeNow = Date.now();

  //put new resolution into database
  resolutions.insertOne({
    token: token, //identifier
    created: timeNow, //time of creation
    changed: timeNow, //last tieme it was changed = saved
    stageHistory: [ timeNow ], //index is resolution stage, time when reached that stage
    renderHistory: [], //logs pdf render events
    stage: 0 //current workflow stage (see phase 2 notes)
  }).then(() => {
    //redirect to editor page (because URL is right then)
    res.redirect("/editor/" + token);
  });
});

//POST (no view) save resolution
router.post("/save/:token", function(req, res) {
  //require resolution content to be present and valid
  checkBodyRes(req, res, (resolutionSent) => {
    //authorize
    fullAuth(res, req, (token, resolutionDoc, codeDoc) => {
      //save new document
      resolutions.updateOne(
        { token: token },
        {
          $set: {
            content: resolutionSent,
            changed: Date.now()
          }
        }
      ).then(() => res.send("ok"), () => issueError(res, 500, "can't save"));
    });
  });
});

//GET (editor view) redirected to here to send editor with set token
router.get("/editor/:token", function(req, res) {
  //check for token
  checkToken(req, res, (token) => {
    //send rendered editor page with token set
    res.render("editor", { token: token });
  });
});

//POST (no view) (request from editor after being started with set token) send resolution data
router.post("/load/:token", function(req, res) {
  //authorize
  fullAuth(res, req, (token, resolutionDoc, codeDoc) => {
    //send resolution to client, remove database wrapper
    res.send(resolutionDoc.content);
  });
});
