/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

const generatePdf = require("../lib/generatePdf");
const databaseInterface = require("../lib/database");
const tokenProcessor = require("../lib/token");
const resUtil = require("../lib/resUtil");
const routingUtil = require("../lib/routingUtil");
const liveView = require("../lib/liveView").router;
const credentials = require("../lib/credentials");

const issueError = resUtil.issueError;

//register callback to get collections on load
let resolutions, access, resolutionArchive, collections;
databaseInterface(c => {
  //get collections in vars for easier use
  resolutions = c.resolutions;
  resolutionArchive = c.resolutionArchive;
  access = c.access;
  collections = c;
});

//generates a token/code and queries the database to see if it's already present (recursive)
function makeNewThing(res, isToken) {
  //return promise, pass recursive function
  return new Promise(function attempt(resolve, reject) {
    //make new token or code
    const thing = tokenProcessor[isToken ? "makeToken" : "makeCode"]();

    //query if it exists in db
    (isToken ? resolutions.findOne({ token: thing }) :
     access.findOne({ code: thing })).then(document => {
      //if it exists
      if (document) {
        //try again randomly
        attempt(resolve, reject);
      } else {
        //doesn't exist yet, call callback with found thing
        resolve(thing);
      }
    }, () => {
      issueError(res, 500, "db read error");
      reject("db read error");
    });
  });
}

//GET (view) to /resolution displays front page (token and code input) without promo
router.get("/", function(req, res) {
  res.render("index", { promo: false });
});

//GET (responds with url, no view) render pdf
router.get("/renderpdf/:token", function(req, res) {
  //check for token and save new resolution content
  routingUtil.checkToken(req, res, {
    $set: {
      //add current time to render history log
      lastRender: Date.now(),

      //reset flag, don't do a rerender if not saved again
      unrenderedChanges: false
    }
  }, (token, document) => {
    //don't render if nothing saved yet
    if (! document.stage) {
      issueError(res, 400, "nothing saved (stage 0)");
      return;
    }

    //url to pdf
    const pdfUrl = "/resolution/rendered/" + token + ".pdf";

    //don't render if there hasn't been a save since the last render
    if (! document.unrenderedChanges) {
      //just send url and stop
      res.send(pdfUrl);
      return;
    }

    //generate pdf
    generatePdf(document).then(
      //send url to rendered pdf
      pageAmount => {
        //send url to confirm render
        res.send(pdfUrl);

        //check if the page amount could be determined
        if (pageAmount) {
          //put in database for work queue display
          resolutions.updateOne({ token: token }, { pageAmount: pageAmount }).catch(
            //not interested in result
            err => console.err("could not update page amount", err)
          );
        }
      },

      //print and notify of error
      err => issueError(res, 500, "render problem", err)
    );
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
  makeNewThing(res, true).then(token => {
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
      liveviewOpen: false, //if a liveview page is viewing this resolution right now (TODO: use)
      attributes: "none", //attribute status, see /setattribs or fucntion, restricts actions
      unrenderedChanges: false, //set to true when saved and reset when rendered
    }).then(() => {
      //redirect to editor page (because URL is right then)
      res.redirect("/resolution/editor/" + token);
    }, () => issueError(res, 500, "can't create new"));
  });
});

