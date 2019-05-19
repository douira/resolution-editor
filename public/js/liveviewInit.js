/*global
startLiveviewWS,
getTimeText,
log*/

//the current structure
let structure;

//keep a copy of the current amendment
let amendment;

//the current amendment and clause elements
let amendmentElements;

//list of last amendments
let lastAmdList;

//maps between string path segments and sub element selectors
const pathSegmentMapping = {
  sub: e => e.children(".subs").children(),
  phrase: e => e.children("div.clause-content").children("span.phrase"),
  content: e => e.children("div.clause-content").children("span.main-content"),
  contentExt: e =>
    e.children("div.ext-content").children("span.ext-text-content")
};

//cache paths and the elements they result in
let changeCache = {};

//preset strings for action message in amendments
const amdActionTexts = {
  change: "change",
  replace: "replace",
  add: "append",
  remove: "strike out",
  noselection: "?"
};

//applies a change to the resolution document in html given a path and a new content
//basically does a translation between the resolution document and the dom version of it
const applyDocumentChange = (resolution, path, content) => {
  //element to apply the change to (set new value)
  let currentElem;

  //convert the path into a string as a key for caching
  const pathAsString = path.join(",");

  //if there is an already found element for the path, use that results instead of calculating it
  if (pathAsString in changeCache) {
    //simply use already computed result
    const cacheResult = changeCache[pathAsString];
    currentElem = cacheResult.elem;

    //change in already found place in structure
    cacheResult.clause[path[0]] = content;
  } else {
    //pop off the first element from the path stack as the type sign
    let pathProp = path.pop();

    //structure to modify with the update
    let structureObj;

    //for amendment content update
    if (pathProp === "amendment") {
      //element is amendment clause
      currentElem = (amendmentElements.replacementClause.length
        ? amendmentElements.replacementClause
        : amendmentElements.clause
      ).children("li");

      //use new clause as object to modify
      structureObj = amendment.newClause;
    } else {
      //the current element we are searching in, start off with preamb/op seperation
      currentElem = $(
        pathProp === "operative"
          ? "#op-clauses > .op-wrapper > li"
          : "#preamb-clauses > div.preamb-clause"
      );

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
        const elementFinder = pathSegmentMapping[pathProp];

        //if there even is a mapping for this path segment
        if (typeof elementFinder === "undefined") {
          //bad, unknown path segment
          throw Error(`unknown path segment: ${pathProp}`);
        } else {
          //get element with selector
          currentElem = elementFinder(currentElem);
        }
      } else if (
        typeof pathProp === "number" &&
        pathProp < currentElem.length
      ) {
        //is a number and needs to be within length of elements

        //select nth element using given index
        currentElem = currentElem.eq(pathProp);
      } else {
        //invalid path
        throw Error(`invalid path segment: ${pathProp}`);
      }

      //for the structure object: continue down if it results in an object
      const pathStepResult = structureObj[pathProp];
      if (typeof pathStepResult === "object") {
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
};

//makes the given element go into full screen mode
const makeFullScreen = elem => {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  } else if (elem.mozRequestFullScreen) {
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  }
};

//returns the correct punctuation for a given (op) clause context
const getPunctuation = (subPresent, lastInClause, lastInDoc) =>
  //essentially a precendence waterfall
  subPresent ? ":" : lastInDoc ? "." : lastInClause ? ";" : ",";

//iterates over an object like forEach, but deals with the diff property
const diffForEach = (obj, callback) => {
  //needs to have length property and above 0
  if (!obj.length) {
    return;
  }

  //for all numeric of obj
  for (let i = 0; i < obj.length; i++) {
    //call callback with value at property, property itself, the whole object, diff for this prop
    callback(obj[i], i, obj, obj.diff && obj.diff[i]);
  }
};

//diff type color class map converts between diff types and color marking classes
const diffTypeColorMap = {
  updated: "mark-yellow",
  added: "mark-green",
  deleted: "mark-red",
  none: "mark-grey"
};

//marks an element with diff colors according to the passed diff type
$.fn.colorDiff = function(type) {
  //can't do anything if falsy
  if (!type) {
    return;
  }

  //add marking class corresponding to diff type, or grey if no match found
  this.addClass(diffTypeColorMap[type] || "mark-grey");
};

//updates the last amd list (given there are any in the list)
const updateLastAmdList = () => {
  //if there are last amendments
  if (lastAmdList) {
    //unhide collection and get child elements
    const lastAmdElems = $("#last-amd")
      .removeClass("hide-this")
      .children();

    //for the first three elements of the last amendments (we only expect/handle three)
    //TODO: make constiable through setting on server
    for (let i = 0; i < 3; i++) {
      //get element from list
      const amdItem = lastAmdList[i];

      //get current element from display item collection
      const amdElem = lastAmdElems.eq(i);

      //if there is data for this index
      if (amdItem) {
        //unhide element
        amdElem.removeClass("hide-this");

        //set time text in display element
        amdElem
          .find(".item-age")
          .text(getTimeText((Date.now() - amdItem.timestamp) / 1000, "ago"));

        //get the apply status
        const applyStatus = amdItem.saveType === "apply";

        //apply attributes of item to display element
        amdElem.find(".item-sponsor").text(amdItem.sponsor);
        amdElem.find(".item-clause").text(amdItem.clauseIndex + 1); //convert to 1-start counting
        amdElem.find(".item-action").text(amdActionTexts[amdItem.type]);
        const itemStatus = amdElem
          .find(".item-status")
          .text(applyStatus ? "Accepted" : "Rejected");

        //apply color class to accepted/rejected text
        itemStatus
          .classState(applyStatus, "green-text")
          .classState(!applyStatus, "red-text");
      } else {
        //nothing there, hide element
        amdElem.setHide(true);
      }
    }
  }
};

//renders the given structure to the liveview display,
//re-generates elements completely: do not use for content update
const render = () => {
  //update the last amendments list
  updateLastAmdList();

  //the structure to render
  let renderStructure = structure;

  //apply amendment if present
  let amdContainer;
  if (amendment) {
    //get a clone of the template amendment container
    amdContainer = $("#amd-container").clone();

    //if the structure object will be modified, copy
    if (
      amendment.type === "add" ||
      amendment.type === "replace" ||
      amendment.type === "change"
    ) {
      //make a copy for rendering with amendment, these change types modify the structure
      renderStructure = $.extend(true, {}, structure);
    }

    //get the array of op clauses in the resolution
    const opClauses = renderStructure.resolution.clauses.operative;

    //if it's adding a clause
    if (amendment.type === "add") {
      //set the index to point to the newly added clause
      amendment.clauseIndex = opClauses.length;

      //add it the end of the resolution
      opClauses.push(amendment.newClause);
    } else if (amendment.type === "replace") {
      //add new clause after index of targeted clause as replacement

      //make the new clause a replacement clause so it's rendered as one
      amendment.newClause.isReplacement = true;

      //splice into clauses (for replace and change)
      opClauses.splice(amendment.clauseIndex + 1, 0, amendment.newClause);
    } else if (
      amendment.type === "change" ||
      amendment.type === "noselection"
    ) {
      //replace clause that is to be changed
      opClauses.splice(amendment.clauseIndex, 1, amendment.newClause);
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
  const coSponsors = renderStructure.resolution.address.sponsor.co;
  if (coSponsors && coSponsors.length) {
    //insert content
    $("#co-sponsor-info").text(coSponsors.join(", "));

    //show enclosing row
    $("#co-sponsor-row").setHide(false);
  } else {
    $("#co-sponsor-row").setHide(true);
  }

  //get clause content template and prepare for use
  const clauseContentTemplate = $("#clause-content-template")
    .clone()
    .removeAttr("id");

  //process clauses
  [
    {
      //the name in the resolution structure object
      //and the selectors/tag names for the elements to create
      name: "operative",
      listSelector: "#op-clauses",
      elementType: "li",
      subListType: "ol"
    },
    {
      name: "preambulatory",
      listSelector: "#preamb-clauses",
      elementType: "div",
      subListType: "ul"
    }
  ].forEach(clauseType => {
    //for both types of clauses in the resolution
    //get the dom list element and empty for new filling
    const container = $(clauseType.listSelector).empty();

    //flag for this being in the ops
    const isOps = clauseType.name === "operative";

    //for all clauses of this type, get clauses from structure
    renderStructure.resolution.clauses[clauseType.name].forEach(
      (clauseData, index, arr) => {
        //create a clause object by cloning the template
        const content = clauseContentTemplate.clone();
        const clause = $(`<${clauseType.elementType}/>`).append(content);

        //the element to be put into the container
        let clauseWrapper = clause; //only clause itself for preambs

        //stick op clauses into an additional container for amendment display
        if (isOps) {
          //create a wrapper and add op-wrapper for layout and styling
          clauseWrapper = $("<div/>").addClass("op-wrapper");

          //color green as replacement clause in amendment
          if (clauseData.isReplacement) {
            clauseWrapper.addClass("mark-green");
          }

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
        content.prepend(
          $("<span/>", {
            class: "phrase",
            text: clauseData.phrase.trim()
          })
        );

        //check if subclauses exist
        const subsPresent = "sub" in clauseData;

        //check if this is the last clause (can't be last if it's a preamb)
        const lastClause = isOps && index === arr.length - 1;

        //check if there is ext content for this subclause
        const contentExtPresent = "contentExt" in clauseData;

        //compute if the main content of this clause is the lat piece of it
        let lastPieceOfClause = !subsPresent && !contentExtPresent;

        //fill in the content data
        content.children(".main-content").text(clauseData.content.trim());

        //add punctuation
        content.append(
          getPunctuation(subsPresent, isOps && !subsPresent, lastClause)
        );

        //apply diff colors if given
        if (clauseData.diff) {
          //add coloring on content body
          content.colorDiff(clauseData.diff.content);

          //add coloring on phrase if there is any, otherwise mark as grey clause background
          content
            .children(".phrase")
            .colorDiff(clauseData.diff.phrase || "none");
        }

        //process subclauses if any specified in data
        if (subsPresent) {
          //add list for subclauses, choose type according to type of clause
          const subList = $(`<${clauseType.subListType}/>`)
            .addClass("subs")
            .appendTo(clause); //add clause list to clause

          //color whole sublist if specified
          if (clauseData.diff) {
            subList.colorDiff(clauseData.diff.sub);
          }

          //add subclauses
          diffForEach(
            clauseData.sub,
            (subClauseData, subIndex, subArr, subDiffType) => {
              //make the subclause
              const subContent = clauseContentTemplate.clone();
              const subClause = $("<li/>")
                .append(subContent)
                .appendTo(subList); //add subclause to its sub list

              //color whole subclause with diff
              subClause.colorDiff(subDiffType);

              //if there are diff specs for the things in this subclause
              if (subClauseData.diff) {
                //color content
                subContent.colorDiff(subClauseData.diff.content);
              }

              //check if a sub list is specified
              const subsubsPresent = "sub" in subClauseData;

              //check if there is ext content for this subclause
              const subContentExtPresent = "contentExt" in subClauseData;

              //check if this is the last subclause of this clause
              //(not in preambs, those are always ",")
              const lastSubClause = isOps && subIndex === subArr.length - 1;

              //compute if the main content of this subclause is the last piece of the clause
              lastPieceOfClause =
                !subsubsPresent &&
                !contentExtPresent &&
                !subContentExtPresent &&
                lastSubClause;

              //add data to content
              subContent
                .children("span.main-content")
                .text(subClauseData.content);

              //add punctuation
              subContent.append(
                getPunctuation(
                  subsubsPresent,
                  lastPieceOfClause,
                  lastPieceOfClause && lastClause
                )
              );

              //update lastPieceOfClause for subsubs
              lastPieceOfClause =
                !contentExtPresent && !subContentExtPresent && lastSubClause;

              //if there are subsubs
              if (subsubsPresent) {
                //add subclause list
                const subsubList = $(`<${clauseType.subListType}/>`)
                  .addClass("subs subsubs")
                  .appendTo(subClause); //add sub list to clause

                //color whole subsublist if specified
                if (subClauseData.diff) {
                  subsubList.colorDiff(subClauseData.diff.sub);
                }

                //add all subsub clauses
                diffForEach(
                  subClauseData.sub,
                  (
                    subsubClauseData,
                    subsubIndex,
                    subsubArr,
                    subsubDiffType
                  ) => {
                    //make the subclause
                    const subsubContent = clauseContentTemplate.clone();
                    $("<li/>")
                      .append(subsubContent)
                      .appendTo(subsubList); //add subsubclause to its sub list

                    //color subsubclause
                    subsubContent.colorDiff(subsubDiffType);

                    //add data to content
                    subsubContent
                      .children("span.main-content")
                      .text(subsubClauseData.content);

                    //add punctuation
                    const lastSubsubClause =
                      subsubIndex === subsubArr.length - 1;
                    subsubContent.append(
                      getPunctuation(
                        false,
                        lastSubsubClause && lastPieceOfClause,
                        lastSubsubClause && lastPieceOfClause && lastClause
                      )
                    );
                  }
                );
              }

              //append ext content if specified
              if (subContentExtPresent) {
                //create another span with the text
                const subContentExt = $("<div/>", {
                  class: "ext-content"
                }).appendTo(subClause);

                //add text inside
                subContentExt.append(
                  $("<span/>", {
                    class: "ext-text-content",
                    text: subClauseData.contentExt
                  })
                );

                //color ext content
                if (subClauseData.diff) {
                  subContentExt.colorDiff(subClauseData.diff.contentExt);
                }

                //update whether or not this is the last piece of the clause
                lastPieceOfClause = !contentExtPresent && lastSubClause;

                //add extra punctuation for ext content
                subContentExt.append(
                  getPunctuation(
                    false,
                    lastPieceOfClause,
                    lastPieceOfClause && lastClause
                  )
                );
              }
            }
          );
        }

        //append ext content if specified
        if (contentExtPresent) {
          //create another span with the text
          const contentExt = $("<div/>", {
            class: "ext-content"
          }).appendTo(clause);

          //add text inside
          contentExt.append(
            $("<span/>", {
              class: "ext-text-content",
              text: clauseData.contentExt
            })
          );

          //color ext content
          if (clauseData.diff) {
            contentExt.colorDiff(clauseData.diff.contentExt);
          }

          //add extra punctuation for ext content
          contentExt.append(getPunctuation(false, isOps, lastClause));
        }

        //add the newly created clause to the document and make it visible
        clauseWrapper.appendTo(container).setHide(false);

        //check if the clause is subject of the amendment
        if (isOps && amendment && amendment.clauseIndex === index) {
          //sets an amendment to be displayed inline in the resolution
          //clauseWrapper must have a parent element that we can put the amendment element in

          //error and stop if no such type exists
          let actionText;
          if (amendment.type in amdActionTexts) {
            //get action string for this type of amendment
            actionText = amdActionTexts[amendment.type];
          } else {
            //throw on unknown amd type
            throw Error(`no amendment action type '${amendment.type}' exists.`);
          }

          //fill clone with info
          amdContainer
            .find("span.amd-sponsor")
            .html(
              amendment.sponsor ||
                "<em class='grey-text text-darken-1'>Submitter</em>"
            );
          amdContainer.find("span.amd-action-text").text(actionText);

          //convert to 1 indexed counting
          amdContainer
            .find("span.amd-target")
            .text(`OC${amendment.clauseIndex + 1}`);

          //set the dom elements
          amendmentElements = {
            amd: amdContainer,
            clause: clauseWrapper,
            replacementClause: $() //empty set
          };

          //prepend before the given clause element and make visible
          amdContainer.insertBefore(clauseWrapper).setHide(false);
        }
      }
    );
  });

  //if there is an amendment to display
  if (amendment) {
    //reset color classes
    amendmentElements.amd.removeClass(
      "mark-amd-green mark-amd-red mark-amd-grey"
    );

    //set the color of the amendment according to type
    if (amendment.type === "add") {
      amendmentElements.amd.addClass("mark-amd-green");
    } else if (amendment.type === "remove" || amendment.type === "replace") {
      amendmentElements.amd.addClass("mark-amd-red");
    } else if (
      amendment.type === "change" ||
      amendment.type === "noselection"
    ) {
      amendmentElements.amd.addClass("mark-amd-grey");
    }
  }
};

//sets the last amd list and limits its elements
const setLastAmdList = newList => {
  //set to new list
  lastAmdList = newList;

  //if there are items
  if (lastAmdList && lastAmdList.length) {
    //limit to the last n items
    lastAmdList.splice(0, lastAmdList.length - 3);
  }
};

//start liveview as viewer on document load
$(document).ready(() => {
  //true because we are a viewer, add function to deal with the updates it receives
  startLiveviewWS(true, null, null, (type, data) => {
    //given type and update data
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
        if (!structure) {
          //show content container and hide the spinner and no-content warning
          $("#resolution").setHide(false);
          $("#spinner-wrapper").setHide(true);
          $("#no-content-msg").setHide(true);
        }

        //copy given resolution to current structure
        structure = data.resolutionData || data.update;

        //set last amendment list
        setLastAmdList(data.lastAmd);

        //render everything
        render();
        break;
      case "updateContent": //the content of one clause changed and only that is sent
        //if we've got some structure at all
        if (structure) {
          //apply the change to the document
          applyDocumentChange(
            structure.resolution,
            data.update.contentPath,
            data.update.content
          );
        } else {
          //bad, no content update should arrive before the init or updateStructure messages
          log({
            msg: "no content update should arrive before structure is received"
          });
        }
        break;
      case "amendment":
        //save the amendment
        amendment = data.update;

        //require new clause to be specified with types add and replace
        if (
          (amendment.type === "add" || amendment.type === "replace") &&
          !amendment.newClause
        ) {
          //error if not present
          throw Error(
            "a new clause has to be specified with the amendment " +
              "types add and replace, but was not."
          );
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
      case "saveAmd":
        //reset the amendment to nothing
        amendment = null;

        //if in apply mode
        if (data.update.saveType === "apply") {
          //save given new structure
          structure = data.update.newStructure;
        }

        //save list of last amendments
        setLastAmdList(data.update.lastAmd);

        //if not given
        if (!lastAmdList) {
          //hide whole display list
          $("#last-amd").setHide(true);
        }

        //re-render without amendment
        render();
        break;
    }
  });

  //display no content message after two seconds (if the content isn't there then)
  setTimeout(() => {
    //check if the content is there, if not, display no content message
    if ($("#resolution").is(":hidden")) {
      $("#no-content-msg").show(250);
    }
  }, 2000);

  //register fullscreen handlers
  $("#enter-fullscreen").on("click", () =>
    //get the viewcontent and try to make it fullscreen
    makeFullScreen($("#viewcontent")[0])
  );
});

//regularly update the last amd list (every 10 seconds)
//we need this to update the time dispaly on the last amd items
setInterval(updateLastAmdList, 10000);
