/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
firstItem,
updateList,
updateListConfig,
makeAlertMessage,
advanceButton*/

//current state of the buttons for the first item
//can be: unrendered, rendering, rendered, viewed (in that order)
var firstItemPdfStage;

//updates the buttons and spinner acording to the view stage
function setFirstItemStage(newStage, useItem) {
  //use given item is present
  useItem = useItem || firstItem;

  //set to new stage
  firstItemPdfStage = newStage;

  //switch to stage
  switch(firstItemPdfStage) {
    case "unrendered":
      $("#print-btn-text").text("Hover to Generate PDF");
      $("#print-btn i").text("refresh");
      $("#print-btn")
        .attr("href", "#")
        .removeClass("btn")
        .addClass("btn-flat");
      advanceButton.addClass("disabled");
      break;
    case "rendering":
      $("#print-btn-inner").addClass("hide-this");
      $("#pdf-wait-spinner").removeClass("hide-this");
      break;
    case "rendered":
      $("#print-btn-inner").removeClass("hide-this");
      $("#pdf-wait-spinner").addClass("hide-this");
      advanceButton.addClass("disabled");

      //set to be rendered
      useItem.unrenderedChanges = false;

      //setup button
      $("#print-btn")
        .attr("href", "/rendered/" + useItem.token + ".pdf")
        .removeClass("btn-flat")
        .addClass("btn")
        .find("i").text("print");
      $("#print-btn-text").text("View PDF");
      break;
    case "viewed":
      advanceButton.removeClass("disabled");
      break;
  }
}

//on document ready
$(document).ready(function() {
  //need to set rendering state first
  updateListConfig.preCopyHandler = function(newFirst, firstItem) {
    //reset flag to given value if it's a new item
    if (! firstItem || newFirst.token !== firstItem.token ||
        newFirst.unrenderedChanges !== firstItem.unrenderedChanges) {
      //set to appropriate stage
      setFirstItemStage(newFirst.unrenderedChanges ? "unrendered" : "rendered", newFirst);
    }
  };

  //the url to get the data from
  updateListConfig.url = "/list/print/getitems";

  //do initial list update
  updateList();

  //handler how mouseenter (like hover) and click of view pdf button
  $("#print-btn")
  .on("mouseenter", function() {
    //if the resolution hasn't been rendered yet
    if (firstItemPdfStage === "unrendered") {
      //move into rendering stage
      setFirstItemStage("rendering");

      //ask the server to render
      $.get("/resolution/renderpdf/" + firstItem.token).done(function() {
        //finished rendering, sets url
        setFirstItemStage("rendered");

        //if page amount was not known previously, update list to fetch and display
        if (! firstItem.pageAmount) {
          updateList();
        }
      }).fail(function() {
        //finished rendering
        setFirstItemStage("rendered");

        //display error and and help directives
        makeAlertMessage(
          "error_outline", "Error generating PDF", "ok",
          "The server encountered an error while trying to generate the requested" +
          " PDF file. This may happen when the resolution includes illegal characters." +
          " Please talk to the owner of this document and ask IT-Management for help if" +
          " this problem persists.", "pdf_gen_printqueue");
      });
    }
  })
  .on("click", function() {
    //when the open pdf button is clicked and opened the pdf
    //make the advance resolution button appear in color
    if (firstItemPdfStage === "rendered") {
      //move into viewed stage
      setFirstItemStage("viewed");
    }
  });
});
