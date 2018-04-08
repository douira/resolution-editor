/*jshint esversion: 6, node: true */

/*
Protocol (C client, S server)
LV-client:
  1. (http) C connects and sends token and code to POST endpoint
  2. (http) S checks them in DB (also state of resolution)
     and if ok returns code, token, random access token uuid
      (to prevent querying the DB every time an update comes in)
     and current content of the resolution for that token
  3. (ws) S sends update messages to LV clients listening for a specific token
Editor-client:
  1. (ws) C connects if authorized and at state 6 (or MA code) and authorized
  2. (ws) S stop connection if wrong (bad authentification/authorization)
    send access token if ok, to reason above
  3. (ws) C then sends content or structure updates every time the editor sees a change
*/

const express = require("express");
const router = express.Router();
const routingUtil = require("../lib/routingUtil");
const resUtil = require("../lib/resUtil");
const WebSocketServer = require("ws").Server;
const tokenProcessor = require("../lib/token");
const uuidv4 = require("uuid/v4");
const detailedDiff = require("deep-object-diff").detailedDiff;
//const deepEqual = require("fast-deep-equal");
const { logger } = require("../lib/logger");
const pick = require("object.pick");

//const inspect = require("../lib/inspect");

/*testDiff();
function testDiff() {
  //TODO: make enclosing object not be marked as "deleted" or "added" although
  //for TESTING only, remove
  let oldClause = {
    phrase: "gfdgfd",
    sub: [
      {
        content: "hggfhgfhg",
        hert: "hghgf"
      }
    ]
  };
  let newClause = {
    phrase: "gfdgfd",
    sub: [
      {
        content: "hggfhgfhg"
      },
      {
        content: "gfdgfdg"
      }
    ]
  };

  //remove arrays from both clauses
  oldClause = deepConvertToObjects(oldClause);
  newClause = deepConvertToObjects(newClause);

  //calculate a detailed group of diffs bewteen old and new clause
  const diffs = detailedDiff(oldClause, newClause);
  inspect(oldClause);
  inspect(newClause);
  inspect(diffs);
  //for all three part (added, deleted and changed),
  //add color markers to the new clause for diff rendering
  ["updated", "added", "deleted"].forEach(diffType => {
    //process this diff type and thereby apply marking to the new clause
    processDiff(diffType, diffs[diffType], oldClause, newClause);
  });

  markConsistentDiffs(newClause);

  inspect(oldClause);
  inspect(newClause);
  console.log(JSON.stringify(newClause, null, 2));
}*/

//get database connections
let resolutions, access;
require("../lib/database").fullInit.then(collections => {
  resolutions = collections.resolutions;
  access = collections.access;
});

//expose router
module.exports = {
  router: router,
  giveHttpServer: receiveServer
};

