/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
makeAlertMessage,
displayToast*/

//preset code
var presetCode;

//true when the check now link is alowed to work, prevents click spamming
var allowCheckNow = true;

//the template dom element for the list
var templateItem;

//the last time the server was asked for an update
var lastUpdateTime = Date.now();

//how often the data is fetched, 30 seconds by default
var updateIntervalTime = 30000;

//current state of the buttons for the first item
//can be: unrendered, rendering, rendered, viewed (in that order)
var firstItemPdfStage;

//the current first item
var firstItem;

//updates the buttons and spinner acording to the view stage
function setFirstItemStage(newStage) {
  //set to new stage if given
  if (typeof newStage === "string") {
    firstItemPdfStage = newStage;
  }

  //switch to stage
  switch(firstItemPdfStage) {
    case "unrendered":
      $("#print-btn-text").text("Hover to Generate PDF");
      $("#print-btn i").text("refresh");
      $("#print-btn")
        .attr("href", "#")
        .removeClass("btn")
        .addClass("btn-flat");
      $("#advance-btn").addClass("disabled");
      break;
    case "rendering":
      $("#print-btn-inner").addClass("hide-this");
      $("#pdf-wait-spinner").removeClass("hide-this");
      break;
    case "rendered":
      $("#print-btn-inner").removeClass("hide-this");
      $("#pdf-wait-spinner").addClass("hide-this");
      $("#advance-btn").addClass("disabled");

      //set to be rendered
      firstItem.unrenderedChanges = false;

      //setup button
      $("#print-btn")
        .attr("href", "/rendered/" + firstItem.token + ".pdf")
        .removeClass("btn-flat")
        .addClass("btn")
        .find("i").text("print");
      $("#print-btn-text").text("View PDF");
      break;
    case "viewed":
      $("#advance-btn").removeClass("disabled");
      break;
  }
}

//returns a nice time text description
function getTimeText(time) {
  //super short
  if (time < 30) {
    return "Just now";
  }

  //really short
  if (time < 60) {
    return "Less than a minute";
  }

  //pretty short
  if (time < 120) {
    return "Two minutes";
  }

  //less than 120 minutes
  time /= 60;
  if (time < 120) {
    return Math.round(time) + " minutes";
  }

  //less than 48 hours
  time /= 60;
  if (time < 48) {
    return Math.round(time) + " hours";
  }

  //really long: any amount of days
  return Math.round(time / 24) + " days";
}

//sets the basic attributes of a list item with a given data object
function setBasicAttribs(data, elem) {
  //set content in subelements
  elem.find(".item-token").text(data.token).attr("href", "/resolution/editor/" + data.token);
  elem.find(".item-year").text(data.idYear);
  elem.find(".item-id").text(data.resolutionId);

  //set forum and main sponsor
  var address = data.content.resolution.address;
  elem.find(".item-forum").text(address.forum);
  elem.find(".item-sponsor").text(address.sponsor.main);

  //set age, get delta time in seconds and convert to time text
  elem.find(".item-age").text(getTimeText((Date.now() - data.waitTime) / 1000));
}

//updates the list of resolutions
function updateList() {
  //get queue elements
  var list = $("#queue");
  var errorMsg = $("#error-msg");
  var noItems = $("#no-items-msg");

  //get new list from server
  $.post("/queue/print/getitems", { code: presetCode }).done(function(data) {
    //hide error message, we got some data
    errorMsg.hide();

    //if there are any items to display
    //list is interpreted as last items being oldest -> top of list -> to be worked on first
    if (typeof data === "object" && data instanceof Array && data.length) {
      //show list and hide message for no items
      list.show();
      noItems.hide();

      //get the next first item from the list
      var newFirst = data.pop();

      //reset flag to given value if it's a new item
      if (! firstItem || newFirst.token !== firstItem.token ||
          newFirst.unrenderedChanges !== firstItem.unrenderedChanges) {
        //set to appropriate stage
        firstItem = newFirst;
        setFirstItemStage(newFirst.unrenderedChanges ? "unrendered" : "rendered");
      }

      //copy over first item
      firstItem = newFirst;

      //set display of first item in special first item box
      var firstElem = $("#first-item");

      //set basic attribs for first element
      setBasicAttribs(firstItem, firstElem);

      //set print amount of pages per document, question mark if not given
      $("#item-print-length").text(firstItem.pageAmount || "?");

      //remove all list items that exceed the amount of items in the list
      list.children(".list-item").slice(data.length).remove();

      //given that there are items left
      if (data.length) {
        //set data in the left over elements
        list.children(".list-item").each(function() {
          //set attributes of this item
          setBasicAttribs(data.pop(), $(this));
        });

        //for any remainin data items, add new items
        data.reverse().forEach(function(item) {
          //make a clone of the template, add it to the list and add data to it
          setBasicAttribs(item, templateItem.clone().appendTo(list));
        });
      }
    } else {
      //hide list (makes an ugly line otherwise) and show no items message
      list.hide();
      noItems.show();
    }
  }).fail(function() {
    //hide other things
    noItems.hide();
    list.hide();

    //show error message, request went wrong
    errorMsg.show();
  });

  //reset timer
  lastUpdateTime = Date.now();
}

//does a list update if the last one was more than 30 seconds ago
function updateTimer() {
  //get time since last update
  var timeDiff = Date.now() - lastUpdateTime;

  //was long enough ago
  if (timeDiff > updateIntervalTime) {
    //update now, will reset timer
    updateList();

    //set to start again in 30 seconds
    setTimeout(updateTimer, updateIntervalTime);
  } else {
    //try again in how much time is left until 30 seconds is reached
    setTimeout(updateTimer, updateIntervalTime - timeDiff);
  }
}

//on document ready
$(document).ready(function() {
  //get code from document
  presetCode = $("#code-preset").text();

  //detach the template element from the list
  templateItem = $("#item-template").detach().removeClass("hide-this");

  //do initial list update
  updateList();

  //register handler on link to update the list
  var checkNow = $("#update-data-now");
  checkNow.on("click", function() {
    //only if allowed right now
    if (allowCheckNow) {
      //update list now
      updateList();

      //grey out text and disable flag
      checkNow.addClass("grey-text");
      allowCheckNow = false;

      //and re-enable in a few seconds
      setTimeout(function() {
        //set flag back and enable text again
        allowCheckNow = true;
        checkNow.removeClass("grey-text");
      }, 3000);
    }
  });

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
          " this problem persists.", "pdf_gen");
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

  //on click of advance button
  $("#advance-btn")
  .on("click", function(e) {
    //prevent default following of link (doesn't have a proper href anyways)
    e.preventDefault();

    //send an advance request to the server
    $.post("/resolution/advance/" + firstItem.token + "?noui=1", {
      //include code for auth
      code: presetCode
    }).done(function() {
      //make a toast to notify
      displayToast("Advanced Resolution");

      //update list to make new top item
      updateList();
    }).fail(function() {
      //display error message
      makeAlertMessage(
        "error_outline", "Error Advancing Resolution", "ok",
        "The server encountered an error while trying to advance this resolution." +
        " If the error persists after reloading the page, ask IT-Management for help.",
        "pdf_gen");
    });
  });

  //start first, will queue itself to run updateList in 30 seconds
  updateTimer();
});
