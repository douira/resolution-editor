const express = require("express");
const router = express.Router();
module.exports = router;
const resolutionFormat = require("../public/js/resolutionFormat");
const phrases = require("../public/phrases.json");
const { issueError } = require("../lib/logger");
const routingUtil = require("../lib/routingUtil");
const resUtil = require("../lib/resUtil");

//get feedback collection
let feedbackCollection;
require("../lib/database").fullInit.then(collections => {
  feedbackCollection = collections.feedback;
});

//GET render help page
router.get("/", (req, res) => res.render("help", { phrases }));

//GET resolution stucture definition
router.get("/formatdefinition", (req, res) =>
  //render help page
  res.render("formatdefinition", {
    data: resolutionFormat.resolutionFileFormat,
    dataJson: JSON.stringify(resolutionFormat.resolutionFileFormat, null, 2)
  })
);

//GET render content guidelines page (static)
router.get("/contentguidelines", (req, res) => res.render("contentguidelines"));

//GET only render feedback form page
router.get("/feedback", (req, res) => res.render("feedbackform"));

//GET render feedback form with ok reponse
router.get("/feedback/ok", (req, res) =>
  res.render("feedbackform", { response: "ok" })
);

//processes the message components for saving: trim and limit to n chars
const prepareFeedbackComponent = (str, n) => str.trim().substring(0, n);

//POST receives feedback form data and saves it
router.post("/feedback/receive", (req, res) => {
  //discard invalid responses
  if (!(req.body && req.body.message)) {
    //display error sending feedback page and stop process
    res.render("feedbackform", { response: false });
  }

  //build feedback object
  const feedback = {
    //limit message length to 10000 chars
    message: prepareFeedbackComponent(req.body.message, 10000),

    //add timestamp
    timestamp: Date.now()
  };

  //add name and email if given
  if (req.body.name) {
    feedback.name = prepareFeedbackComponent(req.body.name, 100);
  }
  if (req.body.email) {
    feedback.email = prepareFeedbackComponent(req.body.email, 100);
  }

  //save feedback in database
  feedbackCollection.insertOne(feedback).then(
    () => {
      //redirect to feedback form, prevent resubmission
      res.redirect("/help/feedback/ok");
    },
    err => issueError(req, res, 500, "could not save feedback data to db", err)
  );
});

//require admin or SG session for feedback list
router.use("/feedback/list", (req, res, next) =>
  routingUtil.requireSession("semi-admin", req, res, () => next())
);

//GET display all feedback with booklet rights
router.get("/feedback/list", (req, res) =>
  //get all feedback from db
  feedbackCollection
    .find({}, { sort: ["timestamp"] })
    .toArray()
    .then(
      messages => {
        //respond with rendered list of feedback items
        res.render("feedbacklist", {
          //format all timestamps
          messages: messages.map(m => {
            m.timestamp = resUtil.getFormattedDate(m.timestamp);
            return m;
          })
        });
      },
      err => issueError(req, res, 500, "could not query feedback list", err)
    )
);
