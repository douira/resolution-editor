/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global startLiveviewWS*/

//keep a copy of the current structure
var currentStructure;

//keep a copy of the current amendment
var currentAmendment;

//the current amendment and clause elements
var amendmentElements;

//maps between string path segments and sub element selectors
var pathSegmentMapping = {
  sub: function(e) { return e.children(".subs").children(); },
  phrase: function(e) { return e.children("div.clause-content").children("span.phrase"); },
  content: function(e) { return e.children("div.clause-content").children("span.main-content"); },
  contentExt: function(e) { return e.children("span.ext-content"); },
  unwrapOp: function(e) { return e.children(); }
};

//cache paths and the elements they result in
var changeCache = {};

//applies a change to the resolution document in html given a path and a new content
//basically does a translation between the resolution docuement and the dom version of it
function applyDocumentChange(resolution, path, content) {
  //element to apply the change to (set new value)
  var currentElem;

  //convert the path into a string as a key for caching
  var pathAsString = path.join(",");

  //if there is a already found element for the path, use that results instead of calculating it
  if (pathAsString in changeCache) {
    //simply use already computed result
    var cacheResult = changeCache[pathAsString];
    currentElem = cacheResult.elem;

    //change in already found place in structure
    cacheResult.clause[path[0]] = content;
  } else {
    //pop of the first element from the path stack
    var pathProp = path.pop();

    //insert a op-wrapper unwrapping path segment
    //to expose the inner li in op clauses that are wrapped
    if (pathProp === "operative") {
      path.splice(-1, 0, "unwrapOp");
    }

    //get object for first step
    var structureObj = resolution.clauses[pathProp];

    //the current element we are searching in, start off with preamb/op seperation
    currentElem = $(pathProp === "operative" ? "#op-clauses" : "#preamb-clauses")
      //count using only the real clause elements
      .children("div.op-clause, div.preamb-clause");

    //until we get to the element specified by the whole path
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

      //for the structure object: continue down if it results in an object
      var pathStepResult = structureObj[pathProp];
      if (pathProp !== "unwrapOp" && typeof pathStepResult === "object") {
        //use as next structureObj
        structureObj = pathStepResult;
      }
    }

    //stop if there are no elements left and the path was selecting a non-existant element
    if (currentElem.length !== 1) {
      throw Error("path didn't resolve to a single element");
    }

    //apply the change in the structure object
    structureObj[pathProp] = content;

    //put element result into cache
    changeCache[pathAsString] = {
      elem: currentElem,
      clause: structureObj
    };
  }

  //apply the change to the found end of the path
  currentElem.text(content);

  //scroll the containing clause into view,
  //this may have to be disabled if it prooves to be annoying
  currentElem.closest("div.preamb-clause, div.op-wrapper").scrollIntoView();
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
function render(resolution, amd) {
  //clear change cache because we are generating new elements
  //that aren't referenced in the cache
  changeCache = {};

  //update header
  $(".forum-info").text(resolution.address.forum);
  $("#question-of-info").text(resolution.address.questionOf);
  $("#sponsor-info").text(resolution.address.sponsor.main);

  //if there are co-sponsors fill i nthat field as well
  var coSponsors = resolution.address.sponsor.co;
  if (coSponsors && coSponsors.length) {
    //insert content
    $("#co-sponsor-info").text(coSponsors.join(", "));

    //show enclosing row
    $("#address > .hide-this").show();
  }

  //get clause content template and prepare for use
  var clauseContentTemplate = $("#clause-content-template")
    .clone()
    .removeAttr("id");

  //process clauses
  [{
    //the name in the resolution structure object
    //and the selectors/tag names for the elements to create
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

      //the element to be put into the container
      var clauseWrapper = clause; //only clause itself for preambs

      //stick op clauses into an additional container for amendment display
      if (isOps) {
        //create a wrapper and add op-wrapper for layout and styling
        clauseWrapper = $("<div/>").addClass("op-wrapper");

        //if it's an actual clause that receives content updates, add class to signify
        //otherwise color green as replacement clause in amendment
        clauseWrapper.addClass(clauseData.isReplacement ? "mark-green": "op-clause");

        //set replacement clause (for scroll)
        //this is always called after displayAmendment has run,
        //so replacementClause won't be erased by it
        if (clauseData.isReplacement) {
          amendmentElements.replacementClause = clauseWrapper;
        }

        //encapsulate the inner clause element
        clauseWrapper.append(clause);
      } else {
        //add clause to preamb div for identification
        clauseWrapper.addClass("preamb-clause");
      }

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

      //check if there is ext content for this subclause
      var contentExtPresent = "contentExt" in clauseData;

      //compute if the main content of this clause is the lat piece of it
      var lastPieceOfClause = ! subsPresent && ! contentExtPresent;

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

          //check if there is ext content for this subclause
          var subContentExtPresent = "contentExt" in subClauseData;

          //check if this is the last subclause of this clause
          //(not in preambs, those are always ",")
          var lastSubClause = isOps && subIndex === subArr.length - 1;

          //compute if the main content of this subclause is the last piece of the clause
          lastPieceOfClause =
              ! subsubsPresent && ! contentExtPresent && ! subContentExtPresent && lastSubClause;

          //add data to content
          subContent.children("span.main-content").text(subClauseData.content);

          //add punctuation
          subContent.append(getPunctuation(
            subsubsPresent, lastPieceOfClause, lastPieceOfClause && lastClause));

          //update lastPieceOfClause for subsubs
          lastPieceOfClause = ! contentExtPresent && ! subContentExtPresent && lastSubClause;

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
                lastSubsubClause && lastPieceOfClause,
                lastSubsubClause && lastPieceOfClause && lastClause
              ));
            });
          }

          //append ext content if specified
          if (subContentExtPresent) {
            //create another span with the text
            subClause.append($("<span/>", {
              "class": "ext-content",
              text: subClauseData.contentExt
            }));

            //update wether or not this is the last piece of the clause
            lastPieceOfClause = ! contentExtPresent && lastSubClause;

            //add extra punctuation for ext content
            subClause.append(getPunctuation(
              false, lastPieceOfClause, lastPieceOfClause && lastClause));
          }
        });
      }

      //append ext content if specified
      if (contentExtPresent) {
        //create another span with the text
        clause.append($("<span/>", {
          "class": "ext-content",
          text: clauseData.contentExt
        }));

        //add extra punctuation for ext content
        clause.append(getPunctuation(false, isOps, lastClause));
      }

      //add the newly created clause to the document and make it visible
      clauseWrapper.appendTo(container).show();

      //check if the clause is subject of the amendment
      if (isOps && amd && amd.clauseIndex === index) {
        //add amendment box before clause wrapper
        displayAmendment(amd, clauseWrapper);
      }
    });
  });
}

