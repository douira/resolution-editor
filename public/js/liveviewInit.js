/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global startLiveviewWS*/

//start liveview as viewer on document load
$(document).ready(function() {
  //true because we are a viewer
  startLiveviewWS(true);
});
