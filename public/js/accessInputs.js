/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*exported registerAccessInputs*/
//deals with UI for input of token and access codes

//handles code and token input and registers the event handlers for the given fields
function registerAccessInputs(url, submitSelector, formSelector, inputOpts) {
  //submitSelector and formSelector must both resolve to elments
  if (! $(submitSelector).length || $(formSelector).length !== 1) {
    //wrong
    //console.log("accessInput registration error: selectors faulty"); only run when debugging
    return;
  }

  //states of the two fields
  var fieldStates = {
    token: {
      valid: false, //field validation states
      checkedValues: [] //array of already queried values
    },
    code: {
      valid: "onlyToken",
      checkedValues: []
    }
  };

  //check for selector of code input field or given code for which a hidden field will be created
  var codeFieldSelector = "";
  if (inputOpts.hasOwnProperty("codeFieldSelector")) {
    //get selector from ops
    codeFieldSelector = inputOpts.codeFieldSelector;
  } else if (inputOpts.hasOwnProperty("presetCode")) {
    //make hidden field above submit button, code is expected to be valid
    $(submitSelector).before("<input type='hidden' id='hidden-code-input' name='code' value='" +
                        inputOpts.presetCode + "'>");

    //is given and ok
    fieldStates.code.valid = "onlyToken";
  } else {
    //wrong
    console.log("accessInput registration error: missing token data");
    return;
  }

  //check for selector of token input or token will be used as-is
  var tokenFieldSelector = "";
  var presetToken;
  if (inputOpts.hasOwnProperty("tokenFieldSelector")) {
    //get field selector
    tokenFieldSelector = inputOpts.tokenFieldSelector;
  } else if (inputOpts.hasOwnProperty("presetToken")) {
    //get token
    presetToken = inputOpts.presetToken;

    //expect valid token and signify that in validation states
    fieldStates.token.valid = true;
  } else {
    //wrong
    console.log("accessInput registration error: missing code data");
    return;
  }

  //make a combined selector for the input fields,
  //only use combinator if there are two things to combine
  var fieldSelector = codeFieldSelector +
      (tokenFieldSelector.length && codeFieldSelector.length ? "," : "") +
      tokenFieldSelector;

  //true if all fields are valid
  var allOk = false;

  //updates the button state after checking the validation state of both fields
  function updateButtonState() {
    //check all validation states
    allOk = fieldStates.token.valid &&
      (fieldStates.code.valid &&
       (fieldStates.code.valid === true || typeof presetToken === "undefined"));

    //apply to button state
    $(submitSelector)[allOk ? "removeClass" : "addClass"]("disabled");
  }

  //adds or removes the invalid flag
  function setInputValidState(element, isValid, id) {
    //register state
    fieldStates[id].valid = isValid;

    //add or remove class
    element[isValid ? "removeClass" : "addClass"]("invalid")
      [isValid ? "addClass" : "removeClass"]("valid");
  }

  //token and code input validation
  $(fieldSelector).on("keyup paste checkValidation", function() {
    var elem = $(this);

    //get value of current input field and remove any whitespace, make capitalized
    var value = elem.val().replace(/\s/g, "").toUpperCase();
    elem.val(value);

    //check if it's the token or the code field
    var isTokenField = elem.is(tokenFieldSelector);
    var fieldId = isTokenField ? "token" : "code";

    //proceed checking only if there is anything filled in
    if (value.length) {
      //add @ or ! if missing one char and not already present
      if (value.length === 8 && ! (value[0] === "@" || value[0] === "!")) {
        //add prefix
        value = (isTokenField ? "@" : "!") + value;
      }

      //must be 8 plus prefix = 9 long and first char must be @ or !
      if (value.length === 9 && (value[0] === "@" || value[0] === "!")) {
        //correct prefix to @ or ! according to field type
        value = (isTokenField ? "@" : "!") + value.substring(1);
        elem.val(value);

        //get checked values for fieldId
        var checkedValues = fieldStates[fieldId].checkedValues;

        //check if we've already checked this value
        if (checkedValues.hasOwnProperty(value)) {
          //if it's null, then we're in the process of asking the server
          if (checkedValues[value] === null) {
            //just wait
            return;
          } else {
            //apply state
            setInputValidState(elem, checkedValues[value], fieldId);
          }
        } else { //ask server
          //make non displaying but invalid because we're waiting for a response
          elem.removeClass("valid invalid");
          fieldStates[fieldId].valid = false;

          //register as present but unknown so we don't ask the server twice
          checkedValues[value] = null;

          //console.log("checked", fieldId, value, e.type);
          //query server for validation
          $.get("/resolution/checkinput/" + value, function(responseData) {
            //set to ok or not
            var valid = responseData.substring(0, 2) === "ok";
            setInputValidState(elem, valid, fieldId);

            //set in check register
            checkedValues[value] = valid;
          })
          .fail(function() {
            //not ok
            setInputValidState(elem, false, fieldId);

            //set in check register
            checkedValues[value] = false;
          })
          .always(function() {
            //update again, (we're in a future callback)
            updateButtonState();
          });
        }
      } else {
        //flag as invalid, is too short
        setInputValidState(elem, false, fieldId);
      }
    } else {
      //ok being empty if in code field, because it's optional
      if (isTokenField) {
        setInputValidState(elem, false, fieldId);
      } else {
        fieldStates.code.valid = "onlyToken"; //onlyToken means ok and empty

        //remove any other valid or invalid classes because the field doesn't matter
        elem.removeClass("valid invalid");
      }
    }

    //update button state with current validation state
    updateButtonState();
  });

  //submit button click
  $(submitSelector).on("click", function(e) {
    //check if still valid
    updateButtonState();

    //do click action if everything valid
    if (allOk) {
      //make url path
      var buttonUrl = url + (typeof presetToken === "undefined" ?
          $(tokenFieldSelector).val() : presetToken);

      //send combined get and post request with token and code (if there is a code)
      //use only get request if no code given
      if (fieldStates.code.valid === "onlyToken") { //only token
        //change href and allow link click follow
        console.log(url);
        $(this).attr("href", buttonUrl);
      } else { //token and code
        var form = $(formSelector);

        //populate action url
        form.attr("action", buttonUrl);

        //submit form to send request and follow
        form.submit();

        //stop normal link following behavior
        e.preventDefault();
      }
    } else {
      //don't do anything if not ok and still pressed
      e.preventDefault();
    }
  })
  //hover over button updates it's state
  .on("mouseover", function() {
    //call validation again
    $(fieldSelector).trigger("checkValidation");
  });
}

