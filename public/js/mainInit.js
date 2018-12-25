//check for old browser and alert
if (typeof Array.prototype.find !== "function") {
  //eslint-disable-next-line no-alert
  alert(
    "You are using an outdated browser and we strongly encourage you to update" +
    " it immediately. Because of that, this website may not work as expected" +
    " or not at all and you may face security issues (not just with this website," +
    " but in general).");
}

//sets the state of a class (adding or removing)
$.fn.classState = function(state, className) {
  //add or remove class depending on flag value and return for chaining
  return this[state ? "addClass" : "removeClass"](className);
};

//hides and unhides by adding or removing hide-this
$.fn.setHide = function(makeHidden) {
  //modify class status
  return this.classState(makeHidden, "hide-this");
};

//sets the disabled state for element by adding or removing the .disabled class
$.fn.disabledState = function(makeDisabled) {
  //set class state for .disabled
  return this.classState(makeDisabled, "disabled");
};

//sets the invalid state
$.fn.validationState = function(state) {
  //for given state, removes both if not boolean
  return this.classState(state, "valid").classState(state === false, "invalid");
};

//triggers several events in order
$.fn.triggerAll = function(eventNames, params) {
  //trigger all events with params
  eventNames.split(/[ ,]+/).forEach(event => this.trigger(event, params));

  //return this for chaining
  return this;
};

//changes the icon a icon element is displaying
$.fn.changeIcon = function(newIconName) {
  //remove any previous icon name
  this.removeClass((i, str) => str
    .split(" ")
    .filter(c => c.startsWith("mdi-"))
    .join(" "))

  //add new icon class
  .addClass(`mdi-${newIconName}`);
};

//navigation collapse
$(document).ready(() => {
  //init sidenav
  $(".sidenav").sidenav();

  //init help dropdown menu
  $(".dropdown-button").dropdown({
    constrainWidth: false,
    hover: true
  });
});
