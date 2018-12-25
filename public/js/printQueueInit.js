/*global
firstItem,
updateList,
updateListConfig,
makeAlertMessage,
queueElems*/

//the url to get the data from
updateListConfig.url = "/list/print/getitems";

//enable extended page info
updateListConfig.extPageInfo = true;

//on document ready
$(document).ready(() => {
  //current state of the buttons for the first item
  //can be: unrendered, rendering, rendered, viewed (in that order)
  let firstItemPdfStage;

  //query elements
  const printBtn = $("#print-btn");
  const printBtnText = $("#print-btn-text");
  const pdfWaitSpinner = $("#pdf-wait-spinner");
  const printBtnInner = $("#print-btn-inner");
  const printBtnIcon = printBtn.find("i");

  //updates the buttons and spinner acording to the view stage
  const setFirstItemStage = (newStage, useItem) => {
    //use given item is present
    useItem = useItem || firstItem;

    //set to new stage
    firstItemPdfStage = newStage;

    //switch to stage
    switch (firstItemPdfStage) {
      case "unrendered":
        printBtnText.text("Hover to Generate PDF");
        printBtnIcon.changeIcon("refresh");
        printBtn
          .attr("href", "#")
          .removeClass("btn")
          .addClass("btn-flat");
        queueElems.advanceButton.disabledState(true);
        break;
      case "rendering":
        printBtnInner.setHide(true);
        pdfWaitSpinner.setHide(false);
        break;
      case "rendered":
        printBtnInner.setHide(false);
        pdfWaitSpinner.setHide(true);
        queueElems.advanceButton.disabledState(true);

        //set to be rendered
        useItem.unrenderedChanges = false;

        //setup button
        printBtn
          .attr("href", `/rendered/${useItem.token}.pdf?c=${Date.now()}`)
          .removeClass("btn-flat")
          .addClass("btn");
        printBtnIcon.changeIcon("printer");
        printBtnText.text("View PDF");
        break;
      case "viewed":
        queueElems.advanceButton.disabledState(false);
        break;
    }
  };

  //need to set rendering state first
  updateListConfig.preCopyHandler = (newFirst, firstItem) => {
    //reset flag to given value if it's a new item
    if (! firstItem || newFirst.token !== firstItem.token ||
        newFirst.unrenderedChanges !== firstItem.unrenderedChanges) {
      //set to appropriate stage
      setFirstItemStage(
        newFirst.unrenderedChanges ? "unrendered" : "rendered", newFirst);
    }
  };

  //do initial list update
  updateList();

  //handler how mouseenter (like hover) and click of view pdf button
  printBtn
  .on("mouseenter", () => {
    //if the resolution hasn't been rendered yet
    if (firstItemPdfStage === "unrendered") {
      //move into rendering stage
      setFirstItemStage("rendering");

      //ask the server to render
      $.get(`/resolution/renderpdf/${firstItem.token}`).done(() => {
        //finished rendering, sets url
        setFirstItemStage("rendered");

        //if page amount was not known previously, update list to fetch and display
        if (! firstItem.pageAmount) {
          updateList();
        }
      }).fail(() => {
        //finished rendering
        setFirstItemStage("rendered");

        //display error and and help directives
        makeAlertMessage(
          "alert-circle-outline", "Error generating PDF", "ok",
          "The server encountered an error while trying to generate the requested" +
          " PDF file. This may happen when the resolution includes illegal characters." +
          " Please talk to the owner of this document and ask IT-Management for help if" +
          " this problem persists.", "pdf_gen_printqueue");
      });
    }
  })
  .on("click", e => {
    //when the open pdf button is clicked and opened the pdf
    //make the advance resolution button appear in color
    if (firstItemPdfStage === "rendered") {
      //move into viewed stage
      setFirstItemStage("viewed");

      //blur to remove focus and prevent strange darkening
      printBtn.blur();
    } else {
      //prevent click, nothing valid to see
      e.preventDefault();
    }
  });
});
