/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*exported startLiveviewWS, sendJsonLV*/
/* global makeAlertMessage,
  displayToast*/

//how many times we will try to connect
var connectTriesLV = 3;

//how many tries are left, reset to LVConnectTries when a connection is established
var connectTriesLeftLV = connectTriesLV;

//reference to the current websocket for closing it on page unload
var currentWS;

//token and code given on page
var presetTokenLV;
var presetCodeLV;

//lv access token to authenticate communication with server
var accessToken;

//if we need to be sending edit updates or not
var sendEditUpdates = false;

//seends an object json encoded to the server
function sendJsonLV(obj) {
  //add access token for auth
  if (accessToken) {
    obj.accessToken = accessToken;
  }

  //send prepared object after stringify
  currentWS.send(JSON.stringify(obj));
}

//starts a websockets connection to the server
function startWS(isViewer) {
  //decrement try coutner
  connectTriesLeftLV --;

  //open websocket connection to server
  currentWS = new WebSocket("ws://" + window.location.host + "/resolution/liveview/ws");

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
    });
  };

  //when connection is closed by something inbetween or one of the parties
  currentWS.onclose = function() {
    //if wtill tries left
    if (connectTriesLeftLV > 0) {
      displayToast("LV: Connection error (" + connectTriesLeftLV + " tries left)");

      //try again
      setTimeout(function() { startWS(isViewer); }, 5000);
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
      console.log("non-json data received/error", event.data, err);
      return;
    }

    //keep track of if we need to be sending updates
    if (! isViewer && data.hasOwnProperty("sendUpdates")) {
      sendEditUpdates = data.sendUpdates;
    }

    //for type of send message
    switch (data.type) {
      case "error": //both, error message from server
        //log
        console.log(data.errorMsg);

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
        //whole resolution content is resent because structure has changed
        console.log("updateStructure", data.update);
        break;
      case "updateContent": //viewer, the content of one clause changed and only that is sent
        console.log("updateContent", data.update);
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
    presetTokenLV = token;
    if (typeof code !== "undefined") {
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
  startWS(isViewer);

  //close websocket on page unload/close, do it on both just to be sure
  $(window).on("unload beforeunload", function() {
    //prevent reopen and alert
    connectTriesLeftLV = -1;

    //close the websocket
    currentWS.close();
  });
}
