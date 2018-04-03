/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global makeAlertMessage*/

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
  var selectBoxContainer = selectBox.parent(".select-wrapper");

  //get the input element to set validation classes
  var selectBoxInput = selectBoxContainer.children("input");

  //check which li element of the select wrapper is active
  var activeOption = selectBoxContainer.children("ul").children("li.active");

  //any must be active
  if (! activeOption.length) {
    //remove valdation classes
    selectBoxInput.removeClass("invalid valid");

    //none selected
    return false;
  }

  //get text of that option and get id for it
  var activeId = selectBox.children("option:contains(" +
    activeOption.children("span").text() + ")").val();

  //must be one of the possible states and not the current one
  if (["SC", "AP", "FC", "CH", "SG", "MA"].indexOf(activeId) === -1) {
    //disable button and invalidate field
    selectBoxInput.removeClass("valid").addClass("invalid");

    //bad value
    return false;
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
  var codeElements = listContainer.find(".code-text-content");

  //hides and shows code list items by wether or not they include the search query
  function searchUpdate() {
    //get trimmed and capitalized value from input
    var query = searchField.val();
    var newQuery = query.trim();

    //reapply if changed
    if (query !== newQuery) {
      searchField.val(newQuery);
      query = newQuery;
    }

    //compare both as upper case
    query = query.toUpperCase();

    //if there is anything in the search box
    if (query.length) {
      //show/hide all that (don't) match the string
      codeElements.each(function() {
        //check if it contains the search string
        var e = $(this);
        e[e.text().toUpperCase().includes(query) ? "removeClass" : "addClass"]("hide-this");
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
    selectedCodesDisplayElem.text(
      selectedCodeAmount + " code" + (selectedCodeAmount === 1 ? "" : "s")); //proper plural s
  });

  //returns list of all currently selected codes
  function getSelectedCodes() {
    //the selected codes, plain strings
    var selectedCodes = [];

    //get all selected code spans
    $("#list-container .selected-code span").each(function() {
      //add text content as code to list
      selectedCodes.push($(this).text());
    });

    //return generated list
    return selectedCodes;
  }

  //init select fields
  $("select").material_select();

  //the level selector for changing the level of the selected codes
  var changeLevelSelector = $("#change-level-select");

  //the button to apply the level change on the selected codes
  var changeLevelButton = $("#change-level-btn");

  //updates the disabled state of the change level button
  function updateChangeLevelButton() {
    //get select value from select structure
    var selectValue = changeLevelSelector.getSelectValue();

    //update button with selection state
    changeLevelButton[
      selectValue ? "removeClass" : "addClass"]("disabled");

    //return value for further use
    return selectValue;
  }

  //change access level button
  changeLevelButton
  .on("mouseover", function() {
    //update button appearance
    updateChangeLevelButton();
  })
  .on("click", function() {
    //only if any codes were selected
    if (selectedCodeAmount) {
      //update button state and get select value
      var selectValue = updateChangeLevelButton();

      //stop on invalid value
      if (! selectValue) {
        return;
      }

      //send request to server to change access level for selected clauses
      $.post("/list/codes/change", { codes: getSelectedCodes(), level: selectValue })
      .done(function() {
        //reload page to show changes
        location.reload();
      })
      .fail(function() {
        //display error message
        makeAlertMessage("error", "Error revoking codes", "OK",
          "The server reported an error for the request to change the access level of" +
          " the selected codes. Please get into contact with IT-Managagement.",
          "change_level_codes_fail");
      });
    }
  });

  //on change of selection value, update button again
  changeLevelSelector.on("change", function() {
    //update button disabled state
    updateChangeLevelButton();
  });

  //revoke button
  $("#revoke-btn").on("click", function() {
    //only if any codes were selected
    if (selectedCodeAmount) {
      //send list of codes to server endpoint
      $.post("/list/codes/revoke", { codes: getSelectedCodes() })
      .done(function() {
        //reload page to show changes
        location.reload();
      })
      .fail(function() {
        //display error message
        makeAlertMessage("error", "Error changing codes", "OK",
          "The server reported an error for the request to revoke the selected codes." +
          " Please get into contact with IT-Managagement.", "revoke_codes_fail");
      });
    }
  });

  //button for creating new codes
  var genCodesButton = $("#gen-codes-btn");

  //level selector for code generation
  var genCodesLevelSelector = $("#gen-code-level-select");

  //textarea for list of names
  var genCodesNameField = $("#code-name-field");

  //alternative to the above, specify how many codes should be generated
  var genCodesNumberField = $("#new-code-amount");

  //on click of gen codes button
  genCodesButton.on("click", function() {
    //get select value of level selector
    var selectValue = genCodesLevelSelector.getSelectValue();

    //require a valid select value
    if (! selectValue) {
      return;
    }

    //get value of names field
    var codeNames = genCodesNameField.val().trim();

    //if there are any names, split on delimiter
    codeNames = codeNames.length && codeNames.split(/[,\n]+/g);

    //get number from number field
    var codeAmount = parseInt(genCodesNumberField.val(), 10);

    //settings for the server for generating the new codes
    var genCodeSettings = {
      accessLevel: selectValue
    };

    //if there are names in the list
    if (codeNames.length) {
      //use the names as given
      genCodeSettings.names = codeNames;

      //amount is larger one of number of names and specified amount
      codeAmount = Math.max(codeAmount || 0, codeNames.length);
    }

    //require amount to be positive
    if (codeAmount > 0) {
      //use only amount
      genCodeSettings.amount = codeAmount;
    } else {
      //no code amount of names specified
      return;
    }

    //send request to server with settings
    $.post("/list/codes/new", genCodeSettings)
    .done(function() {
      //reload page to show changes
      location.reload();
    })
    .fail(function() {
      //display error message
      makeAlertMessage("error", "Error generating codes", "OK",
        "The server reported an error for the request to generate new codes." +
        " Please get into contact with IT-Managagement.", "gen_codes_fail");
    });
  });
});
