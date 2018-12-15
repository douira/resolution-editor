/*exported firstItem, updateList, updateListConfig, queueElems*/
/*global displayToast, makeAlertMessage, getTimeText*/

//config settings for the auto update
const autoUpdateConfig = {
  //true when the check now the link is allowed to work, prevents click spamming
  allowCheckNow: true,

  //the last time the server was asked for an update
  lastUpdateTime: Date.now(),

  //how often the data is fetched, 30 seconds by default
  updateIntervalTime: 30000
};

//to be queried jquery dom elements
let queueElems;

//the current first item
let firstItem;

//config is set by specific page code
const updateListConfig = { };

//sets the basic attributes of a list item with a given data object
const setBasicAttribs = (data, elem) => {
  //set token
  elem.find(".item-token").text(data.token).attr("href", `/resolution/editor/${data.token}`);

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
};

//sets page amount in page amount field
const setPageAmount = (selector, pageAmount, names) => {
  //get item and set page amount in label if set
  $(selector).text(
    pageAmount && pageAmount +
      //correct plural
      (names ? ` ${pageAmount === 1 ? names[0] : names[1]}` : "") || `? ${names[1]}`
  );
};

//updates the list of resolutions
const updateList = () => {
  //get new list from server
  $.get(updateListConfig.url).done(data => {
    //hide error message, we got some data
    queueElems.errorMsg.hide();

    //if there are any items to display
    //list is interpreted as last items being oldest -> top of list -> to be worked on first
    if (typeof data === "object" && data instanceof Array && data.length) {
      //show list and hide message for no items
      queueElems.list.show();
      queueElems.noItems.hide();

      //get the next first item from the list
      const newFirst = data.pop();

      //run pre copy handler if given
      if (typeof updateListConfig.preCopyHandler === "function") {
        updateListConfig.preCopyHandler(newFirst, firstItem, queueElems);
      }

      //copy over first item
      firstItem = newFirst;

      //set display of first item in special first item box
      const firstElem = $("#first-item");

      //set basic attribs for first element
      setBasicAttribs(firstItem, firstElem);

      //set print amount of pages per document, question mark if not given
      setPageAmount("#item-print-length", firstItem.pageAmount, ["page", "pages"]);

      //set item print copies
      setPageAmount("#item-print-copies", firstItem.copyAmount, ["copy", "copies"]);

      //if extended info enabled and more than one page in document
      if (updateListConfig.extPageInfo) {
        //if more than once page in document
        if (firstItem.pageAmount > 1) {
          //show display
          queueElems.totalPagesWrapper.show();

          //set total amount
          setPageAmount("#item-print-total", firstItem.copyAmount * firstItem.pageAmount);
        } else {
          //hide, not needed
          queueElems.totalPagesWrapper.hide();
        }
      }

      //remove all list items that exceed the amount of items in the list
      queueElems.list.children(".list-item").slice(data.length).remove();

      //given that there are items left
      if (data.length) {
        //set data in the left over elements
        queueElems.list.children(".list-item").each(function() {
          //set attributes of this item
          setBasicAttribs(data.pop(), $(this));
        });

        //for any remainin data items, add new items
        data.reverse().forEach(item =>
          //make a clone of the template, add it to the list and add data to it
          setBasicAttribs(item, queueElems.templateItem.clone().appendTo(queueElems.list))
        );
      }
    } else {
      //hide list (makes an ugly line otherwise) and show no items message
      queueElems.list.hide();
      queueElems.noItems.show();
    }
  }).fail(() => {
    //hide other things
    queueElems.noItems.hide();
    queueElems.list.hide();

    //show error message, request went wrong
    queueElems.errorMsg.show();
  });

  //reset timer
  autoUpdateConfig.lastUpdateTime = Date.now();
};

//does a list update if the last one was more than 30 seconds ago
const updateTimer = () => {
  //get time since last update
  const timeDiff = Date.now() - autoUpdateConfig.lastUpdateTime;

  //was long enough ago
  if (timeDiff > autoUpdateConfig.updateIntervalTime) {
    //update now, will reset timer
    updateList();

    //set to start again in 30 seconds
    setTimeout(updateTimer, autoUpdateConfig.updateIntervalTime);
  } else {
    //try again in how much time is left until 30 seconds is reached
    setTimeout(updateTimer, autoUpdateConfig.updateIntervalTime - timeDiff);
  }
};

//on document ready
$(document).ready(() => {
  //query total pages wrapper
  const totalPagesWrapper = $("#item-print-total-wrapper");

  //remove ext page info if disabled
  if (! updateListConfig.extPageInfo) {
    totalPagesWrapper.remove();
  }

  //query elements
  queueElems = {
    //detach the template element dom element for the list from the list
    templateItem: $("#item-template").detach().removeClass("hide-this").removeAttr("id"),

    //message and list elements
    list: $("#queue"),
    errorMsg: $("#error-msg"),
    noItems: $("#no-items-msg"),
    advanceButton: $("#advance-btn"),
    checkNow: $("#update-data-now"),
    totalPagesWrapper
  };

  //register handler on link to update the list
  queueElems.checkNow.on("click", () => {
    //only if allowed right now
    if (autoUpdateConfig.allowCheckNow) {
      //update list now
      updateList();

      //grey out text and disable flag
      queueElems.checkNow.addClass("grey-text");
      autoUpdateConfig.allowCheckNow = false;

      //and re-enable in a few seconds
      setTimeout(() => {
        //set flag back and enable text again
        autoUpdateConfig.allowCheckNow = true;
        queueElems.checkNow.removeClass("grey-text");
      }, 3000);
    }
  });

  //on click of advance button
  queueElems.advanceButton
  .on("click", e => {
    //prevent default following of link (doesn't have a proper href anyways)
    e.preventDefault();

    //send an advance request to the server
    $.get(`/resolution/advance/${firstItem.token}?noui=1`).done(() => {
      //make a toast to notify
      displayToast(`Advanced Resolution ${firstItem.token}`);

      //update list to make new top item
      updateList();
    }).fail(() =>
      //display error message
      makeAlertMessage(
        "error_outline", "Error Advancing Resolution", "ok",
        "The server encountered an error while trying to advance this resolution." +
        " If the error persists after reloading the page, ask IT-Management for help.",
        "pdf_gen")
    );
  });

  //start first, will queue itself to run updateList in 30 seconds
  updateTimer();
});
