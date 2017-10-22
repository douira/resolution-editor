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
const WebSocketServer = require("ws").Server;

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

//websocket server
function receiveServer(httpServer) {
  //start the WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: (info, done) => {
      console.log(info);
      done(true);
    },
    clientTracking: true
  });

  //listen on client conections
  wss.on("connection", (ws, req) => {
    console.log("Connection request content", req);
    ws.on("message", (msg) => console.log("WebSocket received:", msg));
  });
}
