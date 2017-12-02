/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global startLiveviewWS*/

//keep a copy of the current structure
var currentStructure;

//resolves an array form object path and changes the field to the given value
function resolveChangePath(prevObj, remainingPath, setValue) {
  //get next property
  var prop = remainingPath.pop();

  //error if property not present
  if (! (prop in prevObj)) {
    console.error("invalid path property segement:", prop, "in", prevObj);
  }

  //if there are still steps more to be taken in the path
  if (remainingPath.length) {
    //resolve one step further
    prevObj = prevObj[prop];

    //go one level deeper
    resolveChangePath(prevObj, remainingPath, setValue);
  } else {
    //finished resolving, change value
    prevObj[prop] = setValue;
  }
}

//makes the given element go into full screen mode
function makeFullScreen(elem) {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  } else if (elem.mozRequestFullScreen) {
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  }
}

//start liveview as viewer on document load
$(document).ready(function() {
  //true because we are a viewer, add function to deal with the updates it receives
  startLiveviewWS(true, null, null, function(type, data) { //given type and update data
    //switch to update type
    switch (type) {
      case "updateStructure": //whole resolution content is resent because structure has changed
      case "initStructure": //handle init the same way for now
        //copy to current structure
        currentStructure = data.update;
        break;
      case "updateContent": //the content of one clause changed and only that is sent
        //apply change to specified path in contentStructure
        resolveChangePath(
          currentStructure.resolution.clauses, //currentStructure.resolution.clauses
          data.update.contentPath,
          data.update.content
        );
        break;
    }

    //if present display current resolution object
    if (currentStructure) {
      //show content container and hide the spinner and no-content warning
      $("#resolution").show();
      $("#spinner-wrapper").hide();
      $("#no-content-msg").hide();

      //generate a rendered document


      $("#resolution").text(JSON.stringify(currentStructure));
    }
  });

  //display no content message after two seconds (if the content isn't there then)
  setTimeout(function() {
    //check if the cotent is there, if not display no content message
    if ($("#resolution").is(":hidden")) {
      $("#no-content-msg").show(250);
    }
  }, 2000);

  //register fullscreen handlers
  $("#enter-fullscreen").on("click", function() {
    //get the viewcontent and try to make it fullscreen
    makeFullScreen($("#viewcontent")[0]);
  });
});
