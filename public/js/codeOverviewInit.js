/*jshint browser: true, jquery: true */
/*global makeAlertMessage*/

//gets the value of the selector (false returned if bad value or none selected)
$.fn.getSelectValue = function() {
  //must be called on select element
  const selectBox = $(this);
  if (! selectBox.is("select")) {
    return;
  }

  //internal container
  const selectBoxContainer = selectBox.parent(".select-wrapper");

  //get the input element to set validation classes
  const selectBoxInput = selectBoxContainer.children("input");

  //check which li element of the select wrapper is active
  const activeOption = selectBoxContainer.children("ul").children("li.active");

  //any must be active
  if (! activeOption.length) {
    //remove valdation classes
    selectBoxInput.removeClass("invalid valid");

    //none selected
    return false;
  }

  //get text of that option and get id for it
  const activeId = selectBox.children(`option:contains(${
    activeOption.children("span").text()})`).val();

  //must be one of the possible states and not the current one
  if (! ["SC", "AP", "FC", "CH", "SG", "MA"].includes(activeId)) {
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
$(document).ready(() => {
  //find search field element
  const searchField = $("#search-field");

  //get the main list container item
  const listContainer = $("#list-container");

  //all code items
  const codeElements = listContainer.find(".code-text-content");

  //hides and shows code list items by whether or not they include the search query
  const searchUpdate = () => {
    //get trimmed and capitalized value from input
    let query = searchField.val();
    const newQuery = query.trim();

    //reapply if changed
    if (query !== newQuery) {
      searchField.val(newQuery);
      query = newQuery;
    }

    //compare in upper case
    query = query.toUpperCase();

    //if there is anything in the search box
    if (query.length) {
      //show/hide all that (don't) match the string
      codeElements.each(function() {
        //check if it contains the search string
        const e = $(this);
        e[e.text().toUpperCase().includes(query) ? "removeClass" : "addClass"]("hide-this");
      });
    } else {
      //show all again
      codeElements.removeClass("hide-this");
    }
  };

  //on keypresses in the search field
  searchField.on("paste keyup", searchUpdate);

  //clear on clicking clear icon button
  $("#clear-icon").on("click", () => {
    //clear field
    searchField.val("");

    //trigger search update
    searchUpdate();

    //trigger label blur
    searchField.trigger("blur");
  });

  //number of selected codes
  let selectedCodeAmount = 0;

  //modify header selected coutner element
  const selectedCodesDisplayElem = $("#selected-codes-count");

  //selecton status an be toggled
  listContainer.on("click", ".collection-item:not(.immutable-code)", function() {
    const elem = $(this);

    //check if is selected
    const isSelected = elem.is(".selected-code");

    //add or remove class depending on whether or not the class is present now
    elem[isSelected ? "removeClass" : "addClass"]("selected-code");

    //increment or decrement counter
    selectedCodeAmount += isSelected ? -1 : 1;

    //update text in modify header
    selectedCodesDisplayElem.text(`${
      selectedCodeAmount} code${(selectedCodeAmount === 1 ? "" : "s")}`); //proper plural s
  });

  //returns list of all currently selected codes
  const getSelectedCodes = () => {
    //the selected codes, plain strings
    const selectedCodes = [];

    //get all selected code spans
    $("#list-container .selected-code span").each(function() {
      //add text content as code to list
      selectedCodes.push($(this).text());
    });

    //return generated list
    return selectedCodes;
  };

  //init select fields
  $("select").material_select();

  //the level selector for changing the level of the selected codes
  const changeLevelSelector = $("#change-level-select");

  //the button to apply the level change on the selected codes
  const changeLevelButton = $("#change-level-btn");

  //updates the disabled state of the change level button
  const updateChangeLevelButton = () => {
    //get select value from select structure
    const selectValue = changeLevelSelector.getSelectValue();

    //update button with selection state
    changeLevelButton[
      selectValue ? "removeClass" : "addClass"]("disabled");

    //return value for further use
    return selectValue;
  };

  //change access level button
  changeLevelButton
  //update button appearance
  .on("mouseover", updateChangeLevelButton)
  .on("click", () => {
    //only if any codes were selected
    if (selectedCodeAmount) {
      //update button state and get select value
      const selectValue = updateChangeLevelButton();

      //stop on invalid value
      if (! selectValue) {
        return;
      }

      //send request to server to change access level for selected clauses
      $.post("/list/codes/change", { codes: getSelectedCodes(), level: selectValue })
      .done(() => location.reload()) //reload page to show changes
      .fail(() =>
        //display error message
        makeAlertMessage("error", "Error revoking codes", "OK",
          "The server reported an error for the request to change the access level of" +
          " the selected codes. Please get into contact with IT-Managagement.",
          "change_level_codes_fail")
      );
    }
  });

  //on change of selection value, update button disabled state
  changeLevelSelector.on("change", updateChangeLevelButton);

  //revoke button
  $("#revoke-btn").on("click", () => {
    //only if any codes were selected
    if (selectedCodeAmount) {
      //send list of codes to server endpoint
      $.post("/list/codes/revoke", { codes: getSelectedCodes() })
      .done(() => location.reload()) //reload page to show changes
      .fail(() =>
        //display error message
        makeAlertMessage("error", "Error changing codes", "OK",
          "The server reported an error for the request to revoke the selected codes." +
          " Please get into contact with IT-Managagement.", "revoke_codes_fail")
      );
    }
  });

  //button for creating new codes
  const genCodesButton = $("#gen-codes-btn");

  //level selector for code generation
  const genCodesLevelSelector = $("#gen-code-level-select");

  //textarea for list of names
  const genCodesNameField = $("#code-name-field");

  //alternative to the above, specify how many codes should be generated
  const genCodesNumberField = $("#new-code-amount");

  //on click of gen codes button
  genCodesButton.on("click", () => {
    //get select value of level selector
    const selectValue = genCodesLevelSelector.getSelectValue();

    //require a valid select value
    if (! selectValue) {
      return;
    }

    //get value of names field
    let codeNames = genCodesNameField.val().trim();

    //if there are any names, split on delimiter
    codeNames = codeNames.length && codeNames.split(/[,\n]+/g);

    //get number from number field
    let codeAmount = parseInt(genCodesNumberField.val(), 10);

    //settings for the server for generating the new codes
    const genCodeSettings = {
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
    .done(() => location.reload()) //reload page to show changes
    .fail(() =>
      //display error message
      makeAlertMessage("error", "Error generating codes", "OK",
        "The server reported an error for the request to generate new codes." +
        " Please get into contact with IT-Managagement.", "gen_codes_fail")
    );
  });
});
