/*jshint esversion: 6, node: true */

const tokenProcessor = require("../lib/token");
const resUtil = require("../lib/resUtil");
const resolutionFormat = require("../public/js/resolutionFormat");
const { issueError } = require("../lib/logger");

//register callback to get collections on load
let resolutions, access;
require("../lib/database").fullInit.then(collections => {
  resolutions = collections.resolutions;
  access = collections.access;
});

//delegate no privilege access code doc
const delegateCodeDoc = { level: "DE" };

//export object of functions
const routingUtil = module.exports = {
  //registers a handler on the router for both GET and POST
  getAndPost: (onRouter, url, handler) => ["get", "post"].forEach(method =>
    onRouter[method](url, handler)),

  //deals with token in URL and calls callback if token present in db
  checkToken: function(req, res, modifyResolution, callback) {
    //if only three args, callback is in modifyResolution
    let doModify = true;
    if (arguments.length === 3) {
      callback = modifyResolution;

      //set flag to use the regular findOne instead
      doModify = false;
    }

    //get token from params
    const token = req.params.token || req.params.thing;

    //must be "token" type and be valid
    if (tokenProcessor.check(token)) {
      //load corresponding resolution
      (doModify ? //modify as well if flag set
        resolutions.findOneAndUpdate({ token: token }, modifyResolution, { returnOriginal: true })
        : resolutions.findOne({ token: token })
      ).then(document => {
        //check for existance, check .value if doModify is true
        if (document && (! doModify || document.value)) {
          //call callback with gotten document
          callback(token, doModify ? document.value : document);
        } else {
          issueError(req, res, 400, "token wrong");
        }
      }).catch(issueError.bind(null, res, 500, "token db read error"));
    } else {
      issueError(req, res, 400, "token invalid");
    }
  },

  //deals with access code in POST
  checkCode: (req, res, callback) => {
    //if session is given, code is implicity present
    if (req.session.doc) {
      //stop and call callback with gotten codedoc from session
      callback(req.session.doc);
      return;
    }

    //get code from params
    const code = req.body.code || req.params.thing;

    //must be "code" type and be valid
    if (tokenProcessor.check(code)) {
      //load corresponding access entry
      access.findOne({ code: code }).then(document => {
        //code found
        if (document) {
          //call callback with gotten code doc
          callback(document);
        } else {
          issueError(req, res, 400, "code wrong");
        }
      }).catch(issueError.bind(null, res, 500, "code db read error"));
    } else {
      issueError(req, res, 400, "code invalid");
    }
  },

  //requires session login to be compatible with the given permission mode
  requireSession: (permMode, req, res, callback) => {
    //check for session and validate permission with permission check
    if (req.session && req.session.code &&
        (permMode === "any" || resUtil.checkStaticPermission(req.session.doc, permMode))) {
      //has session, call callback as user is permitted
      callback(req.session.doc);
    } else {
      //needs login, redirect to login page, include current url component as get query
      res.redirect("/session/login?backto=" + encodeURIComponent(req.originalUrl));
    }
  },

  //deals with resolutions in req.body and checks them against the format
  checkBodyRes: (req, res, callback) => {
    //needs to be present
    if (req.body && typeof req.body === "object") {
      //get resolution from post content
      let resolution = req.body.content;

      //attempt parse
      try {
        resolution = JSON.parse(resolution);
      } catch (e) {
        issueError(req, res, 400, "parse error");
        return;
      }

      //must match format
      if (resolutionFormat.check(resolution)) {
        callback(resolution);
      } else {
        issueError(req, res, 400, "format invalid");
      }
    } else {
      issueError(req, res, 400, "nothing sent");
    }
  },

  //does auth with code, gets resolution doc given and does code and permission check
  authWithCode: (req, res, resolutionDoc, codeDoc, callback, opts) => {
    //do permission auth
    if (resUtil.checkPermission(resolutionDoc, codeDoc, opts && opts.matchMode)) {
      //call callback with everything gathered
      callback(resolutionDoc.token, resolutionDoc, codeDoc);
    } else if (typeof opts.permissionMissmatch === "function") {
      //call alternative callback if given
      opts.permissionMissmatch(resolutionDoc.token, resolutionDoc, codeDoc);
    } else {
      issueError(req, res, 400, "not authorized");
    }
  },

  //does full auth procedure (token, POSTed code and permission match)
  fullAuth: (req, res, callback, opts) => {
    //check for token
    routingUtil.checkToken(req, res, (token, resolutionDoc) => {
      //check for session
      if (req.session.doc) {
        //no need to check code, session has already been validated, authorize
        routingUtil.authWithCode(req, res, resolutionDoc, req.session.doc, callback, opts);
      } //check if a code was sent or session doc is present
      else if (req.body && req.body.code && req.body.code.length) {
        //check sent code
        routingUtil.checkCode(req, res, codeDoc => {
          routingUtil.authWithCode(req, res, resolutionDoc, codeDoc, callback, opts);
        });
      } else {
        //use "DE" delegate level code doc
        routingUtil.authWithCode(req, res, resolutionDoc, delegateCodeDoc, callback, opts);
      }
    });
  }
};
