/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global startLiveviewWS*/

//keep a copy of the current structure
var currentStructure;

//start liveview as viewer on document load
$(document).ready(function() {
  //true because we are a viewer, add function to deal with the updates it receives
  startLiveviewWS(true, null, null, function(type, update) { //given type and update data
    console.log(type, update);

    //switch to update type
    switch (type) {
      case "structure": //whole resolution content is resent because structure has changed
        //copy to current structure
        currentStructure = update;

        //set content
        $("#viewcontent").text(update);
        break;
      case "content": //the content of one clause changed and only that is sent

        break;
    }
  });
});
