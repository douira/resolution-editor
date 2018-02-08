/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
  registerAccessInputs
*/
//on document ready
$(document).ready(function() {
  //register an access input group for the code input
  registerAccessInputs({
      //continue to /session/open and preserve get query
      url: "/session/open" + document.location.search,
      selector: "#login-btn"
    }, "#code-form", {

    //only look at the code field, preset token is empty but present
    presetToken: "",
    codeFieldSelector: "#code-input"
  });
});
