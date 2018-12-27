const express = require("express");
const router = express.Router();
module.exports = router;
const generatePdf = require("../lib/generatePdf");
const resUtil = require("../lib/resUtil");
const routingUtil = require("../lib/routingUtil");
const extDataPromise = require("../lib/extData");
const { logger, issueError } = require("../lib/logger");

//register callback to get collections on load
let resolutions, access, resolutionArchive, collections;
require("../lib/database").fullInit.then(c => {
  //get collections in vars for easier use
  resolutions = c.resolutions;
  resolutionArchive = c.resolutionArchive;
  access = c.access;
  collections = c;
});

//GET (view) to /resolution displays front page (token and code input) without promo
router.get("/", (req, res) => res.render("index", { promo: false }));

//GET (responds with url, no view) render pdf
router.get("/renderpdf/:token", (req, res) =>
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
      issueError(req, res, 400, "nothing saved (stage 0)");
      return;
    }

    //url to pdf
    const pdfUrl = `/rendered/${token}.pdf?c=${Date.now()}`;

    //don't render if there hasn't been a save since the last render
    if (! document.unrenderedChanges) {
      //just send url and stop
      res.send(pdfUrl);
      return;
    }

    //generate pdf
    generatePdf(document, "resolution").then(
      //send url to rendered pdf
      pageAmount => {
        //send url to confirm render
        res.send(pdfUrl);

        //check if the page amount could be determined
        if (pageAmount) {
          //put in database for work queue display
          resolutions.updateOne({ token }, {
            $set: { pageAmount }
          }).catch( //not interested in result
            err => logger.error("could not update page amount", { stack: err.stack })
          );
        }
      },

      //print and notify of error
      err => issueError(req, res, 500, "render problem", err)
    );
  })
);

//GET (responds with url, no view) render plaintext, not really render but similar
router.get("/renderplain/:token", (req, res) =>
  //check for token and save new resolution content
  routingUtil.checkToken(req, res, (token, document) => {
    //don't render if nothing saved yet
    if (! document.stage) {
      issueError(req, res, 400, "nothing saved (stage 0)");
      return;
    }

    //respond with plaintext form of resolution
    res.render("plainview", {
      data: resUtil.renderPlaintext(document),
      token
    });
  })
);

//landing page is displayed statically and only displays information for the user to read
router.get("/prenew", (req, res) =>
  //render landing page, no new resolution button if accessed from menu
  res.render("newreslanding", { noNew: req.query.nonew === "1" })
);

//GET (no view, processor) redirects to editor page with new registered token
router.get("/new", (req, res) =>
  //make a new unique token, true flag for being a token
  resUtil.makeNewThing(req, res, true).then(token => {
    //get now (consistent)
    const timeNow = Date.now();

    //put new resolution into database
    resolutions.insertOne({
      token, //identifier
      created: timeNow, //time of creation
      changed: timeNow, //last time it was changed = saved, stage advances don't count
      stageHistory: [timeNow], //index is resolution stage, time when reached that stage
      lastRender: 0, //logs pdf render events
      lastLiveview: 0, //last time a liveview session happened with this resolution
      stage: 0, //current workflow stage (see phase 2 notes)
      liveviewOpen: false, //if a liveview page is viewing this resolution right now (TODO: use)
      attributes: "none", //attribute status, see /setattribs or fucntion, restricts actions
      unrenderedChanges: false, //set to true when saved and reset when rendered
      amendments: [] //stores all amendments made to the resolution
    }).then(() => {
      //redirect to editor page (because URL is right then)
      res.redirect(`/resolution/editor/${token}`);
    }, () => issueError(req, res, 500, "can't create new"));
  })
);

