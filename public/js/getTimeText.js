/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*exported getTimeText*/
/*global module*/

//returns a nice time text description, set useAgo to append suffix to all not just now times
//time has to be passed in seconds
function getTimeText(time, suffix) {
  //suffix is empty string if not given, add space
  suffix = " " + (suffix || "");

  //super short
  if (time < 30) {
    return "Just now";
  }

  //really short
  if (time < 60) {
    return "Less than a minute" + suffix;
  }

  //pretty short
  if (time < 120) {
    return "Two minutes" + suffix;
  }

  //less than 120 minutes
  time /= 60;
  if (time < 120) {
    return Math.ceil(time) + " minutes" + suffix;
  }

  //less than 48 hours
  time /= 60;
  if (time < 48) {
    return Math.round(time) + " hours" + suffix;
  }

  //really long: any amount of days
  return Math.round(time / 24) + " days" + suffix;
}

//export as module if possible
if (typeof module === "object") {
  module.exports = getTimeText;
}
