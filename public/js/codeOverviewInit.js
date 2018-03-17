/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */

//includes polyfill from
//https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes
if (! String.prototype.includes) {
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

//gets the value of the selector (false returned if bad value or none selected)
$.fn.getSelectValue = function() {
  //must be called on select element
  var selectBox = $(this);
  if (! selectBox.is("select")) {
    return;
  }

  //internal container
  var selectBoxContainer = selectBox.find(".select-wrapper");

  //get the input element to set validation classes
  var selectBoxInput = selectBoxContainer.children("input");

  //check which li element of the select wrapper is active
  var activeOption = selectBoxContainer.find("li.active");

  //any must be active
  if (! activeOption.length) {
    //remove valdation classes
    selectBoxInput.removeClass("invalid valid");

    //none selected
    return "inactive";
  }

  //get text of that option and get id for it
  var activeId = selectBoxContainer.find("option:contains(" +
    activeOption.children("span").text() + ")").val();

  //must be one of the possible states and not the current one
  if (["none", "readonly", "noadvance", "static"].indexOf(activeId) === -1) {
    //disable button and invalidate field
    selectBoxInput.removeClass("valid").addClass("invalid");

    //bad value
    return "invalid";
  }

  //all is ok, display input field as valid
  selectBoxInput.removeClass("invalid").addClass("valid");

  //return truthy id string as gotten value
  return activeId;
};

//on document ready
$(document).ready(function() {
  //find search field element
  var searchField = $("#search-field");

  //get the main list container item
  var listContainer = $("#list-container");

  //all code items
  var codeElements = listContainer.find(".collection-item");

  //hides and shows code list items by wether or not they include the search query
  function searchUpdate() {
    //get trimmed and capitalized value from input
    var query = searchField.val();
    var newQuery = query.trim().toUpperCase();

    //reapply if changed
    if (query !== newQuery) {
      searchField.val(newQuery);
      query = newQuery;
    }

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
  }

  //on keypresses in the search field
  searchField.on("paste keyup", searchUpdate);

  //clear on clicking clear icon button
  $("#clear-icon").on("click", function() {
    //clear field
    searchField.val("");

    //trigger search update
    searchUpdate();

    //trigger label blur
    searchField.trigger("blur");
  });

  //number of selected codes
  var selectedCodeAmount = 0;

  //modify header selected coutner element
  var selectedCodesDisplayElem = $("#selected-codes-count");

  //selecton status an be toggled
  listContainer.on("click", ".collection-item:not(.immutable-code)", function() {
    var elem = $(this);

    //check if is selected
    var isSelected = elem.is(".selected-code");

    //add or remove class depending on wether or not the class is present now
    elem[isSelected ? "removeClass" : "addClass"]("selected-code");

    //increment or decrement counter
    selectedCodeAmount += isSelected ? -1 : 1;

    //update text in modify header
    selectedCodesDisplayElem.text(selectedCodeAmount);
  });

  //init select fields
  $("select").material_select();

  //change access level button
  $("#change-level-btn")
  .on("mouseover", function() {

  })
  .on("click", function() {

  });

  //revoke button
  $("#revoke-btn").on("click", function() {

  });
});
