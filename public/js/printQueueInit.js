/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */

//preset code
var presetCode;

//true when the check now link is alowed to work, precents click spamming
var allowCheckNow = true;

//removes the topmost element from the list and updates the list
function removeTopItem() {
  //remove top item
  $("#queue li").first().remove();

  //update list to make new top item
  updateList();
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
    if (typeof data === "object" && data instanceof Array && data.length) {
      //show list and hide message for no items
      list.show();
      noItems.hide();

      //list is interpreted as last items being oldest -> top of list -> to be worked on first
      //get first item
      var first = data.pop();

      //set to display in
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
}

//on document ready
$(document).ready(function() {
  //get code from document
  presetCode = $("#code-preset").text();

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
});
