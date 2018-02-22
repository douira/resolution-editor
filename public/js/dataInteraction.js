/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/* global makeAlertMessage,
  checkRequiredFields,
  module,
  changesSaved:true,
  resolutionToken,
  resolutionCode,
  displayToast,
  allowedSubclauseDepth,
  sendJsonLV,
  sendLVUpdates,
  resolutionStage,
  resolutionAttributes,
  getAmendmentUpdate*/
/* exported loadFilePick,
  serverLoad,
  generatePdf,
  generatePlaintext,
  serverSave,
  downloadJson,
  sendLVUpdate,
  onAllSaveDone*/
//file actions are defined in this file

//current version of the resolution format supported
var supportedResFileFormats = [6];

//get resolutionFormat from module exported
var resolutionFormat = module.exports.resolutionFormat;

//returns a bug report tag string
function bugReportLink(errorCode) {
  //calling it probelm report because it may be user error
  return "<a href='https://github.com/douira/resolution-editor/issues/new" +
    "?title=Problem Report: " + errorCode + "'>problem report</a>";
}

//displays a modal message for invalid json file at parse or apply stage
function jsonReadErrorModal(errorCode) {
  console.log("error", errorCode);
  makeAlertMessage(
    "error_outline", "Error reading file", "ok",
    "The provided data could not be read and processed." +
    " This may be because the file you provided isn't in the format produced by this program or" +
    " was corrupted in some way. Please file a " + bugReportLink(errorCode) +
    " and describe this problem if you believe this error isn't your fault.", errorCode);
}

//validates fields with user feedback, returns false if there is a bad field
function validateFields(noAlert) {
  //actually check the fields
  var fieldsOk = checkRequiredFields();

  //make error message if necessary
  if (! fieldsOk && (typeof noAlert === "undefined" || ! noAlert)) {
    makeAlertMessage(
      "warning", "Some field(s) invalid", "ok",
      "There are fields with missing or invalid values. " +
      "Phrase fields must contain one of the suggested values only. " +
      "<br>Invalid fields are marked <span class='red-underline'>red</span>.");
  }

  //return value again
  return fieldsOk;
}

//parses a given list of clauses into the given clause list element
function parseClauseList(arr, elem) {
  //give list of clause objects to clause list
  //and have it load the into clauses and lists recursivle
  elem.getData().loadedData = arr;
  elem.trigger("fromLoadedData");
}

//returns the maximum subclause depth found in given clause list (top list is non-sub)
function getMaxSubclauseDepth(clauseList, depthOffset) {
  //start at 0 if not given
  if (typeof depthOffset === "undefined") {
    depthOffset = 0;
  } else {
    //increment with deeper level
    depthOffset ++;
  }

  //maximum depth for all clauses in list
  return Math.max.apply(null, clauseList.map(function(clause) {
    //check if has subclauses
    if (clause.hasOwnProperty("sub")) {
      //recurse
      return getMaxSubclauseDepth(clause.sub, depthOffset);
    } else {
      return depthOffset;
    }
  }));
}

//checks that a saved or loaded editor object has all the required data
function validateEditorData(obj) {
  //validate object structure
  var isValidStructure = resolutionFormat.check(obj);

  //check maximum subclause tree depth
  if (isValidStructure) {
    var clauses = obj.resolution.clauses;
    return getMaxSubclauseDepth(clauses.preambulatory) <= allowedSubclauseDepth.preamb &&
           getMaxSubclauseDepth(clauses.operative) <= allowedSubclauseDepth.op;
  }
  return false;
}

