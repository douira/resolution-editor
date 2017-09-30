/*jshint esversion: 5, browser: true, jquery: true */
//deals with UI for input of token and access codes

//array of booleans that keep track of field validation states
var validationStates = [false, false];

//true if all fields are valid
var allOk = false;

//updates the button state after checking the validation state of both fields
function updateButtonState() {
  //check all validation states
  allOk = validationStates.every(function(s) { return s; });

  //apply to button state
  $("#submit-btn")[allOk ? "addClass" : "removeClass"]("disabled");
}

//adds or removes the invalid flag
$.fn.setInputValidState = function(isValid, id) {
  //register state
  validationStates[id] = isValid;

  //add or remove class
  this[isValid ? "removeClass" : "addClass"]("invalid")
    [isValid ? "addClass" : "removeClass"]("valid");
};

//token and code input validation
$("#resolution-input input").on("keyup", function() {
  var elem = $(this);

  //get value of current input field and remove any whitespace
  var value = elem.val().replace(/\s/g, "");
  elem.val(value);

  //check if it's the token or the code field
  var isTokenField = elem.is("#token-input");
  var fieldId = isTokenField ? 0 : 1;

  //proceed checking only if there is anything filled in
  if (value.length) {
    //must be 8 plus prefix = 9 long
    if (value.length === 9) {
      //query server for validation

    } else {
      //flag as invalid, is too short
      elem.setInputValidState(true, fieldId);
    }
  } else {
    //ok being empty if in code field, because it's optional
    if (isTokenField) {
      elem.setInputValidState(false, fieldId);
    } else {
      validationStates[fieldId] = true;

      //remove any other valid or invalid classes because the field doesn't matter
      elem.removeClass("valid invalid");
    }
  }

  //update button state with current validation state
  updateButtonState();
});
//submit button click
$("#submit-btn").on("click", function() {
  //check if still valid
  updateButtonState();

  //do click action if everything valid
  if (allOk) {
    //send combined get and post request with token and code (if there is a code)
    //use only get request if no code given

  }
});