//preset strings for action message in amendments
var amdActionTexts = {
  change: "change",
  replace: "replace",
  add: "append",
  remove: "strike out"
};

//error that means the amendment type is invalid
function invalidAmdTypeError(type) {
  return Error("no amendment action type '" + type + "' exists.");
}

//updates the text content of a given amendment box element
function updateAmendmentContents(amd, amdElem) {
  //error and stop if no such type exists
  var actionText;
  if (amd.type in amdActionTexts) {
    //get action string for this type of amendment
    actionText = amdActionTexts[amd.type];
  } else {
    throw invalidAmdTypeError(amd.type);
  }

  //fill clone with info
  amdElem.find("span.amd-sponsor").text(amd.sponsor);
  amdElem.find("span.amd-action-text").text(actionText);
  //convert to 1 indexed counting
  amdElem.find("span.amd-target").text("OC" + (amd.clauseIndex + 1));
}

//sets an amendment to be displayed inline in the resolution
//clause elem must have a prenent element that we can put the amendment element in
function displayAmendment(amd, clauseElem) {
  //get a clone of the template amendment container
  var amdContainer = $("#amd-container").clone();

  //update the contents of the new element
  updateAmendmentContents(amd, amdContainer);

  //set the dom elements
  amendmentElements = {
    amd: amdContainer,
    clause: clauseElem,
    replacementClause: $() //empty set
  };

  //prepend before the given clause element and make visible
  amdContainer.insertBefore(clauseElem).show();
}