//loads a json into the editor
function loadJson(json, callbackOnSuccess) {
  //basic parse if necessary
  var obj;
  if (typeof json === "string") {
    try {
      //json parse
      obj = JSON.parse(json);
    } catch (e) {
      //notify and abort
      jsonReadErrorModal("parse_fail");
      return;
    }
  } else {
    //already parsed into object
    obj = json;
  }

  //check for magic string to prevent loading of other json files (unless tampered with)
  if (obj.magic !== resolutionFormat.magicIdentifier) {
    jsonReadErrorModal("magic_wrong");
    return;
  }

  //check file version, modal doesn't work yet, clashes with previous one
  if (obj.version && supportedResFileFormats.indexOf(obj.version) === -1) {
    makeAlertMessage(
      "warning", "File format is outdated", "ok",
      "The provided file could be read but is in an old and unsupported format." +
      " Please file a " + bugReportLink("old_format") + " and describe this problem." +
      " if you wish to receive help concerning this issue.", "old_format");
    return;
  }

  //check that the loaded data is valid
  if (! validateEditorData(obj)) {
    //make error message
    jsonReadErrorModal("structure_invalid");
    return;
  }

  //prepare loading: reset editor to original state
  $(".clause").trigger("attemptRemove");
  $("input, textarea").trigger("reset");

  //put author data into field
  $("#author-name").val(obj.author).trigger("activateLabel");

  //get resolution object
  var res = obj.resolution;

  //put data into general data fields
  $("#question-of").val(res.address.questionOf).trigger("activateLabel");
  $("#forum-name").val(res.address.forum).trigger("activateLabel");
  $("#main-spon").val(res.address.sponsor.main).trigger("activateLabel");

  //init chips with new data, convert array to tag objects
  var elem = $("#co-spon");
  elem.getData().initData = res.address.sponsor.co.map(function(str) {
    return { tag: str };
  });

  //trigger init to actually display the content
  elem.trigger("init");

  //parse clauses
  parseClauseList(res.clauses.preambulatory,
                  $("#preamb-clauses").children(".clause-list"));
  parseClauseList(res.clauses.operative,
                  $("#op-clauses").children(".clause-list"));

  //call success callback
  if (typeof callbackOnSuccess === "function") {
    callbackOnSuccess();
  }
}

//load file from computer file system
function loadFilePick() {
  //make alert message file select
  makeAlertMessage(
    "file_upload", "Open resolution file", "cancel", function(body, modal) {
      body.text("Select a resolution file with the extension '.rso' to open:");
      var fileSelector = modal.find("#file-selector");
      fileSelector.show();
      var fileInput = fileSelector.find(".file-input");
      fileInput.getData().fileLoadCallback = function(text) {
        //close and thereby reset for other modal action
        modal.modal("close");

        //load text into editor
        loadJson(text);

        //changes loaded from file are not "really" server saved
        //(and flag isn't reset because of this)
      };
    });
}

//loads resolution from server
function serverLoad(token, doToast, callback) {
  //make settings object
  var ajaxSettings = {
    url: "/resolution/load/" + resolutionToken,
    type: resolutionCode ? "POST" : "GET"
  };

  //add post data if we have a code to send
  if (resolutionCode) {
    ajaxSettings.data = { code: resolutionCode };
  }

  //do ajax with settings
  $.ajax(ajaxSettings)
  .done(function(response) {
    //attempt to load json into editor
    loadJson(response, function() {
        //display toast
      if (doToast) {
        displayToast("Successfully loaded");
      }

      //call callback if there is one
      if (typeof callback === "function") {
        callback();
      }

      //set flag, loaded resolution is fully saved already
      changesSaved = true;
    });
  })
  .fail(function() {
    //there was a problem
    makeAlertMessage("error_outline", "Error loading resolution", "ok",
        "The server encountered an error or denied the requst to load the resolution." +
        " Please file a " + bugReportLink("res_load") + " and describe this problem.", "res_load");
  });
}

//sends the current json of to the server and calls back with the url to the generated pdf
function generatePdf() {
  //start the spinner to indicate activity
  var spinner = $("#pdf-wait-spinner").removeClass("hide-this");

  //send to server
  $.get("/resolution/renderpdf/" + resolutionToken)
  .done(function(response) {
    //stop showing spinner
    spinner.addClass("hide-this");

    //display link to generated pdf
    makeAlertMessage(
      "description", "Generated PDF file", "done",
      "Click <b><a href='" + response +
      "' target='_blank'>here</a></b> to view your resolution as a PDF file.");
  })
  .fail(function() {
    //stop showing spinner
    spinner.addClass("hide-this");

    //display error and request creation of bug report
    makeAlertMessage(
      "error_outline", "Error generating PDF", "ok",
      "The server encountered an error while trying to generate the requested" +
      " PDF file. Read the <a href='/help#formatting'>help page section</a> on formatting" +
      " and special characters before proceeding. If the error persists after modyfing your" +
      " resolution to conform to the formatting and special character rules, please file a " +
      bugReportLink("pdf_gen") + " and describe this problem.", "pdf_gen");
  });
}

