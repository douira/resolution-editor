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

//preps the diplay for resolution render
function prepareResolutionRender() {
  //show content container and hide the spinner and no-content warning
  $("#resolution").show();
  $("#spinner-wrapper").hide();
  $("#no-content-msg").hide();
}

//fucntion that renders the given structure to the liveview display,
//updates completely: do not use for content update
function render(resolution) {
  var time = Date.now();
  //update header
  $(".forum-info").text(resolution.address.forum);
  $("#question-of-info").text(resolution.address.questionOf);
  $("#sponsor-info").text(resolution.address.sponsor.main);

  //get clause content template and prepare for use
  var clauseContentTemplate = $("#clause-content-template")
    .clone()
    .removeAttr("id");

  //process clauses
  [{
    //the name in the resolution structure object and the selector for the element
    name: "operative",
    listSelector: "#op-clauses",
    elementType: "li",
    subListType: "ol"
  }, {
    name: "preambulatory",
    listSelector: "#preamb-clauses",
    elementType: "div",
    subListType: "ul"
  }].forEach(function(clauseType) { //for both types of clauses in the resolution
    //get the dom list element and empty for new filling
    var container = $(clauseType.listSelector).empty();

    //for all clauses of this type, get clauses from structure
    resolution.clauses[clauseType.name].forEach(function(clauseData) {
      //create a clause object by cloning the template
      var clause = $("<" + clauseType.elementType + "/>")
        .append(clauseContentTemplate.clone());

      //add data
      clause.find(".phrase").text(clauseData.phrase.trim());
      clause.find(".main-content").text(" " + clauseData.content.trim());

      //process subclauses if any specified in data
      if ("sub" in clauseData) {
        //add list for subclauses, choose type according to type of clause
        var subList = $("<" + clauseType.subListType + "/>")
          .addClass("subs")
          .appendTo(clause); //add clause list to clause

        //add subclauses
        clauseData.sub.forEach(function(subClauseData) {
          //make the subclause
          var subClause = $("<li/>")
            .text(subClauseData.content)
            .appendTo(subList); //add subclause to its sub list

          //check if a subsub list is specified
          if ("sub" in subClauseData) {
            //add subclause list
            var subsubList = $("<" + clauseType.subListType + "/>")
              .addClass("subs subsubs")
              .appendTo(subClause); //add sub list to clause

            //add all subsub clauses
            subClauseData.sub.forEach(function(subsubClauseData) {
              //append sub sub clause entry to sub sub list
              subsubList.append("<li/>").text(subsubClauseData.content);
            });
          }
        });
      }

      //append ext content if specified
      if ("extContent" in clauseData) {
        //create another span with the text
        clause.append("<span/>", {
          class: ".ext-content",
          text: clauseData.extContent
        });
      }

      //add the newly created clause to the document and make it visible
      clause.appendTo(container).show();
    });
  });
  console.log(Date.now() - time);
}

//start liveview as viewer on document load
$(document).ready(function() {
  //true because we are a viewer, add function to deal with the updates it receives
  startLiveviewWS(true, null, null, function(type, data) { //given type and update data
    //switch to update type
    switch (type) {
      case "updateStructure": //whole resolution content is resent because structure has changed
      case "initStructure": //handle init the same way for now
        //prepare if not prepared yet (first)
        if (! currentStructure) {
          prepareResolutionRender();
        }

        //copy to current structure
        currentStructure = data.update;

        //render fully
        console.log(currentStructure);
        render(currentStructure.resolution);
        break;
      case "updateContent": //the content of one clause changed and only that is sent
        //if we've got some structure at all
        if (currentStructure) {
          //apply change to specified path in contentStructure
          resolveChangePath(
            currentStructure.resolution.clauses, //currentStructure.resolution.clauses
            data.update.contentPath,
            data.update.content
          );
        }
        //else: bad, no content update should arrive before the init or updateStructure messages
        break;
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
