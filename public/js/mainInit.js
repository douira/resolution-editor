/*jshint esversion: 5, browser: true, jquery: true */

//module.exports for usa of node like files in browser
var module = { exports: {} };

//navigation collapse
$(document).ready(function() {
  //init collapsable navbar
  $(".button-collapse").sideNav();
});
