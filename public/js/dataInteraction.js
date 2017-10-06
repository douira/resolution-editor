/*jshint esversion: 5, browser: true, jquery: true */
/* global makeAlertMessage,
  checkRequiredFields,
  module,
  changesSaved:true,
  resolutionToken,
  resolutionCode,
  Materialize,
  allowedSubclauseDepth */
//file actions are defined in this file

//current version of the resolution format supported
var supportedResFileFormats = [4];

//get resolutionFormat from module exported
var resolutionFormat = module.exports.resolutionFormat;

//returns a bug report tag string
function bugReportLink(errorCode) {
  var bodyContent = encodeURIComponent(
    "Please try to provide as much information as possible.\n\n" +
    "Operating System:\n\n" +
    "Device Type (handheld, desktop etc.):\n\n" +
    "Browser + Version:\n\n" +
    "Browser Extensions that can modify website content:\n\n" +
    "What you were doing when the bug occured and beforehand:\n\n" +
    "Were you able to reproduce the bug?\n\n" +
    "Did the bug occur several times or in a recognisable pattern?\n\n" +
    "Any other relevant information:\n\n");

  //calling it probelm report because it may be user error
  return "<a href='https://github.com/douira/resolution-editor/issues/new" +
    "?&labels[]=user%20problem%20report" +
    "&title=Problem Report: " + errorCode + "&body=" + bodyContent + "'>problem report</a>";
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
function validateFields() {
  //actually check the fields
  var fieldsOk = checkRequiredFields();

  //make error message if necessary
  if (! fieldsOk) {
    makeAlertMessage(
      "warning", "Some field(s) invalid", "ok",
      "There are fields with missing or invalid values. " +
      "Phrase fields must conatein one of the suggested values only. " +
      "<br>The fields are marked <span class='red-underline'>red</span>.");
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
function loadJson(json, container, callbackOnSuccess) {
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
  }

  //check that the loaded data is valid
  if (! validateEditorData(obj)) {
    //make error message
    jsonReadErrorModal("structure_invalid");
    return;
  }

  //prepare loading: reset editor to original state
  container.find(".clause").trigger("attemptRemove");
  container.find("input, textarea").trigger("reset");

  //put author data into field
  container.find("#author-name").val(obj.author).trigger("activateLabel");

  //get resolution object
  var res = obj.resolution;

  //put data into general data fields
  container.find("#question-of").val(res.address.questionOf).trigger("activateLabel");
  container.find("#forum-name").val(res.address.forum).trigger("activateLabel");
  container.find("#main-spon").val(res.address.sponsor.main).trigger("activateLabel");

  //init chips with new data
  var elem = container.find("#co-spon");
  elem.getData().data = res.address.sponsor.co.map(function(str) {
    return { tag: str };
  });
  elem.trigger("init");

  //parse clauses
  parseClauseList(res.clauses.preambulatory,
                  container.find("#preamb-clauses").children(".clause-list"));
  parseClauseList(res.clauses.operative,
                  container.find("#op-clauses").children(".clause-list"));

  //call success callback
  if (typeof callbackOnSuccess === "function") {
    callbackOnSuccess();
  }
}

//load file from computer file system
function loadFilePick(container, callback) {
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
        loadJson(text, container);

        //changes loaded from file are not "really" server saved
        //(and flag isn't reset because of this)
      };
    });
}

