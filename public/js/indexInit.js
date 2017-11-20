/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
  registerAccessInputs
*/

//register an access input group
$(document).ready(function() {
  registerAccessInputs([
    {
      url: "/resolution/editor/",
      selector: "#editor-submit-btn"
    },
    {
      selector: "#liveview-submit-btn",
      url: "/resolution/liveview/"
    }], "#code-form", {
    //need to look at both fields, nothing given already
    tokenFieldSelector: "#token-input",
    codeFieldSelector: "#code-input"
  });
});
