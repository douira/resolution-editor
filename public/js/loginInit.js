/*global registerAccessInputs*/

//on document ready
$(document).ready(() =>
  //register an access input group for the code input
  registerAccessInputs({
      //continue to /session/open and preserve get query
      url: "/session/open" + document.location.search,
      selector: "#login-btn"
    }, "#code-form", {

    //only look at the code field, preset token is empty but present
    codeFieldSelector: "#code-input"
  })
);
