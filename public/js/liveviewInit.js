/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global startLiveviewWS*/

//keep a copy of the current structure
var currentStructure;

//resolves an array form object path and changes the field to the given value
/*function resolveChangePath(prevObj, remainingPath, setValue) {
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
}*/

//maps between string path segments and sub element selectors
var pathSegmentMapping = {
  sub: function(e) { return e.children(".subs").children(); },
  phrase: function(e) { return e.children("div.clause-content").children("span.phrase"); },
  content: function(e) { return e.children("div.clause-content").children("span.main-content"); },
  contentExt: function(e) { return e.children("div.clause-content").children("span.ext-content"); }
};

//cache paths and the elements they result in
var changeCache = {};

//applies a change to the resolution document in html given a path and a new content
//basically does a translation between the resolution docuement and the dom version of it
function applyDocumentChange(path, content) {
  //element to apply the change to (set new value)
  var currentElem;

  //convert the path into a string as a key for caching
  var pathAsString = path.join(",");

  //if there is a already found element for the path, use that results instead of calculating it
  if (pathAsString in changeCache) {
    //simply use already computed result
    currentElem = changeCache[pathAsString];
  } else {
    //the current element we are searching in, start off with preamb/op seperation
    currentElem = $(path.pop() === "operative" ? "#op-clauses" : "#preamb-clauses").children();

    //until we get to the element specified by the whole path
    var pathProp;
    while (path.length && currentElem.length) {
      //pop off the next property to follow
      pathProp = path.pop();

      //is a string: return a sub element of the current element
      if (typeof pathProp === "string") {
        //apply a mapping from path segment to selector
        var elementFinder = pathSegmentMapping[pathProp];

        //if there even is a mapping for this path segment
        if (typeof elementFinder === "undefined") {
          //bad, unknown path segment
          throw Error("unknown path segment: " + pathProp);
        } else {
          //get element with selector
          currentElem = elementFinder(currentElem);
        }
      } //is a number and needs to be within length of elements
      else if (typeof pathProp === "number" && pathProp < currentElem.length) {
        //select nth element using given index
        currentElem = currentElem.eq(pathProp);
      } else {
        //invalid path
        throw Error("invalid path segment: " + pathProp);
      }
    }

    //stop if there are no elements left and the path was selecting a non-existant element
    if (currentElem.length !== 1) {
      throw Error("path didn't resolve to a single element");
    }

    //put element result into cache
    changeCache[pathAsString] = currentElem;
  }

  //apply the change to the found end of the path
  currentElem.text(content);
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

//returns the correct punctuation for a given (op) clause context
function getPunctuation(subPresent, lastInClause, lastInDoc) {
  //essentially a precendence waterfall
  return subPresent ? ":" : lastInDoc ? "." : lastInClause ? ";" : ",";
}

//fucntion that renders the given structure to the liveview display,
//updates completely: do not use for content update
function render(resolution) {
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

    //flag for this being in the ops
    var isOps = clauseType.name === "operative";

    //for all clauses of this type, get clauses from structure
    resolution.clauses[clauseType.name].forEach(function(clauseData, index, arr) {
      //create a clause object by cloning the template
      var content = clauseContentTemplate.clone();
      var clause = $("<" + clauseType.elementType + "/>").append(content);

      //add the space between the phrase and the content
      content.prepend(" ");

      //add the phrase span
      content.prepend($("<span/>", {
        "class": "phrase",
        text: clauseData.phrase.trim()
      }));

      //check if subclauses exist
      var subsPresent = "sub" in clauseData;

      //check if this is the last clause (can't be last if it's a preamb)
      var lastClause = isOps && index === arr.length - 1;

      //fill in the content data
      content.children(".main-content").text(clauseData.content.trim());

      //add punctuation
      content.append(getPunctuation(subsPresent, isOps && ! subsPresent, lastClause));

      //process subclauses if any specified in data
      if (subsPresent) {
        //add list for subclauses, choose type according to type of clause
        var subList = $("<" + clauseType.subListType + "/>")
          .addClass("subs")
          .appendTo(clause); //add clause list to clause

        //add subclauses
        clauseData.sub.forEach(function(subClauseData, subIndex, subArr) {
          //make the subclause
          var subContent = clauseContentTemplate.clone();
          var subClause = $("<li/>")
            .append(subContent)
            .appendTo(subList); //add subclause to its sub list

          //check if a sub list is specified
          var subsubsPresent = "sub" in subClauseData;

          //check if this is the last subclause of this clause
          //(not in preambs, those are always ",")
          var lastSubClause = isOps && subIndex === subArr.length - 1;

          //add data to content
          subContent.children("span.main-content").text(subClauseData.content);

          //add punctuation
          subContent.append(getPunctuation(
            subsubsPresent,
            ! subsubsPresent && lastSubClause,
            ! subsubsPresent && lastSubClause && lastClause
          ));

          //if there are subsubs
          if (subsubsPresent) {
            //add subclause list
            var subsubList = $("<" + clauseType.subListType + "/>")
              .addClass("subs subsubs")
              .appendTo(subClause); //add sub list to clause

            //add all subsub clauses
            subClauseData.sub.forEach(function(subsubClauseData, subsubIndex, subsubArr) {
              //make the subclause
              var subsubContent = clauseContentTemplate.clone();
              $("<li/>")
                .append(subsubContent)
                .appendTo(subsubList); //add subsubclause to its sub list

              //add data to content
              subsubContent.children("span.main-content").text(subsubClauseData.content);

              //add punctuation
              var lastSubsubClause = subsubIndex === subsubArr.length - 1;
              subsubContent.append(getPunctuation(
                false,
                lastSubsubClause && lastSubClause,
                lastSubsubClause && lastSubClause && lastClause
              ));
            });
          }

          //append ext content if specified
          if ("contentExt" in subClauseData) {
            //create another span with the text
            subClause.append($("<span/>", {
              "class": "ext-content",
              text: subClauseData.contentExt
            }));

            //add extra punctuation for ext content
            subClause.append(getPunctuation(
              false, lastSubClause, lastSubClause && lastClause));
          }
        });
      }

      //append ext content if specified
      if ("contentExt" in clauseData) {
        //create another span with the text
        clause.append($("<span/>", {
          "class": "ext-content",
          text: clauseData.contentExt
        }));

        //add extra punctuation for ext content
        clause.append(getPunctuation(false, isOps, lastClause));
      }

      //add the newly created clause to the document and make it visible
      clause.appendTo(container).show();
    });
  });
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

        //reset path/element cache because the dom elements may not be in the same order as before
        changeCache = {};

        //render fully
        render(currentStructure.resolution);
        break;
      case "updateContent": //the content of one clause changed and only that is sent
        //if we've got some structure at all
        if (currentStructure) {
          //apply the change to the document
          applyDocumentChange(data.update.contentPath, data.update.content);
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
