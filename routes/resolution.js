/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const pandoc = require("node-pandoc");
const latexGenerator = require("../lib/latex-generator");
const databaseInterface = require("../lib/database");
const resolutionFormat = require("../public/js/resolutionFormat").resolutionFormat;
const tokenProcessor = require("../lib/token");
const resUtil = require("../lib/resUtil");

const issueError = resUtil.issueError;

//register callback to get collections on load
let resolutions, access, db;
databaseInterface.onload((loadedDb) => {
  resolutions = loadedDb.collection("resolutions");
  access = loadedDb.collection("access");
  db = loadedDb;
});

//delegate no privilege access code doc
const delegateCodeDoc = { level: "DE" };

//deals with token in URL and calls callback if token present in db
function checkToken(req, res, modifyResolution, callback) {
  //if only three args, callback is in modifyResolution
  let doModify = true;
  if (arguments.length === 3) {
    callback = modifyResolution;

    //set flag to use findOneAndUpdate instead
    doModify = false;
  }

  //get token from params
  const token = req.params.token || req.params.thing;

  //must be "token" type and be valid
  if (token.length && token[0] === "@" && tokenProcessor.check(token)) {
    //load corresponding resolution
    (doModify ? //modify as well if flag set
      resolutions.findOneAndUpdate({ token: token }, modifyResolution, { returnOriginal: true }) :
      resolutions.findOne({ token: token })
    ).then((document) => {
      //check for existance
      if (document) {
        //call callback with gotten document
        callback(token, doModify ? document.value : document);
      } else {
        issueError(res, 400, "token wrong");
      }
    }).catch(issueError.bind(null, res, 500, "token db read error"));
  } else {
    issueError(res, 400, "token invalid");
  }
}

//deals with access code in POST and checks permissions
function checkCode(req, res, callback) {
  //get code from params
  const code = req.body.code || req.params.thing;

  //must be "code" type and be valid
  if (code.length && code[0] === "!" && tokenProcessor.check(code)) {
    //load corresponding access entry
    access.findOne({ code: code }).then((document) => {
      //code found
      if (document) {
        //call callback with gotten code doc
        callback(document);
      } else {
        issueError(res, 400, "code wrong");
      }
    }).catch(issueError.bind(null, res, 500, "code db read error"));
  } else {
    issueError(res, 400, "code invalid");
  }
}

