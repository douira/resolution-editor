/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*exported startLiveviewWS*/
/* global makeAlertMessage,
  displayToast*/

//how many times we will try to connect
var triesLeft = 3;

//reference to the current websocket for closing it on page unload
var currentWS;

//token and code given on page
var presetToken;
var presetCode;

//starts a websockets connection to the server
function startWS(isViewer) {
  //decrement try coutner
  triesLeft --;

  //open websocket connection to server
  var ws = new WebSocket("ws://" + window.location.host + "/resolution/liveview/ws");

  //also put into global
  currentWS = ws;

  //get the token and code given in the page if not already present
  presetToken = presetToken || $("#token-preset").text();
  if (! presetCode) {
    //get code from page and remove element
    var codeElement = $("#code-preset");
    presetCode = codeElement.text();
    codeElement.remove();
  }

  //access token to authenticate communication with server
  var accessToken;

  //seends an object json encoded to the server
  function sendJson(obj) {
    //add access token for auth
    if (accessToken) {
      obj.accessToken = accessToken;
    }

    //send prepared object after stringify
    ws.send(JSON.stringify(obj));
  }

  //on finished opening connection, send token and code to register as listener
  ws.onopen = function() {
    //initial request for content updates
    sendJson({
      type: isViewer ? "initViewer" : "initEditor", //request for connection of correct type
      token: presetToken, //give token and code for initial auth
      code: presetCode
    });
  };

  //when connection is closed by something inbetween or one of the parties
  ws.onclose = function() {
    //if wtill tries left
    if (triesLeft > 0) {
      makeAlertMessage("warning", "Connection closed", "ok", "The connection to the server has" +
                       " been closed. In 3 seconds another connection attempt will be started." +
                       " (" + triesLeft + " tries left)");

      //try again
      setTimeout(function() { startWS(isViewer); }, 3000);
    } else if (triesLeft === 0) {
      //stop now
      makeAlertMessage("error_outline", "Connection failed", "ok", "The connection to the server" +
                       " has been closed and couldn't be re-opened." +
                       " Contact IT-Management for help.", "liveview_conn_failed");
    } //-1 means no alert
  };

  //when a message appears
  ws.onmessage = function(event) {
    //parse sent object
    var data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.log("non-json data received/error", event.data, err);
      return;
    }

    //for type of send message
    switch (data.type) {
      case "error": //both, error message from server
        //log
        console.log(data.errorMsg);

        //check if we are allowed to retry
        if (! data.tryAgain) {
          triesLeft = 0;
        }

        //alert user
        makeAlertMessage("error_outline", "Received Error", "ok", "The server has reponded with" +
                         " an error: " + data.errorMsg, "liveview_client_got_server_error");
        break;
      case "ackInit": //both, get access token for auth
        //get token from data, we are now ready to send and receive data
        accessToken = data.accessToken;

        //notify of connection start
        displayToast("Connection established");

        //build notification message
        var displayString = data.viewerAmount + " Viewer" + (data.viewerAmount >= 2 ? "s" : "");
        if (isViewer) {
          displayString += " and " + (data.editorPresent ? "an" : "no") + " Editor";
        }
        displayString += " connected";

        //notify of viewership and editor status
        displayToast(displayString);
        break;
      case "editorReplaced": //viewer
        displayToast("Editor replaced");
        break;
      case "editorJoined": //viewer
        displayToast("Editor connected");
        break;
      case "editorGone": //viewer
        displayToast("Editor disconnected");
        break;
      case "viewerJoined": //editor
        displayToast("Viewer joined, now: " + data.amount);
        break;
      case "viewerLeft": //editor
        displayToast("Viewer left, now: " + data.amount);
        break;
      case "replacedByOther": //editor
        displayToast("Editor replaced by server");
        break;
      case "updateStructure": //viewer
        //whole resolution content is resent because structure has changed
        console.log("updateStructure", data.update);
        displayToast("updateStructure");
        break;
      case "updateContent": //viewer, the content of one clause changed and only that is sent
        console.log("updateContent", data.update);
        displayToast("updateContent");
        break;
      default: //both
        console.log("unrecognised message type", data);
        return;
    }
  };
}

//starts liveview websocket operations, given if this client is editor is viewer
//called after/inside document load
function startLiveviewWS(isViewer, token, code) {
  //use given token and code if given
  if (typeof token !== "undefined") {
    presetToken = token;
    if (typeof code !== "undefined") {
      presetCode = code;
    }
  }

  //check if we can do websocket
  if (! window.WebSocket) {
    //can't do it, error and exit
    makeAlertMessage("block", "Unsupported Browser", "ok", "Your browser is outdated and" +
                     " doesn't support WebSocket. LiveView will not work on this browser." +
                     " Contact IT-Management for help.", "liveview_no_websocket");
    return;
  }

  //start the ws connection
  startWS(isViewer);

  //close websocket on page unload/close, do it on both just to be sure
  $(window).on("unload beforeunload", function() {
    //prevent reopen and alert
    triesLeft = -1;

    //close the websocket
    currentWS.close();
  });
}