//POST (no view) save resolution
router.post("/save/:token", (req, res) =>
  //require resolution content to be present and valid
  routingUtil.checkBodyRes(req, res, resolutionSent => {
    //authorize, doesn't do code auth if no code necessary (if session present)
    routingUtil.fullAuth(req, res, token => {
      //plenary id to set
      let plenaryId;

      //require extData to be present
      extDataPromise.then(extData => {
        //get the plenary type for the forum of this resolution
        plenaryId = extData.forums[resolutionSent.resolution.address.forum].plenary;
      })

      //save document
      .then(() => resolutions.updateOne(
        { token },
        {
          $set: {
            content: resolutionSent, //update resolution content
            changed: Date.now(), //update changedate
            unrenderedChanges: true, //must be rendered
            plenaryId
          },
          $max: {
            stage: 1 //first saved stage at least
          },
          $min: {
            "stageHistory.1": Date.now() //set first save time (don't change if this is older)
          }
        }
      )).then(() => {
        res.send("ok");
      }, err => issueError(req, res, 500, "can't save resolution", err));
    }, {
      //match mode save respects saving attrib restrictions
      matchMode: "save"
    });
  })
);

//return the render param object for the editor view
const getEditorViewParams = (doLoad, resDoc, token, codeDoc) => ({
  //send rendered editor page with the token set
  token,
  meta: resUtil.getMetaInfo(resDoc),
  doLoad,
  code: codeDoc.hasOwnProperty("code") ? codeDoc.code : null,
  accessLevel: codeDoc.level
});

//POST/GET (editor view) redirected to here to send editor with set token
//(also only displays meta info if code necessary but not given or invalid)
routingUtil.getAndPost(router, "/editor/:token", (req, res) =>
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
  )
);

//both admin actions setattribs and delete need the same admin full auth
router.use(["/setattribs/:token", "/delete/:token"], (req, res, next) =>
  //do full auth
  routingUtil.fullAuth(req, res, token => {
    //attach token to req
    req.resToken = token;

    //proceed to individual routes
    next();
  }, {
    //just make no DB query on auth fail
    permissionMissmatch: token => {
      //just go back to editor
      res.redirect(`/resolution/editor/${token}`);
    },

    //use attribute setting permission set (resticted to MA level)
    matchMode: "admin"
  })
);

//POST (no view) update attributes and redirect back to editor page
router.post("/setattribs/:token", (req, res) => {
  //get token from req as it was attached to the middleware for setattribs and delete
  const token = req.resToken;

  //check for present post body property and must be a ok value
  if (req.body && req.body.attrib &&
      ["none", "noadvance", "readonly", "static"].includes(req.body.attrib)) {
    //set to new value in database
    resolutions.updateOne(
      { token },
      {
        $set: {
          //set attrib string as found in post body
          attributes: req.body.attrib
        }
      }
    ).then(() => {
      //redirect back to editor page
      res.redirect(`/resolution/editor/${token}`);
    }, err => issueError(req, res, 500, "can't set attribute", err));
  } else {
    issueError(req, res, 400, "missing or incorrect fields");
  }
});

//POST (no view) delete a resolution
router.post("/delete/:token", (req, res) => {
  //get token from req (see above)
  const token = req.params.token;

  //remove resolution with that token by moving to the archive
  resolutions.findOne({ token })
    .then(resDoc => Promise.all([
      resolutionArchive.insertOne(resDoc), resolutions.deleteOne({ token })
    ]))
    .then(() => {
      //acknowledge
      res.send(`ok. deleted ${token}`);
  }, err => issueError(req, res, 500, "can't query for delete", err));
});

//POST, GET for liveview page (GET may be ok when session with auth is present)
routingUtil.getAndPost(router, "/liveview/:token", (req, res) =>
  //check for token and code and correct stage (liveview permission mode)
  routingUtil.fullAuth(req, res,
    (token, resDoc, codeDoc) =>
      //send rendered editor page with token set
      res.render("liveview", {
        token,
        code: codeDoc.code,
        accessLevel: codeDoc.level,
        stage: resDoc.stage
      }),
    {
      permissionMissmatch: (token, resDoc, codeDoc) =>
        //send no permission page
        res.render("weakperm", {
          type: "liveview",
          token: resDoc.token,
          stage: resDoc.stage,
          accessLevel: codeDoc.level
        }),
      matchMode: "liveview"
    }
  )
);

