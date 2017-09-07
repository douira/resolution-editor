/*jshint esnext: false, browser: true, jquery: true*/
/*global
  makeAlertMessage,
  resolutionFileFormat,
  validateObjectStructure,
  magicIdentifier,
  checkRequiredFields,
  allowedSubclauseDepth: true */
//file actions are defined in this file

//current version of the resolution format supported
var supportedResFileFormats = [2];

//returns a bug report tag string
function bugReportLink(errorCode) {
  const bodyContent = encodeURIComponent(
    `Please try to provide as much information as possible.
Operating System:

Device Type (handheld, desktop etc.):

Browser + Version:

Browser Extensions that can modify website content:

What you were doing when the bug occured and beforehand:

Were you able to reporduce the bug?

Did the bug occur several times or in a recognisable pattern?

Any other relevant infornation:
`);

  //calling it probelm report because it may be user error
  return "<a href='https://github.com/douira/resolution-editor/issues/new" +
    "?&labels[]=user%20problem%20report" +
    `&title=Problem Report: ${errorCode}&body=${bodyContent}'>problem report</a>`;
}

//displays a modal message for invalid json file at parse or apply stage
function jsonReadErrorModal(errorCode) {
  console.log("error", errorCode);
  makeAlertMessage(
    "error_outline", "Error reading file", "ok",
    "The provided file could not be read and processed." +
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
  var isValidStructure = validateObjectStructure(obj, resolutionFileFormat);

  //check maximum subclause tree depth
  if (isValidStructure) {
    var clauses = obj.resolution.clauses;
    return getMaxSubclauseDepth(clauses.preambulatory) <= allowedSubclauseDepth.preamb &&
           getMaxSubclauseDepth(clauses.operative) <= allowedSubclauseDepth.op;
  }
  return false;
}

//loads a json into the editor
function loadJson(json, container) {
  //basic parse
  var obj;
  try {
    //json parse
    obj = JSON.parse(json);
  } catch (e) {
    //notify and abort
    jsonReadErrorModal("parse_fail");
    return;
  }

  //check for magic string to prevent loading of other json files (unless tampered with)
  if (obj.magic !== magicIdentifier) {
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
  container.find("#author-name").val(obj.status.author).trigger("activateLabel");

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
      };
    });
}

//sends the current json of to the server and calls back with the url to the generated pdf
function generatePdf(container) {
  //validate
  if (! validateFields()) {
    //stop because not ok with missing data
    return;
  }

  //send to server
  $.ajax({
    url: "/generatepdf",
    method: "POST",
    data: getEditorContent(container, false),
    contentType: "application/json; charset=UTF-8",
    dataType: "text",
    error: makeAlertMessage.bind(null,
        "error_outline", "Error sending data to server", "ok",
        "Could not communicate with server properly." +
        " Please file a " + bugReportLink("pdf_ajax") + " and describe this problem.", "pdf_ajax")
  }).done(function(response) {
    //error with response data "error"
    if (response.endsWith(".pdf")) {
      //display link to generated pdf
      makeAlertMessage(
        "description", "Generated PDF file", "done",
        "Click <b><a href='" + response +
        "'>here</a></b> to view your resolution as a PDF file.");
    } else {
      //display error and request creation of bug report
      makeAlertMessage(
        "error_outline", "Error generating PDF", "ok",
        "The server encountered an unexpected error" +
        " while trying to generate the requested PDF file." +
        " Please file a " + bugReportLink("pdf_gen") + " and describe this problem.", "pdf_gen");
    }
  });
}

//gets a clause as an object
//IMPORTANT: if the outputted format changes, increment the version number by one!
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
    content: this.children(".clause-content").find("textarea").val()
  };

  //stop if no content
  if (! clauseData.content) {
    return false;
  }

  //check for phrase field
  if (this.children(".phrase-input-wrapper").length) {
    clauseData.phrase = this.children(".phrase-input-wrapper").find("input").val();
  }

  //check for visible extended clause content
  if (this.children(".clause-content-ext:visible").length) {
    clauseData.contentExt = this.children(".clause-content-ext").find("textarea").val();
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
function getEditorContent(container, makeJson) {
  //create root resolution object and gather data
  var res = {
    magic: magicIdentifier,
    version: Math.max.apply(null, supportedResFileFormats), //use highest supported version
    status: {
      edited: Date.now(),
      author: container.find("#author-name").val()
    },
    resolution: {
      address: {
        forum: container.find("#form-name").val(),
        questionOf: container.find("#question-of").val(),
        sponsor: {
          main: container.find("#main-spon").val()
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
      return obj.tag;
    });
  }

  //return stringyfied
  return makeJson ? JSON.stringify(res, null, 2) : JSON.stringify(res);
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
      .addClass("waves-effect waves-light btn white-text center-align" +
                $("#file-action-save").attr("class"))
      .attr("download", fileName)
      .text("Download Resolution: " + fileName)
      .attr("href", URL.createObjectURL(new Blob([str], {type: "application/json"})))
      .appendTo($("<div class='.clear-and-center'></div>").appendTo(body))
      .on("click", function(e) {
        e.stopPropagation();

        //close modal after download
        $(this).modal("close");
      });
    body.append(
      "If the file download doesn't start, try again and if it still doesn't work " +
      "please file a " + bugReportLink("download_not_starting") + " and describe this problem.");
  });
}