//directs the user to the plaintext view
function generatePlaintext() {
  //make message
  makeAlertMessage(
    "description", "Generated Plaintext", "done",
    "Click <b><a href='/resolution/renderplain/" + resolutionToken +
    "' target='_blank'>here</a></b> to view your resolution as a plain text file.");
}

//gets a clause as an object
//IMPORTANT: if the outputted format changes, increment the version number by one!
//(see resolutionFormat.js)
$.fn.clauseAsObject = function(allowEmpty) {
  //return as array if given list
  if (this.is(".clause-list")) {
    var clauses = [];

    //add all clauses
    this.children(".clause").each(function() {
      var clauseObj = $(this).clauseAsObject(allowEmpty);
      if (clauseObj) {
        clauses.push(clauseObj);
      }
    });

    //return all clause objects
    return clauses;
  }

  //return false if isn't a clause
  if (! this.is(".clause")) {
    return false;
  }

  //make object with content
  var clauseData = {
    content: this.children(".clause-content").find("textarea").val().trim()
  };

  //stop if no content
  if (! clauseData.content && ! allowEmpty) {
    return false;
  }

  //check for phrase field
  if (this.children(".phrase-input-wrapper").length) {
    clauseData.phrase = this.children(".phrase-input-wrapper").find("input").val().trim();
  }

  //check for visible extended clause content
  if (this.children(".clause-content-ext:visible").length) {
    clauseData.contentExt = this.children(".clause-content-ext").find("textarea").val().trim();
  }

  //get subclauses and add if not empty list
  var subclauses = this.children(".clause-list-sub").clauseAsObject(allowEmpty);
  if (subclauses.length) {
    clauseData.sub = subclauses;
  }

  //return created clause data object
  return clauseData;
};

//returns a json string of the object currently in the editor
function getEditorContent(makeJsonNice) {
  //get object
  var res = getEditorObj();

  //return stringyfied
  return makeJsonNice ? JSON.stringify(res, null, 2) : JSON.stringify(res);
}

//return the editor content as the resolution file object
function getEditorObj(allowEmpty) {
  //create root resolution object and gather data
  var res = {
    magic: resolutionFormat.magicIdentifier,
    version: Math.max.apply(null, supportedResFileFormats), //use highest supported version
    author: $("#author-name").val().trim(),
    resolution: {
      address: {
        forum: $("#forum-name").val().trim(),
        questionOf: $("#question-of").val().trim(),
        sponsor: {
          main: $("#main-spon").val().trim()
        }
      },
      clauses: {
        preambulatory: $("#preamb-clauses > .clause-list").clauseAsObject(allowEmpty),
        operative: $("#op-clauses > .clause-list").clauseAsObject(allowEmpty)
      }
    }
  };

  //get co-sponsors and add if any present
  var cosponsorData = $("#co-spon").material_chip("data");
  if (cosponsorData.length) {
    //map to array of strings
    res.resolution.address.sponsor.co = cosponsorData.map(function(obj) {
      return obj.tag.trim();
    });
  }

  //return created object
  return res;
}

//wait for save operations to finish before starting pdf render
var saveOps = {
  //number of pending save operations,
  pending: 0,

  //call callbacks when all save operations finish, queue of added callbacks
  callbacks: []
};

//registeres a callback
function onAllSaveDone(callback) {
  //must be a function
  if (typeof callback === "function") {
    //call immediately if there are no save operations in progress
    if (saveOps.pending) {
      //queue callback
      saveOps.callbacks.push(callback);
    } else {
      callback();
    }
  }
}