//POST (no view) save resolution
router.post("/save/:token", function(req, res) {
  //require resolution content to be present and valid
  routingUtil.checkBodyRes(req, res, resolutionSent => {
    //authorize, doesn't do code auth if node code necessary
    routingUtil.fullAuth(req, res, token => {
      //save new document
      resolutions.updateOne(
        { token: token },
        {
          $set: {
            content: resolutionSent, //update resolution content
            changed: Date.now(), //update changedate
            unrenderedChanges: true //must be rendered
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
    }, {
      //match mode save respects saving attrib restrictions
      matchMode: "save"
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
        //send edtor page but with "no access" notice and unlock form
        res.render("editor", getEditorViewParams(false, resDoc, token, codeDoc)),

      //editor match mode
      matchMode: "editor"
    }
  );
});

//POST (no view) update attributes and redirect back to editor page
router.post("/setattribs/:token", function(req, res) {
  //authorize, must have code matching MA access level
  routingUtil.fullAuth(req, res, token => {
    //check for present post body property and must be a ok value
    if (req.body && req.body.attrib &&
        ["none", "noadvance", "readonly", "static"].includes(req.body.attrib)) {
      //set to new value in database
      resolutions.updateOne(
        { token: token },
        {
          $set: {
            //set attrib string as found in post body
            attributes: req.body.attrib
          }
        }
      ).then(() => {
        //redirect back to editor page
        res.redirect("/resolution/editor/" + token);
      }, err => issueError(res, 500, "can't set attribute", err));
    } else {
      issueError(res, 400, "missing or incorrect fields");
    }
  }, {
    //just make no db query on auth fail
    permissionMissmatch: token => {
      //just go back to editor
      res.redirect("/resolution/editor/" + token);
    },

    //use attribute setting permission set (resticted to MA level)
    matchMode: "admin"
  });
});

//POST (no view) delete a resolution
router.post("/delete/:token", function(req, res) {
  //authorize, must have code matching MA access level
  routingUtil.fullAuth(req, res, token => {
    //remove resolution with that token by moving to the archive
    resolutions.findOneAndDelete( { token: token } ).then(resDoc => {
      //insert into archive collection
      resolutionArchive.insertOne(resDoc).then(() => {
        //acknowledge
        res.send("ok. deleted " + token);
      }, err => issueError(res, 500, "can't insert into archive", err));
    }, err => issueError(res, 500, "can't delete", err));
  }, {
    //just make no db query on auth fail
    permissionMissmatch: token => {
      //just go back to editor
      res.redirect("/resolution/editor/" + token);
    },

    //use master setting permission set (resticted to MA level)
    matchMode: "admin"
  });
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

//pads with leading zeros (returns a string)
function padNumber(number, amount) {
  //convert to string
  number = "" + number;

  //return 0 repeated until the right length
  return amount < number.length ? number : "0".repeat(amount - number.length) + number;
}

//POST (no view) to advance resolution, redirect to editor without code after completion
router.post("/advance/:token", function(req, res) {
  //authorize, absence of code is detected in fullAuth
  routingUtil.fullAuth(req, res, (token, resDoc) => {
    //query object to be possibly extended by a vote result setter
    const query = {
      $inc: { stage: 1 }, //advance to next stage index
      $push: { stageHistory: Date.now() } //add timestamp to history
    };

    //if vote values are sent
    if (req.body && "inFavor" in req.body) {
      //stop if vote numbers faulty
      try {
        //make voting reults object
        const voteResults = {
          // "|| 0" convert to number or 0
          inFavor: parseInt(req.body.inFavor, 10) || 0,
          against: parseInt(req.body.against, 10) || 0,
          abstention: parseInt(req.body.abstention, 10) || 0,
          importantQuestion: req.body.importantQuestion ? true : false,
        };

        /*check and add prop wether or not this resolution passed.
        must be majority for pass and 2/3 majority (= two times more than...)
        for important question to pass*/
        voteResults.passed = voteResults.inFavor > voteResults.against *
          (voteResults.importantQuestion ? 2 : 1);

        //add whole thing to query
        query.$set = { voteResults: voteResults };
      } catch (err) {
        issueError(res, 400, "vote number parse fail", err);
      }
    }

    //add resolution id if going from stage 3 (FC) to 4 (print), regular advance otherwise
    (resDoc.stage === 3 ?
      //get and increment resolution id for this year
      //needs findOneAndUpdate because we need the value of the modified doc
      collections.resolutionId.findOneAndUpdate({ year: new Date().getFullYear() }, {
        //count up one
        $inc: { counter: 1 }
      })

      //advance resolution to next stage and set id
      .then(yearDoc => {
        //add $set property if not set already
        if (! query.$set) {
          query.$set = {};
        }

        //add id and year to update query
        query.$set.resolutionId = padNumber(yearDoc.value.counter, 3);
        query.$set.idYear = yearDoc.value.year;

        //as this changes the pdf generated from this resolution, flag must be set
        //(the id is added to the pdf in a corner)
        query.$set.unrenderedChanges = true;

        //execute query and return resulting promise
        return resolutions.updateOne({ token: token }, query);
      }) :

      //execute and return query without adding resolution id
      resolutions.updateOne({ token: token }, query)
    )

    //redirect to editor without code, prevent form resubmission
    .then(
      () => {
        //don't redirect if correct param set
        if (req.query.noui) {
          res.send("ok");
        } else {
          //regular redirect
          res.redirect("/resolution/editor/" + token);
        }
      },
      err => issueError(res, 500, "advance db error", err));
  }, {
    //error/warning page on fail
    permissionMissmatch: (token, resolutionDoc, codeDoc) => {
      //issue error if no ui, error page if user is viewing
      if (req.query.noui) {
        issueError(res, 400, "insufficient permission to advance");
      } else {
        //display error page
        res.render("weakperm", {
          type: "advance",
          token: resolutionDoc.token,
          stage: resolutionDoc.stage,
          accessLevel: codeDoc.level
        });
      }
    },
    //use advance match mode because advancement has specific permission requirements
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

//GET no view, creates and outputs a bunch of access codes
router.get("/makecodes/" + credentials.makeCodesSuffix, function(req, res) {
  //for every level make a new code doc
  Promise.all(["AP", "FC", "SC", "CH", "MA"].map(
    level => makeNewThing(res, false).then(code => ({ level: level, code: code }))
  )).then(newCodes =>
    //add all of them to the database
    access.insertMany(newCodes).then(
      //respond with codes as content
      () => res.send(newCodes
        .map(code => code.level + " " + code.code)
        .join("<br>")),
      err => issueError(res, 500, "Error inserting codes", err))
  );
});
