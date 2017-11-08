/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const pandoc = require("node-pandoc");
const latexGenerator = require("../lib/latex-generator");
const databaseInterface = require("../lib/database");
const tokenProcessor = require("../lib/token");
const resUtil = require("../lib/resUtil");
const routingUtil = require("../lib/routingUtil");
const liveView = require("../lib/liveView").router;

const issueError = resUtil.issueError;

//register callback to get collections on load
let resolutions, access;
databaseInterface((collections) => {
  resolutions = collections.resolutions;
  access = collections.access;
});

//generates a token/code and queries the database to see if it's already present (recursive)
function attemptNewThing(res, isToken, finalCallback) {
  //make new token
  const thing = tokenProcessor[isToken ? "makeToken" : "makeCode"]();

  //check if it exists in db
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
  routingUtil.checkToken(req, res, {
    //add current time to render history log
    $set: { lastRender: Date.now() }
  }, (token, document) => {
    //don't render if nothing saved yet
    if (! document.stage) {
      issueError(res, 400, "nothing saved (stage 0)");
      return;
    }

    //url to pdf
    const pdfUrl = "/resolution/rendered/" + token + ".pdf";

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
        (pandocErr) => {
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
  routingUtil.checkToken(req, res, (token, document) => {
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
      changed: timeNow, //last time it was changed = saved, stage advances don't count
      stageHistory: [ timeNow ], //index is resolution stage, time when reached that stage
      lastRender: 0, //logs pdf render events
      lastLiveview: 0, //last time a liveview session happened with this resolution
      stage: 0, //current workflow stage (see phase 2 notes)
      liveviewOpen: false //if a liveview page is viewing this resolution right now
    }).then(() => {
      //redirect to editor page (because URL is right then)
      res.redirect("editor/" + token);
    }, () => issueError(res, 500, "can't create new"));
  });
});

//POST (no view) save resolution
router.post("/save/:token", function(req, res) {
  //require resolution content to be present and valid
  routingUtil.checkBodyRes(req, res, (resolutionSent) => {
    //authorize, doesn't do code auth if node code necessary
    routingUtil.fullAuth(req, res, (token) => {
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
routingUtil.getAndPost(router, "/editor/:token", function(req, res) {
  //check for token and code (check with DE perm is no code given)
  routingUtil.fullAuth(req, res,
    (token, resDoc, codeDoc) =>
      //send rendered editor page with token set
      res.render("editor", getEditorViewParams(true, resDoc, token, codeDoc)),
    {
      permissionMissmatch: (token, resDoc, codeDoc) =>
        //send edtor page but with "no access" notice
        res.render("editor", getEditorViewParams(false, resDoc, token, codeDoc))
    }
  );
});

//pass liveview stuff on to that module
router.use("/liveview", liveView);

//POST (no view) (request from editor after being started with set token) send resolution data
router.post("/load/:token", function(req, res) {
  //authorize
  routingUtil.fullAuth(req, res, (token, resolutionDoc) => {
    //send resolution to client, remove database wrapper
    res.send(resolutionDoc.content);
  });
});

//GET (no view) (request from editor after being started with set token) send resolution data
//same as above just with node special code
router.get("/load/:token", function(req, res) {
  //authorize, absence of code is detected in fullAuth
  routingUtil.fullAuth(req, res, (token, resolutionDoc) => {
    //send resolution to client, remove database wrapper
    res.send(resolutionDoc.content);
  });
});

//POST (no view) to advance resolution, redirect to editor without code after completion
router.post("/advance/:token", function(req, res) {
  //authorize, absence of code is detected in fullAuth
  routingUtil.fullAuth(req, res, (token) => {
    //advance resolution to next stage
    resolutions.updateOne({ token: token }, {
      $inc: { stage: 1 },
      $push: { stageHistory: Date.now() }
    })
    //redirect to editor without code
    .then(() => res.redirect("/resolution/editor/" + token))
    .catch((err) => issueError(res, 500, "advance db error", err));
  }, {
    //error/warning page on fail
    permissionMissmatch: (token, resolutionDoc, codeDoc) => {
      //display error page
      res.render("weakperm-advance", {
        token: resolutionDoc.token,
        stage: resolutionDoc.stage,
        accessLevel: codeDoc.level
      });
    },
    //use advance match mode because editing and advancement have different requirements
    matchMode: "advance"
  });
});

//GET (no view, validation response) checks if sent token or code is valid (for form display)
router.get("/checkinput/:thing", function(req, res) {
  //respond with token/code ok or not
  if (req.params.thing[0] === "@") {
    routingUtil.checkToken(req, res, () => {
      res.send("ok token");
    });
  } else if (req.params.thing[0] === "!") {
    routingUtil.checkCode(req, res, () => {
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
  .then(() => res.send(newCodes
                        .map((code) => code.level + " " + code.code)
                        .join("<br>")))
  .catch((err) => issueError(res, 500, "Error inserting codes", err));
});