//saves the resolution from editor to the server
function serverSave(callback, doToast, silentFail) {
  //do not save if not allowed to
  if (! resolutionAttributes.allowSave) {
    return;
  }

  //display if not specified
  if (typeof doToast === "undefined") {
    doToast = true;
  }

  //validate fields, no message if silent fail is specified
  if (! validateFields(silentFail)) {
    //stop because not ok with missing data
    return;
  }

  //make data object
  var data = {
    content: getEditorContent(false)
  };

  //add code to data if given
  if (resolutionCode) {
    data.code = resolutionCode;
  }

  //preemptively mark as saved
  changesSaved = true;

  //registers callback
  onAllSaveDone(callback);

  //register a pending save op
  saveOps.pending ++;

  //send post request
  $.post("/resolution/save/" + resolutionToken, data, "text")
  .done(function() {
    //make save ok toast if enabled
    if (doToast) {
      displayToast("Successfully saved");
    }

    //decrement active op counter
    saveOps.pending --;

    //if there are no ops pending
    if (! saveOps.pending) {
      //call all callbacks in order
      saveOps.callbacks.forEach(function(c) { c(); });

      //clear callbacks
      saveOps.callbacks = [];
    }

    //if we are in stage 0, reload the page on successful save
    if (! resolutionStage) {
      location.reload();
    }
  })
  .fail(function() {
    //decrement active op counter
    saveOps.pending --;

    //clear callbacks if no ops still running
    if (! saveOps.pending) {
      saveOps.callbacks = [];
    }

    //mark as not saved, problem
    changesSaved = false;

    //there was a problem
    makeAlertMessage("error_outline", "Error saving resolution", "ok",
        "The server encountered an error or denied the requst to save the resolution." +
        " Please file a " + bugReportLink("res_save") + " and describe this problem.", "res_save");
  });
}

//generates and downloeads json representation of the editor content
function downloadJson() {
  //validate
  if (! validateFields()) {
    //stop because not ok with missing data
    return;
  }

  //make a file download with the editor content
  saveFileDownload(getEditorContent(true));
}

//save file to be downloaded
function saveFileDownload(str) {
  //make element in modal to download with and add data to download
  var fileName = "resolution.rso";
  makeAlertMessage("file_download", "Save resolution as file", "cancel", function(body) {
    //make download button with blob data
    body.append("<br>");
    $("<a/>")
      .addClass("waves-effect waves-light btn white-text center-align")
      .attr("download", fileName)
      .text("Download Resolution: " + fileName)
      .attr("href", URL.createObjectURL(new Blob([str], { type: "application/json" })))
      .appendTo($("<div class='.clear-and-center'></div>").appendTo(body))
      .on("click", function(e) {
        e.stopPropagation();

        //close modal after download
        $(this).parents(".modal").modal("close");

        //changes saved to file are not "really" server saved
      });
    body.append(
      "If the file download doesn't start, try again and if it still doesn't work " +
      "please file a " + bugReportLink("download_not_starting") + " and describe this problem.");
  });
}

//the path cache keeps track of already calculated cached paths
var pathCache = {};

//is incremented every time a path is added to the cache
var nextPathId = 0;

