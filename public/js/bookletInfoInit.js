/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
makeAlertMessage,
displayToast*/

//on document ready
$(document).ready(function() {
  //there are three states: not rendered, rendering, pdf not viewed (clicking goes back to stage 1)
  //the button can also be disabled when wrong data has been entered
  var renderState = "unrendered"; //unrendered, rendering, rendered, disabled

  //true when there are changes that haven't been saved to the server
  var unsavedChanges = false;

  //get booklet id
  var bookletId = $("#booklet-id");

  //get elements
  var titleInput = $("#title-input");
  var sessionInput = $("session-input");
  var saveBtn = $("#save-btn");
  var eligibleList = $("#eligible-list");
  var selectedList = $("#selected-list");

  //preselect signature info elements in groups
  var sigGroups = $("#sig-list .sig-field-group").map(function() {
    //return object of both input fields
    return {
      nameInput: this.find("input.sig-name"),
      posInput: this.find("input.sig-pos")
    };
  }).get();

  //register that a change has been made to the booklet
  function madeChange() {
    //set flag
    unsavedChanges = true;

    //set render state to unrendered
    setRenderState("unrendered");

    //enable save button
    saveBtn.removeClass("disabled");
  }

  //saves the current state of the booklet to the server
  function saveBooklet() {
    //no action if all changes already saved
    if (! unsavedChanges) {
      return;
    }

    //get data for booklet
    var bookletData = {
      //the title and session strings
      title: titleInput.val().trim(),
      session: sessionInput.val().trim(),

      //map signatures from input values
      signatures: sigGroups.map(function(group) {
        //get values from elements
        return {
          name: group.name.val().trim(),
          position: group.pos.val().trim()
        };
      }),

      //get all selected resolutions
      resolutions: selectedList.find(".token").map(function() {
        //map to token string
        return this.text();
      }).get()
    };

    //remove the eigth signature if it's empty
    var lastSignature = bookletData.signatures[7];
    if (! (lastSignature.name.length && lastSignature.position.length)) {
      //remove from signatures
      delete bookletData.signatures[7];
    }

    //send data to server
    $.post("/booklet/save/" + bookletId, bookletData).done(function() {
      //reset flag
      unsavedChanges = false;

      //reset save button to all changes saved
      saveBtn.addClass("disabled");

      //display feeback toast message
      displayToast("Saved Booklet");
    }).fail(function() {
      //display error message
      makeAlertMessage(
          "error_outline", "Error generating PDF", "ok",
          "The server encountered an error while trying to generate the requested" +
          " PDF file. This may happen when a resolution includes illegal characters or" +
          " some attribute of the booklet is invalid." +
          " Please talk to the owner of this document and ask IT-Management for help if" +
          " this problem persists.", "pdf_gen");
    });
  }

  //sets the render state and updates UI elements
  function setRenderState(newState) {
    //depending on new state
    switch (newState) {
      case "unrendered":

        break;
      case "rendering":

        break;
      case "rendered":

        break;
      case "disabled":

        break;

      //bad state given
      default:
        console.error("Bad render state given", newState);
        break;
    }
  }

  //handle mouseenter (like hover) and click of view pdf button
  $("#print-btn")
  .on("mouseenter", function() {
    //if the booklet hasn't been rendered yet
    if (renderState === "unrendered") {
      //move into rendering stage (with spinner)
      setRenderState("rendering");

      //ask the server to render
      $.get("/booklet/renderpdf/" + bookletId).always(function() {
        //finished rendering, sets url
        //on fail: maybe there is a older pdf to look at
        setRenderState("rendered");
      }).fail(function() {
        //display error and and help directives
        makeAlertMessage(
          "error_outline", "Error generating PDF", "ok",
          "The server encountered an error while trying to generate the requested" +
          " PDF file. This may happen when a resolution includes illegal characters or" +
          " some attribute of the booklet is invalid." +
          " Please talk to the owner of this document and ask IT-Management for help if" +
          " this problem persists.", "pdf_gen_booklet");
      });
    }
  })
  .on("click", function() {
    /*when the open pdf button is clicked and opened the pdf,
    go back to unrendered bcause one of the resolutions might have changes,
    we're not reporting resolution changes but the server does regard them internally
    when deciding wether or not to actually re-render the booklet*/
    if (renderState === "rendered") {
      //move back to unrendered
      setRenderState("unrendered");
    }
  });
});
