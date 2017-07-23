/*jshint esnext: false, browser: true, jquery: true*/
/*global makeAlertMessage: true */
//file actions are defined in this file

//loads a json into the editor
function loadJson(obj) {

}

//load file from computer file system
function loadFilePick(container) {

}

//sends the current json of to the server and calls back with the url to the generated pdf
function generatePdf(container, callback) {
  //get json for container
  var json = getEditorJson(container);

  //send to server

}

//display pdf directly after generating
function makePdfDisplay(container, callback) {

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
      .addClass("waves-effect waves-light btn white-text" +
                $("#file-action-save").attr("class"))
      .attr("download", fileName)
      .text("Download Resolution: " + fileName)
      .attr("href", URL.createObjectURL(new Blob([str], {type: "application/json"})))
      .appendTo(body)
      .on("click", function(e) {
        e.stopPropagation();

        //close modal after download
        $(this).modal("close");
      });
    body.append("<br>");
  });
}