//POST, GET for fallback but never allows (view) the liveview page
routingUtil.getAndPost(router, "/:token", function(req, res) {
  //check for token and code and correct stage (liveview permission mode)
  routingUtil.fullAuth(req, res,
    (token, resDoc, codeDoc) =>
      //send rendered editor page with token set
      res.render("liveview", {
        token: token,
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
  );
});

//iterates all viewers of the given object
function forEachObj(obj, callback) {
  //for all in object
  for (const prop in obj) {
    callback(obj[prop], prop, obj);
  }
}

//sends an object json encoded to a websocket client
function sendJson(ws, obj) {
  //send prepared object after stringify
  ws.send(JSON.stringify(obj));
}

//send an error to the given socket
function wsError(ws, msg, opts) {
  //apply message prefix
  msg = "lv error: " + msg;

  //opts if object if not given
  opts = opts || { };

  //take socket logger if present, default otherwise
  const log = (ws && ws.log) || logger;

  //check that socket is stil lactive
  if (ws && ws.readyState === ws.OPEN) {
    //send error message
    sendJson(ws, {
      type: "error",
      tryAgain: opts.tryAgain || false,
      errorMsg: msg
    });

    //close if not specified otherwise
    if (! opts.noClose && opts.type !== "warn") {
      ws.close();
    }
  }

  //log error message and error if give
  if (opts.type && opts.type !== "error") {
    //other message type
    log[opts.type](msg);
  } else if (opts.err) {
    log.error(opts.err, msg);
  } else {
    log.error(msg);
  }
}

/*returns a copy of the given object in which all arrays are plain objects.
used on clauses because we can't put a .diff property into an array in json.
if they are supposed to be arrays or not can still be determined by the property the arrays are in.
.sub is always filled with an array, all others are objects or strings*/
function deepConvertToObjects(obj) {
  //must be object
  if (typeof obj !== "object") {
    //return unmodified
    return obj;
  }

  //create object to put in
  const newObj = {};

  //for all properties
  for (const prop in obj) {
    //get value of this property
    const value = obj[prop];

    //value is an object
    newObj[prop] = (typeof value === "object") ?
      //recurse, arrays will be copied as objects by enumerating them in the for loop
      deepConvertToObjects(value) :

      //simply copy literal value
      value;
  }

  //return created object
  return newObj;
}

//a function that will recursive look through a diff and apply markers
function processDiff(diffType, diff, oldClausePart, newClausePart) {
  //create diff property in clausePart if not already present
  //as marker for renderer, diff types will be merged if overlapping
  if (typeof newClausePart.diff === "undefined") {
    newClausePart.diff = {};
  }

  //for all props of the diff
  for (const prop in diff) {
    //get the contained value
    const value = diff[prop];

    //check if it is another object
    if (typeof value === "object") {
      //create property in the clause object part if not present already
      if (! (prop in newClausePart)) {
        //create new object in clause
        newClausePart[prop] = {};
      }

      //run diff marking recursively
      processDiff(diffType,
        //the diff seems to make non-deep copies of object (which cause infinite recursion),
        //if value is the same object as newClausePart[prop],
        //break the reference by making value a clone
        value === newClausePart[prop] ? Object.assign({}, value) : value,

        //only pass property of old clause if it can have any
        oldClausePart && oldClausePart[prop], newClausePart[prop]);
    } else {
      //value was deleted
      if (diffType === "deleted") {
        //old values of changed fields are not preserved but simply marked changed in yellow

        //register the old value if it was deleted so it can be displayed in red as deleted
        newClausePart[prop] = oldClausePart[prop];
      }

      /*
      allow setting of diff types only on value properties,
      because it may otherwise seem like a whole part of the clause was changed, although a
      deleted mark only progressed up the clause tree because it was the only change.
      A second pass is performed to check for marking complete object as one diff type.
      Because this will only visit this particular value once
      we don't have to worry about overriding it with another diff type.
      */
      newClausePart.diff[prop] = diffType;
    }
  }
}

//marks objects that are consistently and completely marked as the same diff type with that type
function markConsistentDiffs(obj) {
  //the observed change type, returns false if two different ones are found
  let changeType;

  //for all props, expect the same diff types
  for (const prop in obj) {
    //not for .diff itself
    if (prop !== "diff") {
      //the diff type of this property
      let propDiffType;

      //must be present in diff type list or be an object
      if (typeof obj[prop] === "object") {
        //recurse
        propDiffType = markConsistentDiffs(obj[prop]);

        //if it is a truthy diff type, mark it as completely that type
        if (propDiffType) {
          obj.diff[prop] = propDiffType;
        }
      } else if (obj.diff && prop in obj.diff) {
        //get from diff list
        propDiffType = obj.diff[prop];
      } else {
        //not consistent, this property has no diff type
        changeType = false;
      }

      //must be the first tested prop or consistent for the object to stay consistent
      if (typeof changeType === "undefined") {
        //set as new
        changeType = propDiffType;
      } //if changeType was already set and they are the same, this object is consistent
      else if (changeType !== propDiffType) {
        //not consistent, one prop has a different diff type
        changeType = false;
      }
    }
  }

  //remove diff property if it has no contents
  if (obj.diff && ! Object.keys(obj.diff).length) {
    delete obj.diff;
  }

  //add length property if numeric indexes found
  if ("0" in obj) {
    //length is the length of the keys in the object array, we can assume a dense array
    obj.length = Object.keys(obj).length - 1;
  }

  //return consistent diff type (or false if it is inconsistent)
  return changeType;
}

//applies a content update to an object
function resolveChangePath(prevObj, remainingPath, setValue, cache, dontReadCacheOrPathString) {
  //make a string from the path
  const pathString = remainingPath.join(",");

  //check if path can be found on cache, don't cache if path string given (in deeper level)
  if (! dontReadCacheOrPathString && typeof cache === "object") {
    //if it is present in the cache
    if (typeof cache[pathString] === "object") {
      //modify object from cache, the first element from the path is the last selector to make
      cache[pathString][remainingPath[0]] = setValue;

      //stop, value was set
      return;
    }
  }

  //get next property
  const prop = remainingPath.pop();

  //error if property not present
  if (! (prop in prevObj)) {
    logger.error({ prop: prop, prevObj: prevObj }, "invalid path property segement");

    //stop, will actually throw error otherwise
    return;
  }

  //if there are still steps more to be taken in the path
  if (remainingPath.length) {
    //resolve one step further
    prevObj = prevObj[prop];

    //go one level deeper, don't try to find smaller pieces of the path in the cache
    resolveChangePath(prevObj, remainingPath, setValue, cache, pathString);
  } else {
    //finished resolving, set value
    prevObj[prop] = setValue;

    //cache result if cache is an object
    if (typeof cache === "object") {
      cache[dontReadCacheOrPathString] = prevObj;
    }
  }
}

//websocket server
function receiveServer(httpServer) {
  //start the WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    clientTracking: true,
    path: "/resolution/liveview/ws"
  });

  //currently connected viewers and editors
  const clients = {};

  //list of tokens with their data suppliers and viewers
  const tokens = {};

  //processes received messages
  function processMessage(data, ws, accessToken, resDoc) {
    //get client entry for access token
    const clientEntry = clients[accessToken];

    //create token entry if not present
    if (! tokens.hasOwnProperty(clientEntry.token)) {
      const viewers = {};
      tokens[clientEntry.token] = {
        editor: null,
        viewers: viewers,
        pathCache: {} //init with empty path cache
      };
    }

    //responds with access token in ackInit
    function sendAck(ws, accessToken, tokenEntry, viewerAmount, resolutionData) {
      //data object to send to client
      const sendData = {
        type: "ackInit",
        accessToken: accessToken,
        viewerAmount: viewerAmount,
        sendUpdates: viewerAmount > 0,
        editorPresent: tokenEntry.editor ? true : false //true if editor present
      };

      //add resolutionData if given
      if (typeof resolutionData !== "undefined") {
        //resolution data to get the viewer started
        sendData.resolutionData = resolutionData;
      }

      //respond to viewer with access token
      sendJson(ws, sendData);
    }

    //get token entry
    const tokenEntry = tokens[clientEntry.token];

    //add resolution from db as latestStructure if resDoc given and none there yet
    if (typeof resDoc === "object" && ! tokenEntry.latestStructure) {
      tokenEntry.latestStructure = resDoc.content;
    }

    //get number of viewers
    let viewerAmount = Object.keys(tokenEntry.viewers).length;

    //notify of joined viewer with amount
    function viewerJoinedMsg(sendTo) {
      sendJson(sendTo.socket, {
        type: "viewerJoined",
        amount: viewerAmount,
        sendUpdates: true //editor should be sending update messages
      });
    }

    //forwards data to all clients listening this token
    function dataToAllViewers() {
      forEachObj(tokenEntry.viewers, v => sendJson(v.socket, {
        type: data.type,
        update: data.update
      }));
    }

    //on type of message
    switch (data.type) {
      case "initViewer": //first message sent by liveview client for registration
        //register as viewer
        clientEntry.clientType = "viewer";

        //increment viewer amount because this message means that one is joining
        viewerAmount ++;

        //send ack to start connection
        sendAck(ws, accessToken, tokenEntry, viewerAmount, tokenEntry.latestStructure);

        //notify editor and viewers of joined viewer
        if (tokenEntry.editor) {
          viewerJoinedMsg(tokenEntry.editor);
        }
        forEachObj(tokenEntry.viewers, viewerJoinedMsg);

        //register with token
        tokenEntry.viewers[accessToken] = clientEntry;
        break;
      case "initEditor": //message sent by eligible editor clients
        //register as editor data sender
        clientEntry.clientType = "editor";

        //if present, notify editor of it's replacement
        if (tokenEntry.editor) {
          sendJson(tokenEntry.editor.socket, {
            type: "replacedByOther",
            sendUpdates: false
          });
        }

        //notify viewers of editor
        forEachObj(tokenEntry.viewers, v => sendJson(v.socket, {
          //check if it's a replacement or new add
          type: tokenEntry.editor ? "editorReplaced" : "editorJoined"
        }));

        //register with token, overwrite last editor
        tokenEntry.editor = clientEntry;

        //send ack to start connection
        sendAck(ws, accessToken, tokenEntry, viewerAmount);
        break;
      case "amendment": //amendment message
        //get amendment object, we expect the structure to have changed significantly
        //if a client sends an amendment update, content is updated through content updates
        const currentAmd = data.update;

        //amendment structure changed and a re-render will be done by the clients

        //attach the current (content updates applied) structure
        //for the new amendment to be applied to by the clients
        //currentAmd.latestStructure = tokenEntry.latestStructure;

        //old clause can be gotten by index from the resolution structure
        let oldClause =
          tokenEntry.latestStructure.resolution.clauses.operative[currentAmd.clauseIndex];

        //is change type amendment, requires newClause to be present
        if (currentAmd.type === "change" && currentAmd.newClause) {
          //remove arrays from both clauses
          oldClause = deepConvertToObjects(oldClause); //currentAmd.oldClause =
          currentAmd.newClause = deepConvertToObjects(currentAmd.newClause);

          //calculate a detailed group of diffs bewteen old and new clause
          const diffs = detailedDiff(oldClause, currentAmd.newClause);

          //for all three part (added, deleted and changed),
          //add color markers to the new clause for diff rendering
          ["updated", "added", "deleted"].forEach(diffType => {
            //process this diff type and thereby apply marking to the new clause
            processDiff(diffType, diffs[diffType], oldClause, currentAmd.newClause);
          });

          //traverse the now value-marked new clause again to find consistent objects
          //that can be marked as a whole because they were changed (updated, added...) as a whole
          markConsistentDiffs(currentAmd.newClause);
        }

        //save amendment
        tokenEntry.amd = currentAmd;

        //forward to all viewers
        dataToAllViewers();

        break;
      case "saveAmd": //reject or apply an amendment
        //get the update content
        const saveAmdUpdate = data.update;

        //get type of save event, reject or accept
        const saveType = saveAmdUpdate.saveType;

        //validate save type
        if (! ["reject", "apply"].includes(saveType)) {
          //bad type, error and stop
          wsError(ws, "bad amd save type " + saveType);
          return;
        }

        //check all aspects of the given save amendment
        if (
          //validate sponsor
          ! (saveAmdUpdate.sponsor && typeof saveAmdUpdate.sponsor === "string" &&

          //validate action type
          saveAmdUpdate.type &&
          ["change", "add", "replace", "remove"].includes(saveAmdUpdate.type) &&

          //validate clause existence if necessary
          (typeof saveAmdUpdate.newClause === "object" && saveAmdUpdate.newClause.phrase ||
          saveAmdUpdate.type === "remove") &&

          //validate presence of clauseIndex if necessary
          (typeof saveAmdUpdate.clauseIndex === "number" || saveAmdUpdate.type === "add") &&

          //validate existence of new structure
          typeof saveAmdUpdate.newStructure === "object")
        ) {
          //error and stop
          wsError(ws, "invalid or incomplete amendment given for save");
          return;
        }

        //additional info to save the in the amendment history
        const amdHistoryExtend = {
          //extend with log info and remove full structure
          timestamp: Date.now()
        };

        //if index if is given
        if (saveAmdUpdate.clauseIndex) {
          //add clause that was acted upon
          amdHistoryExtend.changedClause =
            tokenEntry.latestStructure.resolution.clauses.operative[saveAmdUpdate.clauseIndex];
        }

        //use the given resolution as the new structure
        tokenEntry.latestStructure = saveAmdUpdate.newStructure;

        //reset path cache
        tokenEntry.pathCache = {};

        //forward to all viewers
        dataToAllViewers();

        //append amendment to amendment history of resolution
        resolutions.updateOne({
          token: clientEntry.token
        }, {
          $push: {
            amendments: Object.assign(
              amdHistoryExtend,
              pick(saveAmdUpdate, ["clauseIndex", "newclause", "type", "saveType"])
            )
          }
        }).catch(
          //log db error
          err => wsError(ws, "failed to save amendment to resolution", { err: err })
        );
        break;
      case "updateContent":
        //what object the update should be applied to
        let applyUpdateTo = tokenEntry.latestStructure.resolution.clauses;

        //the path to the property to change
        const updatePath = data.update.contentPath.slice();

        //is amendment content update
        if (updatePath[updatePath.length - 1] === "amendment") {
          //remove amendment flag and set amendment as object to be modified
          updatePath.pop();
          applyUpdateTo = tokenEntry.amd.newClause;
        }

        //apply content update to structure
        resolveChangePath(
          //the current structure as saved by the server
          applyUpdateTo,
          updatePath, //the path and content in the update sent by the editor
          data.update.content,
          tokenEntry.pathCache); //the cache built in previous content updates

        //forward to all viewers
        dataToAllViewers();

        break;
      case "updateStructure": //save structure update data to send to joining viewer clients
        //save structure from editor as current
        tokenEntry.latestStructure = data.update;

        //reset path cache
        tokenEntry.pathCache = {};

        //forward to all viewers
        dataToAllViewers();

        break;
      default:
        logger.warn({ data: data }, "unrecognised message type");
        return;
    }

    //check if we have to update the database and
    //if there is an editor and at least one viewer present
    if ((data.type === "initEditor" || data.type === "initViewer") &&
       tokenEntry.editor && Object.keys(tokenEntry.viewers)) {
      //then update the liveview timestamp in the database for this resolution
      resolutions.updateOne(
        { token: clientEntry.token }, { $set: { lastLiveview: Date.now() } }
      ).catch(
        err => logger.error(err, "could not update last liveview timestamp")
      );
    }
  }

  //listen on client conections
  wss.on("connection", ws => {
    //access token for this client
    let accessToken;

    //add bound field reqId to chain all log entries for a single socket
    ws.log = logger.child({ req_id: uuidv4() });

    //wait for message
    ws.on("message", msg => {
      //decode json message
      let data;
      try {
        data = JSON.parse(msg);
      } catch (err) {
        wsError(ws, "non-json data received", { tryAgain: true });
        return;
      }

      //authorize: check if accessToken sent matches the one set previously
      if (data.accessToken && data.accessToken === accessToken) {
        //deal with message
        try {
          processMessage(data, ws, data.accessToken);
        } catch (err) {
          wsError(ws, "error processing message");
        }
      } else if (data.token && data.code &&
                 (data.type === "initViewer" || data.type === "initEditor")) {
        //get token and coe from data
        const token = data.token;
        const code = data.code;

        //check validitiy of token
        if (tokenProcessor.check(token)) {
          //select with given token
          resolutions.findOne({ token: token }).then(resDoc => {
            //check for existance and valid code
            if (resDoc && tokenProcessor.check(code)) {
              //load corresponding access entry
              access.findOne({ code: code }).then(codeDoc => {
                //code found and check permission
                if (codeDoc && resUtil.checkPermission(resDoc, codeDoc, "liveview")) {
                  //all is ok now, generate new random accessToken for client
                  accessToken = uuidv4();

                  //create entry in clients
                  const clientEntry = {
                    socket: ws,
                    token: token,
                    code: code,
                    accessToken: accessToken
                  };
                  clients[accessToken] = clientEntry;

                  //process message and pass client info
                  try {
                    processMessage(data, ws, accessToken, resDoc);
                  } catch (err) {
                    wsError(ws, "error processing message (new auth)");
                  }
                } else {
                  wsError(ws, "code wrong or missing permission");
                }
              }).catch(err => wsError(ws, "code db read error", { tryAgain: true, err: err }));
            } else {
              wsError(ws, "token wrong or invalid");
            }
          }).catch(err => wsError(ws, "token db read error", { tryAgain: true, err: err }));
        } else {
          wsError(ws, "token invalid");
        }
      } else {
        wsError(ws, "missing data", { tryAgain: true });
      }
    });

    //on closing of connection
    ws.on("close", () => {
      //stop if connection is closing before having given out an access token
      if (! accessToken) {
        return;
      }

      //get client entry for access token
      const clientEntry = clients[accessToken];

      //delete from token entry
      const tokenEntry = tokens[clientEntry.token];
      if (clientEntry.clientType === "viewer") {
        //remove
        delete tokenEntry.viewers[clientEntry.accessToken];

        //notify editor of viewer having left
        if (tokenEntry.editor) {
          //get number of viewers
          const viewerAmount = Object.keys(tokenEntry.viewers).length;

          //update editor on viewer leaving
          sendJson(tokenEntry.editor.socket, {
            type: "viewerLeft",
            amount: viewerAmount,
            //editor only has to send updates if still more than 0 viewers
            sendUpdates: viewerAmount > 0
          });
        }
      } else {
        //notify viewers of editor having left
        forEachObj(tokenEntry.viewers, v => sendJson(v.socket, { type: "editorGone" }));

        //remove
        tokenEntry.editor = null;
      }

      //remove token entry if no viewer and no editor present (memory flush)
      if (! tokenEntry.editor && ! Object.keys(tokenEntry.viewers).length) {
        delete tokens[clientEntry.token];
      }

      //revoke access token
      delete clients[accessToken];
      accessToken = null;
    });

    //on connection error
    ws.on("error", err => {
      //log connection error
      wsError(ws, "connection error", { err: err });
    });
  });
}
