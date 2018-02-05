/*jshint esversion: 6, node: true */

const databaseInterface = require("../lib/database").callback;
const tokenProcessor = require("../lib/token");
const resUtil = require("../lib/resUtil");
const resolutionFormat = require("../public/js/resolutionFormat").resolutionFormat;

const issueError = resUtil.issueError;

//register callback to get collections on load
let resolutions, access;
databaseInterface(collections => {
  resolutions = collections.resolutions;
  access = collections.access;
});

//delegate no privilege access code doc
const delegateCodeDoc = { level: "DE" };

//export object of functions
const routingUtil = module.exports = {
  //registers a handler on the router for both GET and POST
  getAndPost: (onRouter, url, handler) => ["get", "post"].forEach(method =>
    onRouter[method](url, (req, res) => handler(req, res))),

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
          issueError(res, 400, "token wrong");
        }
      }).catch(issueError.bind(null, res, 500, "token db read error"));
    } else {
      issueError(res, 400, "token invalid");
    }
  },

  //deals with access code in POST
  checkCode: (req, res, callback) => {
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
          issueError(res, 400, "code wrong");
        }
      }).catch(issueError.bind(null, res, 500, "code db read error"));
    } else {
      issueError(res, 400, "code invalid");
    }
  },

  //does a code and static permission check
  checkCodeStaticPerm: (req, res, permMode, callback, errCallback) => {
    //do simple code auth
    routingUtil.checkCode(req, res, codeDoc => {
      //check that the code matches the required permission
      if (resUtil.checkStaticPermission(codeDoc, permMode)) {
        callback(codeDoc);
      } else if (typeof errCallback === "function") {
        errCallback();
      } else {
        //error if no callback given
        issueError(res, 400, "code has insufficient permissions");
      }
    });
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
  },

  //does auth with code, gets resolution doc given and does code and permission check
  authWithCode: (res, resolutionDoc, codeDoc, callback, opts) => {
    //do permission auth
    if (resUtil.checkPermission(
      resolutionDoc, codeDoc,
      typeof opts === "undefined" ? undefined : opts.matchMode || undefined)) {
      //call callback with everything gathered
      callback(resolutionDoc.token, resolutionDoc, codeDoc);
    } else if (opts.hasOwnProperty("permissionMissmatch")) {
      //call alternative callback if given
      opts.permissionMissmatch(resolutionDoc.token, resolutionDoc, codeDoc);
    } else {
      issueError(res, 400, "not authorized");
    }
  },

  //does full auth procedure (token, POSTed code and permission match)
  fullAuth: (req, res, callback, opts) => {
    //check for token
    routingUtil.checkToken(req, res, (token, resolutionDoc) => {
      //check if a code was sent
      if (req.body && req.body.code && req.body.code.length) {
        //check sent code
        routingUtil.checkCode(req, res, codeDoc => {
          routingUtil.authWithCode(res, resolutionDoc, codeDoc, callback, opts);
        });
      } else {
        //use "DE" delegate level code doc
        routingUtil.authWithCode(res, resolutionDoc, delegateCodeDoc, callback, opts);
      }
    });
  }
};