//loads resolution from server
function serverLoad(token, displayToast, container, callback) {
  //stop if we're still in stage 0 and there isn't anything to load
  if ($("#resolution-stage").text() === "0") {
    return;
  }

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
    loadJson(response, container, function() {
        //display toast
      if (displayToast) {
        Materialize.toast("Successfully loaded", 3000);
      }

      //call callback if there is one
      if (typeof callback === "function") {
        callback();
      }

      //set flag
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
  //send to server
  $.get("/resolution/renderpdf/" + resolutionToken)
  .done(function(response) {
    //display link to generated pdf
    makeAlertMessage(
      "description", "Generated PDF file", "done",
      "Click <b><a href='" + response +
      "' target='_blank'>here</a></b> to view your resolution as a PDF file.");
  })
  .fail(function() {
    //display error and request creation of bug report
    makeAlertMessage(
      "error_outline", "Error generating PDF", "ok",
      "The server encountered an unexpected error" +
      " while trying to generate the requested PDF file." +
      " Please file a " + bugReportLink("pdf_gen") + " and describe this problem.", "pdf_gen");
  });
}

//directs the user to the plaintext view
function generatePlaintext(container) {
  //make message
  makeAlertMessage(
    "description", "Generated Plaintext", "done",
    "Click <b><a href='/resolution/renderplain/" + resolutionToken +
    "' target='_blank'>here</a></b> to view your resolution as a plain text file.");
}

//gets a clause as an object
//IMPORTANT: if the outputted format changes, increment the version number by one!
//(see resolutionFormat.js)
$.fn.clauseAsObject = function() {
  //return as array if given list
  if (this.is(".clause-list")) {
    var clauses = [];

    //add all clauses
    this.children(".clause").each(function() {
      var clauseObj = $(this).clauseAsObject();
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
  if (! clauseData.content) {
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

  //get subclauses and add if not empty
  var subclauses = this.children(".clause-list-sub").clauseAsObject();
  if (subclauses.length) {
    clauseData.sub = subclauses;
  }

  //if content is the only attribute, coerce to single string
  if (Object.keys(clauseData).length === 1) {
    clauseData = clauseData.content;
  }

  //return created clause data object
  return clauseData;
};

//returns a json string of the object currently in the editor
function getEditorContent(container, makeJsonNice) {
  //create root resolution object and gather data
  var res = {
    magic: resolutionFormat.magicIdentifier,
    version: Math.max.apply(null, supportedResFileFormats), //use highest supported version
    author: container.find("#author-name").val().trim(),
    resolution: {
      address: {
        forum: container.find("#forum-name").val().trim(),
        questionOf: container.find("#question-of").val().trim(),
        sponsor: {
          main: container.find("#main-spon").val().trim()
        }
      },
      clauses: {
        preambulatory: container.find("#preamb-clauses > .clause-list").clauseAsObject(),
        operative: container.find("#op-clauses > .clause-list").clauseAsObject()
      }
    }
  };

  //get co-sponsors and add if any present
  var cosponsorData = container.find("#co-spon").material_chip("data");
  if (cosponsorData.length) {
    //map to array of strings
    res.resolution.address.sponsor.co = cosponsorData.map(function(obj) {
      return obj.tag.trim();
    });
  }

  //return stringyfied
  return makeJsonNice ? JSON.stringify(res, null, 2) : JSON.stringify(res);
}

//saves the resolution from given container to the server
function serverSave(container, callback, displayToast) {
  //display if not specified
  if (typeof displayToast === "undefined") {
    displayToast = true;
  }

  //validate fields
  if (! validateFields()) {
    //stop because not ok with missing data
    return;
  }

  //make data object
  var data = {
    content: getEditorContent(container, false)
  };

  //add code to data if given
  if (resolutionCode) {
    data.code = resolutionCode;
  }

  //send post request
  $.post("/resolution/save/" + resolutionToken, data, "text")
  .done(function() {
    //make save ok toast if enabled
    if (displayToast) {
      Materialize.toast("Successfully saved", 3000);
    }

    //mark as saved
    changesSaved = true;

    //call callback on completion
    if (typeof callback === "function") {
      callback();
    }
  })
  .fail(function() {
    //there was a problem
    makeAlertMessage("error_outline", "Error saving resolution", "ok",
        "The server encountered an error or denied the requst to save the resolution." +
        " Please file a " + bugReportLink("res_save") + " and describe this problem.", "res_save");
  });
}

//generates and downloeads json representation of the editor content
function downloadJson(container) {
  //validate
  if (! validateFields()) {
    //stop because not ok with missing data
    return;
  }

  //make a file download with the editor content
  saveFileDownload(getEditorContent(container, true));
}

//save file to be downloaded
function saveFileDownload(str) {
  //make element in modal to download with and add data to download
  var fileName = "resolution.rso";
  makeAlertMessage("file_download", "Save resolution as file", "cancel", function(body, modal) {
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
