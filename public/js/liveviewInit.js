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
      $("#viewcontent").text(JSON.stringify(currentStructure));
    }
  });
});