//deals with resolutions in req.body and checks them against the format
function checkBodyRes(req, res, callback) {
  //needs to be present
  if (req.body && typeof req.body === "object") {
    //get resolution from post content
    let resolution = req.body.content;

    //attempt parse
    try {
      resolution = JSON.parse(resolution);
    } catch (e) {
      issueError(res, 400, "parse error");
      return;
    }

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

//does auth with code, gets resolution doc given and does code and permission check
function authWithCode(res, resolutionDoc, codeDoc, callback, permissionMissmatch) {
  //do permission auth
  if (resUtil.checkEditPermissionMatch(resolutionDoc, codeDoc)) {
    //call callback with everythign gathered
    callback(resolutionDoc.token, resolutionDoc, codeDoc);
  } else if (typeof permissionMissmatch === "function") {
    //call alternative callback if given
    permissionMissmatch(resolutionDoc.token, resolutionDoc, codeDoc);
  } else {
    issueError(res, 400, "not authorized");
  }
}

//does full auth procedure (token, POSTed code and permission match)
function fullAuth(req, res, callback, permissionMissmatch) {
  //check for token and save new resolution content
  checkToken(req, res, (token, resolutionDoc) => {
    //check if a code was sent
    if (req.body && req.body.code && req.body.code.length) {
      //check sent code
      checkCode(req, res, (codeDoc) => {
        authWithCode(res, resolutionDoc, codeDoc, callback, permissionMissmatch);
      });
    } else {
      //use "DE" delegate level code doc
      authWithCode(res, resolutionDoc, delegateCodeDoc, callback, permissionMissmatch);
    }
  });
}

//generates a token/code and queries the database to see if it's already present (recursive)
function attemptNewThing(res, isToken, finalCallback) {
  //make new token
  const thing = tokenProcessor[isToken ? "makeToken" : "makeCode"]();

  //check if it exists
  (isToken ? resolutions.findOne({ token: thing }) :
   access.findOne({ code: thing })).then((document) => {
    //check if it exists
    if (document) {
      //try again randomly
      attemptNewThing(res, isToken, finalCallback);
    } else {
      //doesn't exist yet, call callback with found thing
      finalCallback(thing);
    }
  }).catch(issueError.bind(null, res, 500, "code db read error"));
}

//GET (view) to /resolution displays front page without promo
router.get("/", function(req, res) {
  res.render("index", { promo: false });
});

//GET (responds with url, no view) render pdf
router.get("/renderpdf/:token", function(req, res) {
  //check for token and save new resolution content
  checkToken(req, res, {
    //add current time to render history log
    $set: { lastRender: Date.now() }
  }, (token, document) => {
    //don't render if nothing saved yet
    if (! document.stage) {
      issueError(res, 400, "nothing saved (stage 0)");
      return;
    }

    //url to pdf
    var pdfUrl = "/resolution/rendered/" + token + ".pdf";

    //don't render if hasn't been saved again since last render
    if (document.changed < document.lastRender) {
      //just send url and stop
      res.send(pdfUrl);
      return;
    }

    //render gotten resolution to pdf
    try {
      pandoc(
        latexGenerator(document.content),
        "-o public/rendered/" + token + ".pdf --template=public/template.latex",
        (pandocErr, pandocResult) => {
          //hint error if occured
          if (pandocErr) {
            issueError(res, 500, "render problem pandoc result", pandocErr);
          } else {
            //send url to rendered pdf
            res.send(pdfUrl);
          }
        });
    } catch (e) {
      //catch any pandoc or rendering errors we can
      issueError(res, 500, "render problem pandoc");
    }
  });
});

//GET (responds with url, no view) render plaintext, not really render but similar
router.get("/renderplain/:token", function(req, res) {
  //check for token and save new resolution content
  checkToken(req, res, (token, document) => {
    //don't render if nothing saved yet
    if (! document.stage) {
      issueError(res, 400, "nothing saved (stage 0)");
      return;
    }

    //respond with plaintext form of resolution
    res.render("plainview", {
      data: resUtil.renderPlaintext(document),
      token: token
    });
  });
});

//GET (no view, processor) redirects to editor page with new registered token
router.get("/new", function(req, res) {
  //make a new unique token, true flag for being a token
  attemptNewThing(res, true, (token) => {
    //get now (consistent)
    const timeNow = Date.now();

    //put new resolution into database
    resolutions.insertOne({
      token: token, //identifier
      created: timeNow, //time of creation
      changed: timeNow, //last time it was changed = saved
      stageHistory: [ timeNow ], //index is resolution stage, time when reached that stage
      lastRender: 0, //logs pdf render events
      stage: 0 //current workflow stage (see phase 2 notes)
    }).then(() => {
      //redirect to editor page (because URL is right then)
      res.redirect("editor/" + token);
    });
  });
});

//POST (no view) save resolution
router.post("/save/:token", function(req, res) {
  //require resolution content to be present and valid
  checkBodyRes(req, res, (resolutionSent) => {
    //authorize, doesn't do code auth if node code necessary
    fullAuth(req, res, (token, resolutionDoc, codeDoc) => {
      //save new document
      resolutions.updateOne(
        { token: token },
        {
          $set: {
            content: resolutionSent, //update resolution content
            changed: Date.now() //update changedate
          },
          $max: {
            stage: 1 //first saved stage at least
          },
          $min: {
            "stageHistory.1": Date.now() //set first save time (don't change if this is older)
          }
        }
      ).then(() => {
        res.send("ok");
      }, () => issueError(res, 500, "can't save"));
    });
  });
});

//return the render param object for the editor view
function getEditorViewParams(doLoad, resDoc, token, codeDoc) {
  //send rendered editor page with token set
  return {
    token: token,
    meta: resUtil.getMetaInfo(resDoc),
    doLoad: doLoad,
    code: codeDoc.hasOwnProperty("code") ? codeDoc.code : null,
    accessLevel: codeDoc.level
  };
}

//POST/GET (editor view) redirected to here to send editor with set token
//(also only displays meta info if code necessary but not given or invalid)
["get", "post"].forEach((method) => {
  router[method]("/editor/:token", function(req, res) {
    //check for token and code (check that none is needed)
    fullAuth(req, res,
      (token, resDoc, codeDoc) =>
        //send rendered editor page with token set
        res.render("editor", getEditorViewParams(true, resDoc, token, codeDoc)),
      (token, resDoc, codeDoc) =>
        //send edtor page but with "no access" notice
        res.render("editor", getEditorViewParams(false, resDoc, token, codeDoc))
    );
  });
});

//POST (no view) (request from editor after being started with set token) send resolution data
router.post("/load/:token", function(req, res) {
  //authorize
  fullAuth(req, res, (token, resolutionDoc, codeDoc) => {
    //send resolution to client, remove database wrapper
    res.send(resolutionDoc.content);
  });
});

//GET (no view) (request from editor after being started with set token) send resolution data
//same as above just with node special code
router.get("/load/:token", function(req, res) {
  //authorize, absence of code is detected in fullAuth
  fullAuth(req, res, (token, resolutionDoc, codeDoc) => {
    //send resolution to client, remove database wrapper
    res.send(resolutionDoc.content);
  });
});

//GET (no view, validation response) checks if sent token or code is valid (for form display)
router.get("/checkinput/:thing", function(req, res) {
  //respond with token/code ok or not
  if (req.params.thing[0] === "@") {
    checkToken(req, res, () => {
      res.send("ok token");
    });
  } else if (req.params.thing[0] === "!") {
    checkCode(req, res, () => {
      res.send("ok code");
    });
  } else {
    //bad, strange thing sent
    issueError(400, "sent content unreadable");
  }
});

//GET no view, creates and outputs a bunch of access codes, for TESTING only: remove in production
router.get("/makecodes/BJHT6KVPWRLWLJJ2PVRQMSH11HKGJ34LX38R3XW3", function(req, res) {
  //for every level make a new code doc
  const newCodes = ["AP", "FC", "SC", "CH", "MA"].map((level) => ({
    level: level,
    code: tokenProcessor.makeCode()
  }));

  //add all of them to the database
  access.insertMany(newCodes)
  //respond with codes as content
  .then((r) => res.send(newCodes
                        .map((code) => code.level + " " + code.code)
                        .join("<br>")))
  .catch((err) => issueError(res, 500, "Error inserting codes", err));
});