//GET and POST (no view) to send resolution data
routingUtil.getAndPost(router, "/load/:token", (req, res) =>
  //authorize, absence of code is detected in fullAuth
  routingUtil.fullAuth(req, res, (token, resolutionDoc) =>
    //send resolution to client, remove database wrapper
    res.send(resolutionDoc.content)
  )
);

//pads with leading zeros (returns a string)
const padNumber = (number, amount) => {
  //convert to string
  number = String(number);

  //return 0 repeated until the right length
  return amount < number.length ? number : "0".repeat(amount - number.length) + number;
};

//POST (no view) to advance resolution, redirect to editor without code after completion
routingUtil.getAndPost(router, "/advance/:token", (req, res) =>
  //authorize, absence of code is detected in fullAuth
  routingUtil.fullAuth(req, res, (token, resDoc) => {
    //query object to be possibly extended by a vote result setter
    const query = {
      $inc: { stage: 1 }, //advance to next stage index
      $push: { stageHistory: Date.now() } //add timestamp to history
    };

    //if vote values are sent
    if (req.body && "inFavor" in req.body) {
      //determine vote type with stage we are advancing from
      const voteType = resDoc.stage === 6 ? "committee" : "plenary";

      //make voting reults object
      const voteResults = {
        //"|| 0" parse to number or use 0
        inFavor: parseInt(req.body.inFavor, 10) || 0,
        against: parseInt(req.body.against, 10) || 0,
        abstention: parseInt(req.body.abstention, 10) || 0,
        importantQuestion: Boolean(req.body.importantQuestion), //convert to boolean
        voteType
      };

      /*check and add prop whether or not this resolution passed.
      must be majority for pass and 2/3 majority (= two times more than...)
      for important question to pass*/
      voteResults.passed = voteResults.inFavor > voteResults.against *
        (voteResults.importantQuestion ? 2 : 1);

      //add whole thing to query
      query.$set = {
        //set result depending on which vote this is
        [`voteResults.${voteType}`]: voteResults
      };
    } else if (resDoc.stage === 6 || resDoc.stage === 10) {
      //needed vote results but got none
      issueError(req, res, 400, "got no vote results although they were required");
      return;
    }

    //add resolution id if going from stage 3 (FC) to 4 (print), regular advance otherwise
    (resDoc.stage === 3
      //get and increment resolution id for this year
      //needs findOneAndUpdate because we need the value of the modified doc
      ? collections.resolutionId.findOneAndUpdate({ year: new Date().getFullYear() }, {
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
        return resolutions.updateOne({ token }, query);
      })

      //execute and return query without adding resolution id
      : resolutions.updateOne({ token }, query)
    )

    //redirect to editor without code, prevent form resubmission
    .then(
      () => {
        //don't redirect if correct param set
        if (req.query.noui) {
          res.send("ok");
        } else {
          //regular redirect
          res.redirect(`/resolution/editor/${token}`);
        }
      },
      err => issueError(req, res, 500, "advance db error", err));
  }, {
    //error/warning page on fail
    permissionMissmatch: (token, resolutionDoc, codeDoc) => {
      //issue error if no ui, error page if user is viewing
      if (req.query.noui) {
        issueError(req, res, 400, "insufficient permission to advance");
      } else {
        //display error page
        res.render("weakperm", {
          type: "advance",
          token: resolutionDoc.token,
          stage: resolutionDoc.stage,
          accessLevel: codeDoc.level,
          attributes: resolutionDoc.attributes
        });
      }
    },
    //use advance match mode because advancement has specific permission requirements
    matchMode: "advance"
  })
);

//GET (no view, validation response) checks if sent token or code is valid (for form display)
router.get("/checkinput/:thing", (req, res) => {
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
    issueError(400, "sent thing unreadable, code/token?");
  }
});
