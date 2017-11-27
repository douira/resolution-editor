/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global startLiveviewWS*/

//keep a copy of the current structure
var currentStructure;

//start liveview as viewer on document load
$(document).ready(function() {
  //true because we are a viewer, add function to deal with the updates it receives
  startLiveviewWS(true, null, null, function(type, data) { //given type and update data
    //switch to update type
    switch (type) {
      case "updateStructure": //whole resolution content is resent because structure has changed
        //copy to current structure
        currentStructure = data.update;
        break;
      case "updateContent": //the content of one clause changed and only that is sent
        //apply change to specified path

        break;
    }

    //if present display current resolution object
    if (currentStructure) {
      $("#viewcontent").text(JSON.stringify(currentStructure));
    }
  });
});
