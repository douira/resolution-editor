/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */

//includes polyfill from
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes
if (!String.prototype.includes) {
  String.prototype.includes = function(search, start) { //jshint ignore:line
    'use strict';
    if (typeof start !== 'number') {
      start = 0;
    }

    if (start + search.length > this.length) {
      return false;
    } else {
      return this.indexOf(search, start) !== -1;
    }
  };
}

//on document ready
$(document).ready(function() {
  //get the main list container item
  var listContainer = $("#list-container");

  //on keypresses in the search field
  $("#search-field").on("paste keyup", function() {
    //the search field element
    var elem = $(this);

    //get trimmed and capitalized value from input
    var query = elem.val();
    var newQuery = query.trim().toUpperCase();

    //reapply if changed
    if (query !== newQuery) {
      elem.val(newQuery);
      query = newQuery;
    }

    //get all code items
    var codeElements = listContainer.find(".collection-item");

    //if there is anything in the search box
    if (query.length) {
      //show/hide all that (don't) match the string
      codeElements.each(function() {
        //check if it contains the search string
        var e = $(this);
        e[e.text().includes(query) ? "removeClass" : "addClass"]("hide-this");
      });
    } else {
      //show all again
      codeElements.removeClass("hide-this");
    }
  });
});