//for triggering and amendment message manually (function break-out)
function amendmentMessage(amd) {
  //changed significantly if server says so or this is the first amendment update we receive
  if (! currentAmendment || amd.structureChanged) {
    //save the amendment
    currentAmendment = amd;

    //make a copy to apply the amendment to on the next amdendment update,
    //if there isn't a copy already made
    /*if (! unamendedStructure) {
      //deep copy with jquery extend is sufficiently fast 0.0016ms per op
      unamendedStructure = $.extend(true, {}, obj);
    }*/
    //console.log("structure");

    //new current structure to apply amdendment to is given by server,
    //which gets it from the editor and applies content updates to it on its own
    currentStructure = amd.latestStructure;

    //require new clause to be specified with types add and replace
    if ((amd.type === "add" || amd.type === "replace") &&
        ! amd.newClause) {
      //error if not present
      throw Error("a new clause has to be specified with the amendment " +
                    "type 'add', but was not.");
    }

    //get the array of op clauses in the resolution
    var opClauses = currentStructure.resolution.clauses.operative;

    //if it's adding a clause
    if (amd.type === "add") {
      //set the index to point to the newly added clause
      amd.clauseIndex = opClauses.length;

      //add it the end of the resolution
      opClauses.push(amd.newClause);
    }

    //add new clause after index of targeted clause as replacement
    if (amd.type === "replace") {
      //make the new clause a replacement clause so it's rendered as one
      amd.newClause.isReplacement = true;

      //splice into clauses
      opClauses.splice(amd.clauseIndex + 1, 0, amd.newClause);
    }

    //render all
    render(currentStructure.resolution, amd);

    //reset color classes
    amendmentElements.amd.removeClass("mark-amd-green mark-amd-red");

    //set the color of the amendment according to type
    if (amd.type === "add") {
      amendmentElements.amd.addClass("mark-amd-green");
    } else if (amd.type === "remove" || amd.type === "replace") {
      amendmentElements.amd.addClass("mark-amd-red");
    }
  } else {
    //save the amendment
    currentAmendment = amd;

    //do a content update on the amendment
    updateAmendmentContents(currentAmendment, amendmentElements.amd);
  }

  //scroll the amendment elements and the clause into view
  amendmentElements.amd
    .add(amendmentElements.clause)
    //will do nothing if it is a empty set because the amendment isn't type replace
    .add(amendmentElements.replacementClause)
    .scrollIntoView();

  //TODO: do structure update when contained structure of clause changes
  //TODO: handle "change" type amendments
  //TODO: allow changing the replacement clause in "replace" amendments
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

        //copy given resolution to current structure
        currentStructure = data.update;

        //render fully
        render(currentStructure.resolution, currentAmendment);
        break;
      case "updateContent": //the content of one clause changed and only that is sent
        //if we've got some structure at all
        if (currentStructure) {
          //console.log(data.update.contentPath.join(","), data.update.content);

          //apply the change to the document
          applyDocumentChange(
            currentStructure.resolution, data.update.contentPath, data.update.content);
        } else {
          //bad, no content update should arrive before the init or updateStructure messages
          console.error("no content update should arrive before structure is received");
        }
        break;
      case "amendment":
        amendmentMessage(data.update.amendment);
        break;
    }
  });

  //display no content message after two seconds (if the content isn't there then)
  setTimeout(function() {
    //check if the content is there, if not display no content message
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
