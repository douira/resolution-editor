/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*exported startLiveviewWS, sendJsonLV*/
/* global
makeAlertMessage,
log,
displayToast*/

//how many times we will try to connect
var connectTriesLV = 3;

//how many tries are left, reset to LVConnectTries when a connection is established
var connectTriesLeftLV = connectTriesLV;

//reference to the current WebSocket for closing it on page unload
var currentWS;

//token and code given on page
var presetTokenLV;
var presetCodeLV;

//lv access token to authenticate communication with the server
var accessToken;

//seends an object json encoded to the server
var sendJsonLV = (function() {
  //message queue to send
  var messageQueue = [];

  return function(obj, isInit) {
    //if obj is "empty" the queue should be attempted to be emptied
    if (obj === "empty") {
      //send messages from the queue until none are left
      while (messageQueue.length) {
        //send oldest message, preserve queue ordering
        sendJsonLV(messageQueue.shift());
      }

      //return because this function call wasn't for sending a message
      return;
    }

    //send if we have an accessToken
    if (accessToken || isInit) {
      //add access token for auth, if present, do not add to init message
      if (accessToken && ! isInit) {
        obj.accessToken = accessToken;
      }

      //send prepared object after stringify
      currentWS.send(JSON.stringify(obj));

      //work on emptying queue
      sendJsonLV("empty");
    } else {
      //put in queue
      messageQueue.push(obj);
    }
  };
})();

//starts a websockets connection to the server
function startWS(isViewer, updateListener) {
  //decrement try counter
  connectTriesLeftLV --;

  //determine location of ws server
  var wsUrl = "ws://" +
    (window.location.port === "3000" ? "intern.tms-hl.org:17750" : "pad.tms-hl.de:8080") +
    "/liveview";

  //open websocket connection to server
  currentWS = new WebSocket(wsUrl);

  //get the token and code given in the page if not already present
  presetTokenLV = presetTokenLV || $("#token-preset").text();
  if (! presetCodeLV) {
    //get code from page and remove element
    var codeElement = $("#code-preset");
    presetCodeLV = codeElement.text();
    codeElement.remove();
  }

  //on finished opening connection, send token and code to register as listener
  currentWS.onopen = function() {
    //initial request for content updates
    sendJsonLV({
      type: isViewer ? "initViewer" : "initEditor", //request for connection of correct type
      token: presetTokenLV, //give token and code for initial auth
      code: presetCodeLV
    }, true);

    //notify custom event handling
    updateListener("connect");
  };

  //when connection is closed by one of the parties
  currentWS.onclose = function() {
    //reset access token
    accessToken = null;

    //if wtill tries left
    if (connectTriesLeftLV > 0) {
      displayToast("LV: Connection error (" + connectTriesLeftLV + " tries left)");

      //notify custom event handling
      updateListener("disconnect");

      //try again
      setTimeout(function() { startWS(isViewer, updateListener); }, 5000);
    } else if (connectTriesLeftLV === 0) {
      //stop now
      makeAlertMessage("error_outline", "Connection failed", "ok", "The connection to the server" +
                       " has been closed and couldn't be re-opened." +
                       " Contact IT-Management for help.", "liveview_conn_failed");
    } //-1 means no alert
  };

  //when a message appears
  currentWS.onmessage = function(event) {
    //parse sent object
    var data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      log({ msg: "non-json data received/error", eventData: event.data, err: err });
      return;
    }

    //keep track of if we need to be sending updates
    if (! isViewer && data.hasOwnProperty("sendUpdates")) {
      //notify up new update necessity status
      updateListener("sendUpdates", data.sendUpdates);
    }

    //if resolution data sent as init, call listener with init structure
    if (data.hasOwnProperty("resolutionData")) {
      updateListener("initStructure", data);
    }

    //for type of send message
    switch (data.type) {
      case "error": //both, error message from server
        //log error
        log({ msg: "lv received error", errMsg: data.errorMsg });

        //check if we are allowed to retry
        if (! data.tryAgain) {
          connectTriesLeftLV = 0;
        }

        //alert user
        makeAlertMessage("error_outline", "Received Error", "ok", "The server has reponded with" +
                         " an error: " + data.errorMsg, "liveview_client_got_server_error");
        break;
      case "ackInit": //both, get access token for auth
        //get token from data, we are now ready to send and receive data
        accessToken = data.accessToken;

        //notify of connection start
        displayToast("LV: Connection established");

        //build notification message
        var displayString = "LV: " + data.viewerAmount +
            " Viewer" + (data.viewerAmount === 1 ? "" : "s");
        if (isViewer) {
          displayString += " and " + (data.editorPresent ? "an" : "no") + " Editor";
        }
        displayString += " connected";

        //reset retry counter because a connection was established
        connectTriesLeftLV = connectTriesLV;

        //notify of viewership and editor status
        displayToast(displayString);

        //work on emptying queue now that an access token has been received
        sendJsonLV("empty");
        break;
      case "editorReplaced": //viewer
        displayToast("LV: Editor replaced");
        break;
      case "editorJoined": //viewer
        displayToast("LV: Editor connected");
        break;
      case "editorGone": //viewer
        displayToast("LV: Editor disconnected");
        break;
      case "viewerJoined": //both
        displayToast("LV: Viewer joined, now: " + data.amount);
        break;
      case "viewerLeft": //editor
        displayToast("LV: Viewer left, now: " + data.amount);
        break;
      case "replacedByOther": //editor
        displayToast("LV: Editor replaced by server");
        break;
      case "updateStructure": //viewer
      case "updateContent":
      case "amendment":
      case "saveAmd":
        //no special action, handling done by update listener
        break;
      default: //both client types
        log({ msg: "lv: unrecognised message type", data: data });
        return;
    }

    //custom event handling
    if (typeof updateListener === "function") {
      updateListener(data.type, data);
    }
  };
}

//starts liveview websocket operations, given if this client is editor or viewer
//should be called in document ready
function startLiveviewWS(isViewer, token, code, updateListener) {
  //use given token and code if given
  if (typeof token === "string") {
    presetTokenLV = token;
    if (typeof code === "string") {
      presetCodeLV = code;
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
  startWS(isViewer, updateListener);

  //close websocket on page unload/close, do it on both just to be sure
  $(window).on("unload beforeunload", function() {
    //prevent reopen and alert
    connectTriesLeftLV = -1;

    //close the websocket
    currentWS.close();
  });
}
