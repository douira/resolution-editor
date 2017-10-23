/*jshint esversion: 6, node: true */

/*
Protocol (C client, S server)
LV-client:
  1. (http) C connects and sends token and code to POST endpoint
  2. (http) S checks them in DB (also state of resolution)
     and if ok returns code, token, salted hash of it = access token (salt is a server secret)
     and current content of the resolution for that token
  3. (ws) S sends update messages to LV clients listening for a specific token
Editor-client:
  1. (ws) C connects if authorized and at state 6 and authorized
  2. (ws) S stop connection if wrong
  3. (ws) C then sends content or structure updates every time the editor sees a change
*/

const express = require("express");
const router = express.Router();
const routingUtil = require("../lib/routingUtil");
const resUtil = require("../lib/resUtil");
const WebSocketServer = require("ws").Server;
const tokenProcessor = require("../lib/token");
const databaseInterface = require("../lib/database");
const uuidv4 = require('uuid/v4');

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

//returns fucntion that iterates all viewers of the given object
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
  function processMessage(data, ws, accessToken) {
    //get client entry for access token
    const clientEntry = clients[accessToken];

    //create token entry if not present
    if (! tokens.hasOwnProperty(clientEntry.token)) {
      const viewers = {};
      tokens[clientEntry.token] = {
        editor: null,
        viewers: viewers,
        viewersForEach: makeForEach(viewers)
      };
    }

    //get token entry
    const tokenEntry = tokens[clientEntry.token];

    //on type of message
    switch (data.type) {
      case "initViewer": //first message sent by liveview client for registration
        //register as viewer
        clientEntry.clientType = "viewer";

        //register with token
        tokenEntry.viewers[accessToken] = clientEntry;

        //notify editor of joined viewer
        if (tokenEntry.editor) {
          //get number of viewers
          const viewerAmount = Object.keys(tokenEntry.viewers).length;

          //notify with amount
          sendJson(tokenEntry.editor.socket, {
            type: "viewerJoined",
            amount: viewerAmount,
            sendUpdates: true //editor should be sending update messages
          });
        }

        //respond to viewer with access token
        sendJson(ws, {
          type: "ackInit",
          accessToken: accessToken
        });
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
        tokenEntry.viewersForEach((v) => sendJson(v.socket, {
          //check if it's a replacement or new add
          type: tokenEntry.editor ? "editorReplaced" : "editorJoined"
        }));

        //register with token, overwrite last editor
        tokenEntry.editor = clientEntry;

        //respond with access token
        sendJson(ws, {
          type: "ackInit",
          accessToken: accessToken
        });
        break;
      case "updateStructure": //both types of update messages
      case "updateContent":
        //foreward to clients listening on this token
        tokenEntry.viewersForEach((v) => sendJson(v.socket, {
          type: data.type,
          update: data.update
        }));
        break;
      default:
        console.log("unrecognised message type", data);
        return;
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
      } else if (data.hasOwnProperty("token") && data.hasOwnProperty("code")) {
        //get token and coe from data
        const token = data.token;
        const code = data.code;

        //check validitiy of token
        if (tokenProcessor.check(token)) {
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
                      //all is ok now, generate accessToken for client
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
                      processMessage(data, ws, accessToken);
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

          sendJson(tokenEntry.editor.socket, {
            type: "viewerLeft",
            amount: viewerAmount,
            sendUpdates: viewerAmount //editor only has to send updates if still more than 0 viewers
          });
        }
      } else {
        //notify viewers of editor having left
        tokenEntry.viewersForEach((v) => sendJson(v.socket, { type: "editorGone" }));

        //remove
        tokenEntry.editor = null;
      }

      //revoke access token
      delete clients[accessToken];
      accessToken = null;
    });
  });
}
