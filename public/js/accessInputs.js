/*exported registerAccessInputs*/

//deals with UI for input of token and access codes
//handles code and token input and registers the event handlers for the given fields
/*pass function to check for other validation things as additionalValidation in inputOpts
  return true when either validation is ok or nothing to validate
  return false if the user should be hindered from using the access button
  thefirst argument passed is a function that
    adds/removes invalid and valid classes for input fields
  set an empty string as the presetToken if no token needs to be passed
  the action field of the form is automatically set and doesn't need to have a specific value
*/
const registerAccessInputs = (submitOptions, formSelector, inputOpts) => {
  //get form element
  const form = $(formSelector);

  //make array if not already
  if (! (submitOptions instanceof Array)) {
    submitOptions = [submitOptions];
  }

  //get elements for submit selectors and for each get element from selector
  submitOptions.forEach(opt => opt.element = $(opt.selector));

  //make submitSelector that selects all submit elements and find the elements
  const submitElem = $(submitOptions.map(opt => opt.selector).join(","));

  //states of the two fields
  const fields = {
    token: {
      valid: true, //field validation states
      checkedValues: [] //array of already queried values
    },
    code: {
      valid: true,
      checkedValues: []
    }
  };

  //check for selector of token input or token will be used as-is
  let presetToken;
  if (inputOpts.tokenFieldSelector) {
    //get field element
    fields.token.elem = $(inputOpts.tokenFieldSelector);

    //not valid by default
    fields.token.valid = false;

    //throw on missing
    if (! fields.token.elem[0]) {
      throw Error(`Token field element ${inputOpts.tokenFieldSelector} not found`);
    }
  } else if ("presetToken" in inputOpts) {
    //get token
    presetToken = inputOpts.presetToken;

    //expect valid token and signify that in validation states
    fields.token.valid = true;
  }

  //there must be either a selector or a preset for both the token and the code
  //check for selector of code input field or given code for which a hidden field will be created
  if (inputOpts.codeFieldSelector) {
    //get selector from ops and find element
    fields.code.elem = $(inputOpts.codeFieldSelector);

    //not valid by default
    fields.code.valid = false;

    //throw on missing
    if (! fields.code.elem[0]) {
      throw Error(`Code field element ${inputOpts.codeFieldSelector} not found`);
    }
  } else if ("presetCode" in inputOpts) {
    //make hidden field above submit button, code is expected to be valid
    submitElem.before(
      `<input type='hidden' class='hidden-code-input not-editor' name='code' value='${
      inputOpts.presetCode}'>`);

    //is given and ok
    fields.code.valid = "onlyToken";
  }

  //both field elements
  const fieldElems = (fields.code.elem || $()).add(fields.token.elem || $());

  //true if all fields are valid
  let allOk = false;

  //adds or removes the invalid flag
  const setInputValidState = (element, isValid, id) => {
    //register state
    if (id) {
      fields[id].valid = isValid;
    }

    //is set to token only state
    if (isValid === "onlyToken") {
      //remove any other valid or invalid classes because the field doesn't matter
      element.removeClass("valid invalid");
      return;
    }

    //add or remove class
    element[isValid ? "removeClass" : "addClass"]("invalid")[
      isValid ? "addClass" : "removeClass"]("valid");
  };

  //updates the button state after checking the validation state of both fields
  const updateButtonState = () => {
    //check all validation states
    allOk = fields.token.valid && fields.code.valid &&

      //check with additional validation callback if given
      (typeof inputOpts.additionalValidation === "function" ?
       inputOpts.additionalValidation(setInputValidState) : true);

    //apply to button state
    submitElem[allOk ? "removeClass" : "addClass"]("disabled");
  };

  //check button state also when change happens on additional inputs
  if (typeof inputOpts.additionalInputsSelectors === "string") {
    $(inputOpts.additionalInputsSelectors).on("keyup paste", updateButtonState);
  }

  //handles a submit even (pressig a submit button or pressing enter in one of the input fields)
  function handleSubmitEvent(e) {
    //check if still valid
    updateButtonState();

    //do click action if everything valid
    if (allOk) {
      const elem = $(this);

      //to make url path, find opt with that selector and return its specified url
      const buttonUrl = submitOptions.find(opt => elem.is(opt.selector)).url +
        (typeof presetToken === "undefined" ?
          fields.token.elem ? fields.token.elem.val() : "" : presetToken);

      //send combined get and post request with token and code (if there is a code)
      //use only get request if no code given
      if (fields.code.valid === "onlyToken") { //only token
        //if a click event given
        if (e.type === "click") {
          //change href and allow link click follow
          submitElem.attr("href", buttonUrl);
        } else {
          //change location to url
          window.location.href = buttonUrl;

          //and don't do whatever this event does as an action
          e.preventDefault();
        }
      } else { //token and code
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
  }

  //token and code input validation
  function onFieldActivity(e) {
    //called on collection
    let elem;
    if (this.length) {
      //if called on more than one element
      if (this.length > 1) {
        //call seperately on all other elements
        for (let i = 0; i < this.length - 2; i ++) {
          //call with current element and same event data
          onFieldActivity.call(this[i], e);
        }

        //take last from collection
        elem = this.eq(this.length - 1);
      } else {
        //simply the same (called on collection of one element)
        elem = this;
      }
    } else {
      //single dom element
      elem = $(this);
    }

    //get value of current input field and remove any whitespace, make capitalized
    let value = elem.val().replace(/\s/g, "").toUpperCase();
    elem.val(value);

    //check if it's the token or the code field
    const isTokenField = fields.token.elem ?
      elem.is(fields.token.elem) : ! elem.is(fields.code.elem);
    const fieldId = isTokenField ? "token" : "code";

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
        const checkedValues = fields[fieldId].checkedValues;

        //check if we've already checked this value
        if (checkedValues.hasOwnProperty(value)) {
          //if it's null, then we're in the process of asking the server
          if (checkedValues[value] === null) {
            //just wait
            return;
          }

          //apply state with previously gotten validation answer
          setInputValidState(elem, checkedValues[value], fieldId);
        } else { //ask server
          //make non displaying but invalid because we're waiting for a response
          elem.removeClass("valid invalid");
          fields[fieldId].valid = false;

          //register as present but unknown so we don't ask the server twice
          checkedValues[value] = null;

          //console.log("checked", fieldId, value, e.type);
          //query server for validation
          $.get("/resolution/checkinput/" + value, responseData => {
            //set to ok or not
            const valid = responseData.substring(0, 2) === "ok";
            setInputValidState(elem, valid, fieldId);

            //set in check register
            checkedValues[value] = valid;
          })
          .fail(() => {
            //not ok
            setInputValidState(elem, false, fieldId);

            //set in check register
            checkedValues[value] = false;
          })
          //update again, (we're in a future callback)
          .always(updateButtonState);
        }
      } else {
        //flag as invalid, is too short
        setInputValidState(elem, false, fieldId);
      }
    } else if (isTokenField) {
      //ok being empty if in code field, because it's optional
      setInputValidState(fields.token.elem, false, "token");
    } else if (fields.token.elem) {
      setInputValidState(fields.code.elem, "onlyToken", "code");
    } else {
      //is code field alone
      setInputValidState(fields.code.elem, false, "code");
    }

    //update button state with current validation state
    updateButtonState();

    //if the key was an enter key press
    if (e && e.keyCode === 13) {
      //call submit event (by default the first one, in index it's to the editor)
      handleSubmitEvent.call(submitElem[0], e);
    }
  }

  //attach activity handler
  fieldElems.on("keyup paste click", onFieldActivity);

  //on keydown event for enter press in form
  fieldElems.on("keydown", e => {
    //when enter key was pressed
    if (e.keyCode === 13) {
      //handle a submit event
      handleSubmitEvent.call(submitElem[0], e);
    }
  });

  //submit button click
  submitElem.on("click", handleSubmitEvent)
    //hover over button updates it's state and calls validation again
    .on("mouseover", e => onFieldActivity.call(fieldElems, e));

  //initial check
  onFieldActivity.call(fieldElems);
};
