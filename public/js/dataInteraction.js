/*jshint esnext: false, browser: true, jquery: true*/
/*global makeAlertMessage: true */
//file actions are defined in this file

//string used to identify files saved by this website (mild protection for now)
var magicIdentifier = "PG52QE1AM4LACMX9";

//current version of the resolution format supported
var supportedResFileFormats = [1];

//displays a modal message for invalid json file at parse or apply stage
function jsonReadErrorModal() {
  makeAlertMessage(
    "error_outline", "Error reading file", "ok",
    "The provided file could not be read and processed." +
    " This may be because the file you provided isn't in the format produced by this program or" +
    " was corrupted in some way. Please file a <a href='https://github.com/douira/resolution-" +
    "editor/issues/new?&labels[]=user%20bug%20report'>bug report</a> and describe this problem" +
    " if you believe this error isn't your fault.");
}

//loads a json into the editor
function loadJson(json, container) {
  //basic parse
  var obj;
  try {
    //json parse
    obj = JSON.parse(json);

    //check for magic string to prevent loading of other json files (unless tampered with)
    if (obj.magic !== magicIdentifier) {
      throw new Error("json not a resolution");
    }
  } catch (e) {
    //notify and abort
    jsonReadErrorModal();
    return;
  }

  //check file version
  if (supportedResFileFormats.indexOf(obj.version) === -1) {
    makeAlertMessage(
      "warning", "File format is outdated", "ok",
      "The provided file could be read but is in an old and unsupported format." +
      " Please file a <a href='https://github.com/douira/resolution-" +
      "editor/issues/new?&labels[]=user%20bug%20report'>bug report</a> and describe this problem" +
      " if you want to receive help with this issue.");
  }

  //parse object into editor

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
        //loadJson(text, container);
      };
    });
}

//sends the current json of to the server and calls back with the url to the generated pdf
function generatePdf(container) {
  //send to server
  $.post("/generatepdf", getEditorJson(container), function(response) {
    //error with response data "error"
    if (response === "error") {
      //display error and request creation of bug report
      makeAlertMessage(
        "error_outline", "Error generating PDF", "ok",
        "The server encountered an unexpected error" +
        " while trying to generate the requested PDF file." +
        "Please file a <a href='https://github.com/douira/resolution-editor/issues/new" +
        "?&labels[]=user%20bug%20report'>bug report</a> and describe this problem.");
    } else {
      //display link to generated pdf
      makeAlertMessage(
        "description", "Generated PDF file", "done",
        "Click <b><a href='" + response + "'>here</a></b> to view your resolution as a PDF file.");
    }
  });
}

//gets a clause as an object
$.fn.clauseAsObject = function() {
  //return as array if given list
  if (this.is(".clause-list")) {
    var clauses = [];

    //add all clauses
    this.children(".clause").each(function() {
      clauses.push($(this).clauseAsObject());
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
function getEditorJson(container) {
  //create root resolution object and gather data
  var res = {
    magic: magicIdentifier,
    version: Math.max.apply(null, supportedResFileFormats), //use highest supported version
    status: {
      editied: Date.now(),
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
    res.resolution.address.sponsor.co = cosponsorData;
  }

  //return stringyfied
  return JSON.stringify(res, null, 2);
}

//generates and downloeads json representation of the editor content
function downloadJson(container) {
  saveFileDownload(getEditorJson(container));
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
      "If the file download doesn't start, try again and then " +
      "please file a <a href='https://github.com/douira/resolution-editor/issues/new" +
      "?&labels[]=user%20bug%20report'>bug report</a> and describe this problem.");
  });
}
