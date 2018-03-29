/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
updateList,
updateListConfig*/

//on document ready
$(document).ready(function() {
  //no pre copy handler needed

  //the url to get the data from
  updateListConfig.url = "/list/fcqueue/getitems";

  //do initial list update
  updateList();
});
