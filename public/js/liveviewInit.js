/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global startLiveviewWS*/

//the current structure
var structure;

//keep a copy of the current amendment
var amendment;

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

//preset strings for action message in amendments
var amdActionTexts = {
  change: "change",
  replace: "replace",
  add: "append",
  remove: "strike out"
};

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
    if (pathProp === "operative" || pathProp === "amendment") {
      path.splice(-1, 0, "unwrapOp");
    }

    //structure to modify with the update
    var structureObj;

    //for amendment content update
    if (pathProp === "amendment") {
      //element is amendment clause
      currentElem = amendmentElements.replacementClause.length ?
        amendmentElements.replacementClause : amendmentElements.clause;

      //use new clause as object to modify
      structureObj = amendment.newClause;
    } else {
      //the current element we are searching in, start off with preamb/op seperation
      currentElem = $(pathProp === "operative" ? "#op-clauses" : "#preamb-clauses")
        //count using only the real clause elements
        .children("div.op-clause, div.preamb-clause");

      //get object for first step from resolution
      structureObj = resolution.clauses[pathProp];
    }

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

//returns the correct punctuation for a given (op) clause context
function getPunctuation(subPresent, lastInClause, lastInDoc) {
  //essentially a precendence waterfall
  return subPresent ? ":" : lastInDoc ? "." : lastInClause ? ";" : ",";
}

//fucntion that renders the given structure to the liveview display,
//updates completely: do not use for content update
function render() {
  //the structure to render
  var renderStructure = structure;

  //apply amendment if present
  var amdContainer;
  if (amendment) {
    //get a clone of the template amendment container
    amdContainer = $("#amd-container").clone();

    //if the structure will be modified
    if (amendment.type === "add" || amendment.type === "replace") {
      //make a copy for rendering with amendment
      renderStructure = $.extend(true, {}, structure);
    }

    //get the array of op clauses in the resolution
    var opClauses = renderStructure.resolution.clauses.operative;

    //if it's adding a clause
    if (amendment.type === "add") {
      //set the index to point to the newly added clause
      amendment.clauseIndex = opClauses.length;

      //add it the end of the resolution
      opClauses.push(amendment.newClause);
    } //add new clause after index of targeted clause as replacement
    else if (amendment.type === "replace") {
      //make the new clause a replacement clause so it's rendered as one
      amendment.newClause.isReplacement = true;

      //splice into clauses
      opClauses.splice(amendment.clauseIndex + 1, 0, amendment.newClause);
    }
  }

  //clear change cache because we are generating new elements
  //that aren't referenced in the cache
  changeCache = {};

  //update header
  $(".forum-info").text(renderStructure.resolution.address.forum);
  $("#question-of-info").text(renderStructure.resolution.address.questionOf);
  $("#sponsor-info").text(renderStructure.resolution.address.sponsor.main);

  //if there are co-sponsors fill in that field as well
  var coSponsors = renderStructure.resolution.address.sponsor.co;
  if (coSponsors && coSponsors.length) {
    //insert content
    $("#co-sponsor-info").text(coSponsors.join(", "));

    //show enclosing row
    $("#co-sponsor-row").removeClass("hide-this");
  } else {
    $("#co-sponsor-row").addClass("hide-this");
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
    renderStructure.resolution.clauses[clauseType.name].forEach(function(clauseData, index, arr) {
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
        clauseWrapper.addClass(clauseData.isReplacement ? "mark-green" : "op-clause");

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
      if (isOps && amendment && amendment.clauseIndex === index) {
        //sets an amendment to be displayed inline in the resolution
        //clauseWrapper must have a parent element that we can put the amendment element in

        //error and stop if no such type exists
        var actionText;
        if (amendment.type in amdActionTexts) {
          //get action string for this type of amendment
          actionText = amdActionTexts[amendment.type];
        } else {
          throw invalidAmdTypeError(amendment.type);
        }

        //fill clone with info
        amdContainer.find("span.amd-sponsor")
          .html(amendment.sponsor || "<em class='grey-text text-darken-1'>Sponsor</em>");
        amdContainer.find("span.amd-action-text").text(actionText);
        //convert to 1 indexed counting
        amdContainer.find("span.amd-target").text("OC" + (amendment.clauseIndex + 1));

        //set the dom elements
        amendmentElements = {
          amd: amdContainer,
          clause: clauseWrapper,
          replacementClause: $() //empty set
        };

        //prepend before the given clause element and make visible
        amdContainer.insertBefore(clauseWrapper).show();
      }
    });
  });

  //if there is an amendment to display
  if (amendment) {
    //reset color classes
    amendmentElements.amd.removeClass("mark-amd-green mark-amd-red");

    //set the color of the amendment according to type
    if (amendment.type === "add") {
      amendmentElements.amd.addClass("mark-amd-green");
    } else if (amendment.type === "remove" || amendment.type === "replace") {
      amendmentElements.amd.addClass("mark-amd-red");
    }
  }
}

//error that means the amendment type is invalid
function invalidAmdTypeError(type) {
  return Error("no amendment action type '" + type + "' exists.");
}

//start liveview as viewer on document load
$(document).ready(function() {
  //true because we are a viewer, add function to deal with the updates it receives
  startLiveviewWS(true, null, null, function(type, data) { //given type and update data
    //switch to update type
    switch (type) {
      case "editorJoined":
        //remove amendment and re-render
        amendment = null;
        render();
        break;
      case "updateStructure": //whole resolution content is resent because structure has changed
      case "initStructure": //handle init the same way for now
        //prepare if not prepared yet (first)
        if (! structure) {
          //show content container and hide the spinner and no-content warning
          $("#resolution").show();
          $("#spinner-wrapper").hide();
          $("#no-content-msg").hide();
        }

        //copy given resolution to current structure
        structure = data.update;

        //render everything
        render();
        break;
      case "updateContent": //the content of one clause changed and only that is sent
        //if we've got some structure at all
        if (structure) {
          //apply the change to the document
          applyDocumentChange(
            structure.resolution, data.update.contentPath, data.update.content);
        } else {
          //bad, no content update should arrive before the init or updateStructure messages
          console.error("no content update should arrive before structure is received");
        }
        break;
      case "amendment":
        //save the amendment
        amendment = data.update;

        //require new clause to be specified with types add and replace
        if ((amendment.type === "add" || amendment.type === "replace") &&
            ! amendment.newClause) {
          //error if not present
          throw Error("a new clause has to be specified with the amendment " +
                        "types add and replace, but was not.");
        }

        //render everything
        render();

        //scroll the amendment elements and the clause into view
        amendmentElements.amd
          .add(amendmentElements.clause)
          //will do nothing if it is a empty set because the amendment isn't type replace
          .add(amendmentElements.replacementClause)
          .scrollIntoView();
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
