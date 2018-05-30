/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*exported
firstItem,
updateList,
updateListConfig*/
/*global
displayToast,
makeAlertMessage,
getTimeText*/

//the template dom element for the list
var templateItem;

//true when the check now the link is allowed to work, prevents click spamming
var allowCheckNow = true;

//the last time the server was asked for an update
var lastUpdateTime = Date.now();

//how often the data is fetched, 30 seconds by default
var updateIntervalTime = 30000;

//the current first item
var firstItem;

//message and list elements
var list, errorMsg, noItems, advanceButton;

//config is set by specific page code
var updateListConfig = { };

//sets the basic attributes of a list item with a given data object
function setBasicAttribs(data, elem) {
  //set token
  elem.find(".item-token").text(data.token).attr("href", "/resolution/editor/" + data.token);

  //id and year only if present in data
  if (data.idYear && data.resolutionId) {
    elem.find(".item-year").text(data.idYear);
    elem.find(".item-id").text(data.resolutionId);
  }

  //set forum and main sponsor
  elem.find(".item-forum").text(data.address.forum);
  elem.find(".item-sponsor").text(data.address.sponsor.main);

  //set age, get delta time in seconds and convert to time text
  elem.find(".item-age").text(getTimeText((Date.now() - data.waitTime) / 1000));
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

//sets page amount in page amount field
function setPageAmount(selector, pageAmount) {
  //get item and set page amount in label if set
  $(selector).text(
    (pageAmount && pageAmount + (pageAmount === 1 ? " page" : " pages") //correct plural
  ) || "? pages");
}

//updates the list of resolutions
function updateList() {
  //get new list from server
  $.get(updateListConfig.url).done(function(data) {
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

      //run pre copy handler if given
      if (typeof updateListConfig.preCopyHandler === "function") {
        updateListConfig.preCopyHandler(newFirst, firstItem);
      }

      //copy over first item
      firstItem = newFirst;

      //set display of first item in special first item box
      var firstElem = $("#first-item");

      //set basic attribs for first element
      setBasicAttribs(firstItem, firstElem);

      //set print amount of pages per document, question mark if not given
      setPageAmount("#item-print-length", firstElem.pageAmount);

      //set item print copies
      setPageAmount("#item-print-copies", firstElem.copyAmount);

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

//on document ready
$(document).ready(function() {
  //detach the template element from the list
  templateItem = $("#item-template").detach().removeClass("hide-this").removeAttr("id");

  //get elements
  list = $("#queue");
  errorMsg = $("#error-msg");
  noItems = $("#no-items-msg");
  advanceButton = $("#advance-btn");

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

  //on click of advance button
  advanceButton
  .on("click", function(e) {
    //prevent default following of link (doesn't have a proper href anyways)
    e.preventDefault();

    //send an advance request to the server
    $.get("/resolution/advance/" + firstItem.token + "?noui=1").done(function() {
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