//gets the path of a clause,
//path starts with the bottom element so that popping produces the first selector
$.fn.getContentPath = function() {
  //get path id of this element
  /*we use an element specific attribute because modifying it won't change the attribute in
  other elements (.data() in jquery only copies the reference apparently when elements are
  cloned and thereby causes two elements to have the same data object)*/
  var pathId = this.attr("data-path-id");

  //check if there is a cached path for this element present
  if (typeof pathId !== "undefined" && String(pathId) in pathCache) {
    //use cached path instead
    return pathCache[String(pathId)];
  }

  //path elements in order from deepest to top
  var path = [];

  //current element we are examining
  var elem = this; //start off with this element

  //must be input or textarea to have triggered a change(or similar) event
  if (elem.is("input,textarea")) {
    //first specifier in path is the role of the field in the clause
    var elemClasses = elem.attr("class");

    //map to structure format name
    [{ from: "phrase-input", to: "phrase" },
     { from: "clause-content-text", to: "content" },
     { from: "clause-content-ext-text", to: "contentExt" }]
    .forEach(function(classValue) {
      //check if element has current class
      if (elemClasses.indexOf(classValue.from) !== -1) {
        //use mapped string as first path specifier, we expect this only to happen once
        path[0] = classValue.to;
      }
    });
  } else {
    //called on wrong element
    return [];
  }

  //for parent clauses
  var parentClauses = elem.parents(".clause");
  parentClauses.each(function(reversedDepth) {
    //add index of each clause in its list to path
    path.push($(this).indexInParent());

    //add "sub" property path element if we're not in a top clause
    if (parentClauses.length - 1 > reversedDepth) {
      path.push("sub");
    }
  });

  //no parent found, we are at the top level: check if in amendment
  var inAmendment = elem.closest("#amd-clause-wrapper").length;

  //add amendment path segment if in amendment
  if (inAmendment) {
    path.push("amendment");
  } else {
    //specify what type of clause (op or preamb)
    path.push(elem.closest("#preamb-clauses").length ? "preambulatory" : "operative");
  }

  //set the path id as the current id number and increment
  elem.attr("data-path-id", nextPathId);

  //cache the path and increment for next path cache operation
  pathCache[nextPathId++] = path;

  //return calculated path
  return path;
};

//the liveview socket, if present, is in currentWS (var in liveviewWS.js)

//send/do the actual amendment update
function doAmdUpdate() {
  //update amd display indexes and get the amendment descriptor object
  var amdUpdate = getAmendmentUpdate(! sendLVUpdates);

  //do not send update if it cannot be displayed in this state
  if (! amdUpdate) {
    return;
  }

  //send amendment update
  sendJsonLV({
    type: "amendment",
    update: amdUpdate
  });
}

//sends edit updates or handles them through another part
//given elem can also be enclosing clause list on structure update,
//elem must be given if not in catchup event type
/* eventTypes, there apply to all types of clauses (mostly)
type: content
  type,
  autocomplete,
type: structure
  catchup, called when a viewed joined and previously no lv updates were being sent
  remove, clause is removed (and maybe extcontent also removed)
  add, clause is added with "add clause"
  move, clause order is changed
  makesub, subclause is added with the subclause EAB
  addext, ext content field is created
  clear, content cleared, ext content removed but subclauses stay
*/
function sendLVUpdate(type, eventType, elem) {
  //sends a structure update to server
  if (type === "structure") {
    //empty path cache as structure has changed and cache of paths is invalid now
    pathCache = {};

    //check if given element is in the amendment display
    var inAmd = elem && elem.closest("#amd-clause-wrapper").length;

    //send regular structure update if change didn't happen in amendment
    if ((! inAmd || eventType === "catchup") && sendLVUpdates) {
      //send regular structure update
      sendJsonLV({
        type: "updateStructure",
        //just send the whole editor content for rerender after structure change
        update: getEditorObj(true) //true to also get empty fields
      });
    }

    //calculate with elem if given
    var isTopLevelOp;
    if (elem) {
      //elem is a clause list
      var isClauseList = elem.is(".clause-list");

      //parent clause list
      var clauseList = isClauseList ? elem : elem.parent();

      //check if clause is top level and op type, check type of parent list
      isTopLevelOp = clauseList.is(".clause-list:not(.clause-list-sub)") &&
        (isClauseList ? elem : elem.parent()).children(".clause").attr("data-clause-type") === "op";
    }

    //need index update on amd display for always catchup and for top level clauses
    //on remove, add, move or in amendment
    if (eventType === "catchup" || inAmd ||
        isTopLevelOp && (eventType === "remove" || eventType === "add" || eventType === "move")) {
      //send/update index
      doAmdUpdate();
    }
  } else if (type === "amendment") {
    //process amendment update directly
    doAmdUpdate();
  } else if (type === "content") {
    //don't send if not necessary
    if (! sendLVUpdates) {
      return;
    }

    //send as structure update
    sendJsonLV({
      type: "updateContent",
      update: {
        contentPath: elem.getContentPath(),
        content: elem.val().trim()
      }
    });
  } else {
    console.error("bad lv event type", type);
  }
}

