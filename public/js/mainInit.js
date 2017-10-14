/*jshint esversion: 5, browser: true, jquery: true */

//module.exports for usa of node like files in browser
var module = { exports: {} };

//navigation collapse
$(document).ready(function() {
  //init collapsable navbar
  $(".button-collapse").sideNav();
});

//check for old browser and alert
if (typeof Array.prototype.map !== "function") {
  alert("You are using an severely outdated browser and we strongly encourage you to update" +
        "it immediately. Because of that, his website may not work as expected and you may face" +
        "security issues.");
}
