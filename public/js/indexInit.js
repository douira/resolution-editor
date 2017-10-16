/*jshint esversion: 5, browser: true, jquery: true */
/*global
  registerAccessInputs
*/

//register an access input group
registerAccessInputs("/resolution/editor/", "#submit-btn", "#code-form", {
  //need to look at both fields, nothing given already
  tokenFieldSelector: "#token-input",
  codeFieldSelector: "#code-input"
});
