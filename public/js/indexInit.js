/*jshint browser: true, jquery: true */
/*global
  registerAccessInputs
*/

//register an access input group
$(document).ready(() =>
  registerAccessInputs([
    {
      url: "/resolution/editor/",
      selector: "#editor-submit-btn"
    },
    {
      url: "/resolution/liveview/",
      selector: "#liveview-submit-btn"
    }], "#code-form", {
    //need to look at both fields, nothing given already
    tokenFieldSelector: "#token-input",
    codeFieldSelector: "#code-input"
  })
);
