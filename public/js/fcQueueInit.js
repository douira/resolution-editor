/*global
updateList,
updateListConfig,
queueElems,
firstItem*/

//on document ready
$(document).ready(() => {
  //the link element to the editor page of the first item
  const tokenLinkElem = $("#first-item .item-token");

  //whether the current first item has been viewed, enabled advance button
  let firstItemViewed;

  //updates the buttons and spinner acording to the view stage
  const setFirstItemViewed = (wasViewed, useItem) => {
    //use given item is present
    useItem = useItem || firstItem;

    //set to new stage
    firstItemViewed = wasViewed;

    //set button state with stage
    queueElems.advanceButton.disabledState(!firstItemViewed);
  };

  //reset state to unrendered
  updateListConfig.preCopyHandler = (newFirst, firstItem) => {
    //reset flag to given value if it's a new item
    if (!firstItem || newFirst.token !== firstItem.token) {
      //reset to not viewed
      setFirstItemViewed(false, newFirst);
    }
  };

  //the url to get the data from
  updateListConfig.url = "/list/fcqueue/getitems";

  //do initial list update
  updateList();

  //on click of link set, set to viewed
  tokenLinkElem.on("click", () => setFirstItemViewed(true));
});
