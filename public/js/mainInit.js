/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/* exported module*/

//module.exports for usa of node like files in browser
var module = { exports: {} };

//navigation collapse
$(document).ready(function() {
  //init collapsable navbar
  $(".button-collapse").sideNav();

  //init help dropdown menu
  $(".dropdown-button").dropdown({
    constrainWidth: false,
    hover: true
  });

  //register event handlers
  $("body")
  .on("touchstart", function() {
    //register touch event and remove tooltips for touch-devices
    $(".tooltipped").tooltip("remove");
  });
});

//check for old browser and alert
if (typeof Array.prototype.map !== "function") {
  alert("You are using an severely outdated browser and we strongly encourage you to update" +
        " it immediately. Because of that, this website may not work as expected and you may face" +
        " security issues (not just with this website, but in general).");
}
