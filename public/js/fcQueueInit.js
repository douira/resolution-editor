/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
updateList,
updateListConfig,
advanceButton,
firstItem*/

//the link element to the editor page of the first item
var tokenLinkElem;

//wether the current first item has been viewed, enabled advance button
var firstItemViewed;

//updates the buttons and spinner acording to the view stage
function setFirstItemViewed(wasViewed, useItem) {
  //use given item is present
  useItem = useItem || firstItem;

  //set to new stage
  firstItemViewed = wasViewed;

  //set button state with stage
  advanceButton[firstItemViewed ? "removeClass" : "addClass"]("disabled");
}

//on document ready
$(document).ready(function() {
  //get link eleme from dom
  tokenLinkElem = $("#first-item .item-token");

  //reset state to unrendered
  updateListConfig.preCopyHandler = function(newFirst, firstItem) {
    //reset flag to given value if it's a new item
    if (! firstItem || newFirst.token !== firstItem.token) {
      //reset to not viewed
      setFirstItemViewed(false, newFirst);
    }
  };

  //the url to get the data from
  updateListConfig.url = "/list/fcqueue/getitems";

  //do initial list update
  updateList();

  //on click of link set, set to viewed
  tokenLinkElem.on("click", function() {
    //set new state
    setFirstItemViewed(true);
  });
});
