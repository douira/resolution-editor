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
const databaseInterface = require("../lib/database");
const uuidv4 = require("uuid/v4");
const detailedDiff = require("deep-object-diff").detailedDiff;
const deepEqual = require("fast-deep-equal");

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
databaseInterface((collections) => {
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
        //send edtor page but with "no access" notice
        res.render("weakperm-liveview", {
          token: resDoc.token,
          stage: resDoc.stage,
          accessLevel: codeDoc.level
        }),
      matchMode: "liveview"
    }
  );
});

//returns a function that iterates all viewers of the given object
function makeForEach(obj) {
  return (callback) => {
    //for all in object
    for (const prop in obj) {
      callback(obj[prop], prop, obj);
    }
  };
}

//sends an object json encoded to the server
function sendJson(ws, obj) {
  //send prepared object after stringify
  ws.send(JSON.stringify(obj));
}

/*returns a copy of the given object in which all arrays are plain objects.
used on clauses because we can't put a .diff property into an array in json.
if they are supposed to be arrays or not can still be determined by the property the arrays are in.
.sub is always filled with an array, all others are objects or strings*/
function deepConvertToObjects(obj) {
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
  console.log(obj);
  //for all props, expect the same diff types
  for (const prop in obj) {
    //not for .diff itself
    if (prop !== "diff") {
      //the diff type of this property
      let propDiffType;
      console.log("prop", prop);
      //must be present in diff type list or be an object
      if (typeof obj[prop] === "object") {
        //recurse
        propDiffType = markConsistentDiffs(obj[prop]);

        //if it is a truthy diff type, mark it as completely that type
        if (propDiffType) {
          obj.diff[prop] = propDiffType;
        }
      } else if (prop in obj.diff) {
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
    console.error("invalid path property segement:", prop, "in", prevObj);
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
        viewersForEach: makeForEach(viewers),
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
        tokenEntry.viewersForEach(viewerJoinedMsg);

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
        tokenEntry.viewersForEach(v => sendJson(v.socket, {
          //check if it's a replacement or new add
          type: tokenEntry.editor ? "editorReplaced" : "editorJoined"
        }));

        //register with token, overwrite last editor
        tokenEntry.editor = clientEntry;

        //send ack to start connection
        sendAck(ws, accessToken, tokenEntry, viewerAmount);
        break;
      case "updateStructure": //update messages
      case "updateContent":
      case "amendment":
        //is an amendment message
        if (data.type === "amendment") {
          //get amendment object
          const currentAmd = data.update.amendment;

          //create object for amendment data in token entry
          if ("amd" in tokenEntry) {//amd already present in token entry
            //last was recorded
            if (tokenEntry.amd.last) {
              //check if the structure changed significantly
              //and send to clients to make them do a structure update
              const lastAmd = tokenEntry.amd.last;
              currentAmd.structureChanged =
                lastAmd.type !== currentAmd.type || //change of type
                lastAmd.clauseIndex !== currentAmd.clauseIndex || //change of target clause
                //given that there are newClauses, check if they are the same
                ! (lastAmd.newClause && currentAmd.newClause &&
                   deepEqual(lastAmd.newClause, currentAmd.newClause));
            } else {
              //structure "changed" because it is the first amendment update
              currentAmd.structureChanged = true;
            }
          } else {
            //create new, no clearing necessary
            tokenEntry.amd = {};

            //mark as changed as there is no reference that this amendment could be similar to
            currentAmd.structureChanged = true;
          }

          //if amendment structure changed a re-render will be done by the clients
          if (currentAmd.structureChanged) {
            //attach the current (content updates applied) structure
            //for the new amendment to be applied to by the clients
            currentAmd.latestStructure = tokenEntry.latestStructure;

            //is change type amendment, requires newClause and oldClause to be present
            if (currentAmd.type === "change" && currentAmd.oldClause && currentAmd.newClause) {
              //remove arrays from both clauses
              currentAmd.oldClause = deepConvertToObjects(currentAmd.oldClause);
              currentAmd.newClause = deepConvertToObjects(currentAmd.newClause);

              //calculate a detailed group of diffs bewteen old and new clause
              const diffs = detailedDiff(currentAmd.oldClause, currentAmd.newClause);

              //for all three part (added, deleted and changed),
              //add color markers to the new clause for diff rendering
              ["updated", "added", "deleted"].forEach(diffType => {
                //process this diff type and thereby apply marking to the new clause
                processDiff(diffType, diffs[diffType], currentAmd.oldClause, currentAmd.newClause);
              });

              //traverse the now value-marked new clause again to find consistent objects
              //that can be marked as a whole because they were changed as a whole
              markConsistentDiffs(currentAmd.newClause);
            }
          }

          //save amendment
          tokenEntry.amd.last = currentAmd;
        } else if (data.type === "updateContent") {
          //apply content update to structure
          resolveChangePath(
            tokenEntry.latestStructure, //the current structure as saved by the server
            data.update.contentPath, //the path and content in the update sent by the editor
            data.update.content,
            tokenEntry.pathCache); //the cache built in previous content updates
        } //save structure update data to send to joining viewer clients
        else if (data.type === "updateStructure") {
          //save structure from editor as current
          tokenEntry.latestStructure = data.update;

          //reset path cache
          tokenEntry.pathCache = {};
        }

        //forward to clients listening on this token
        tokenEntry.viewersForEach((v) => sendJson(v.socket, {
          type: data.type,
          update: data.update
        }));
        break;
      default:
        console.log("unrecognised message type", data);
        return;
    }

    //check if we have to update the database and
    //if there is an editor and at least one viewer present
    if ((data.type === "initEditor" || data.type === "initViewer") &&
       tokenEntry.editor && Object.keys(tokenEntry.viewers)) {
      //then update the liveview timestamp in the database for this resolution
      resolutions.updateOne(
        { token: clientEntry.token }, { $set: { lastLiveview: Date.now() } }
      ).then(() => {});
    }
  }

  //sends an error
  function sendError(ws, msg, tryAgain, noClose) {
    //display error
    msg = "error: " + msg;
    console.log(msg);

    //send message to not tryagain if specified
    sendJson(ws, {
      type: "error",
      tryAgain: tryAgain,
      errorMsg: msg
    });

    //close connection on error if not specified otherwise
    if (! noClose) {
      ws.close();
    }
  }

  //returns a fucntions that send an error
  function errorSender(ws, msg, tryAgain, noClose) {
    return () => sendError(ws, msg, tryAgain, noClose);
  }

  //listen on client conections
  wss.on("connection", (ws) => {
    //access token for this client
    let accessToken;

    //wait for message
    ws.on("message", (msg) => {
      //decode json message
      let data;
      try {
        data = JSON.parse(msg);
      } catch (err) {
        sendError(ws, "non-json data received", true);
        return;
      }

      //authorize: check if accessToken sent matches the one set previously
      if (data.hasOwnProperty("accessToken") && accessToken === data.accessToken) {
        //deal with message
        processMessage(data, ws, data.accessToken);
      } else if (data.hasOwnProperty("token") && data.hasOwnProperty("code") &&
                 (data.type === "initViewer" || data.type === "initEditor")) {
        //get token and coe from data
        const token = data.token;
        const code = data.code;

        //check validitiy of token
        if (tokenProcessor.check(token)) {
          //select with given token
          resolutions.findOne({ token: token }).then((resDoc) => {
            //check for existance
            if (resDoc) {
              //must be valid code
              if (tokenProcessor.check(code)) {
                //load corresponding access entry
                access.findOne({ code: code }).then((codeDoc) => {
                  //code found
                  if (codeDoc) {
                    //check permission
                    if (resUtil.checkPermission(resDoc, codeDoc, "liveview")) {
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
                      processMessage(data, ws, accessToken, resDoc);
                    }
                  } else {
                    sendError(ws, "code wrong");
                  }
                }).catch(errorSender(ws, "code db read error", true));
              } else {
                sendError(ws, "code invalid");
              }
            } else {
              sendError(ws, "token wrong");
            }
          }).catch(errorSender(ws, "token db read error", true));
        } else {
          sendError(ws, "token invalid");
        }
      } else {
        sendError(ws, "missing data", true);
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
        tokenEntry.viewersForEach((v) => sendJson(v.socket, { type: "editorGone" }));

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
  });
}
