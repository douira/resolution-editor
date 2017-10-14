/*jshint esversion: 5, browser: true, jquery: true */
//deals with UI for input of token and access codes

//array of booleans that keep track of field validation states
var validationStates = [false, 2];

//true if all fields are valid
var allOk = false;

//updates the button state after checking the validation state of both fields
function updateButtonState() {
  //check all validation states
  allOk = validationStates.every(function(s) { return s; });

  //apply to button state
  $("#submit-btn")[allOk ? "removeClass" : "addClass"]("disabled");
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
$("#resolution-input input").on("keyup checkValidation", function(e) {
  var elem = $(this);

  //get value of current input field and remove any whitespace, make capitalized
  var value = elem.val().replace(/\s/g, "").toUpperCase();
  elem.val(value);

  //check if it's the token or the code field
  var isTokenField = elem.is("#token-input");
  var fieldId = isTokenField ? 0 : 1;

  //proceed checking only if there is anything filled in
  if (value.length) {
    //must be 8 plus prefix = 9 long and first char must be @ or !
    if (value.length === 9 && (value[0] === "@" || value[0] === "!")) {
      //correct prefix to @ or ! according to field type
      value = (isTokenField ? "@" : "!") + value.substring(1);
      elem.val(value);

      //make non displaying but invalid because we're waiting for a response
      elem.removeClass("valid invalid");
      validationStates[fieldId] = false;

      //query server for validation
      $.get("/resolution/checkinput/" + value, function(responseData) {
        //set to ok or not
        elem.setInputValidState(responseData.substring(0, 2) === "ok", fieldId);
      })
      .fail(function() {
        //not ok
        elem.setInputValidState(false, fieldId);
      })
      .always(function() {
        //update again, (we're in a future callback)
        updateButtonState();
      });
    } else {
      //flag as invalid, is too short
      elem.setInputValidState(false, fieldId);
    }
  } else {
    //ok being empty if in code field, because it's optional
    if (isTokenField) {
      elem.setInputValidState(false, fieldId);
    } else {
      validationStates[fieldId] = 2; //2 means ok and empty

      //remove any other valid or invalid classes because the field doesn't matter
      elem.removeClass("valid invalid");
    }
  }

  //update button state with current validation state
  updateButtonState();
});

//submit button click
$("#submit-btn").on("click", function(e) {
  //check if still valid
  updateButtonState();

  //do click action if everything valid
  if (allOk) {
    //make url path
    var url = "/resolution/editor/" + $("#token-input").val();

    //send combined get and post request with token and code (if there is a code)
    //use only get request if no code given
    if (validationStates[1] === 2) { //only token
      //change href and allow link click follow
      $(this).attr("href", url);
    } else { //token and code
      var form = $("#code-form");

      //populate action url
      form.attr("action", url);

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
  $("#resolution-input input").trigger("checkValidation");
});

