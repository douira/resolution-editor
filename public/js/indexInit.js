//all countries/orgs that can be sponsors or co-sponsors
var listOfSponsors = {
  Apple: null,
  Microsoft: null,
  Google: "http://placehold.it/250x250"
};

//data used to inititalize autocompletes and their other options
var initData = {
  "#co_spon": {
    autocompleteOptions: {
      data: listOfSponsors,
      limit: 20,
      minLength: 1
    },
    secondaryPlaceholder: "Co-Sponors"
  },
  "#main_spon": {
    data: listOfSponsors,
    limit: 20,
    onAutocomplete: function(val) { /* callback */ },
    minLength: 1
  }
};

//types of initialization to do
var eventPrefix = "fieldTypes_";
var fieldTypes = [
  {
    typeSelector: "input",
    events: {
      init: function(element, data) {
        element.autocomplete(data);
      },
      reset: function(element, data) {
        element.val("");
      }
    }
  },
  {
    typeSelector: ".chips",
    events: {
      init: function(element, data) {
        element.material_chip(data);
      },
      reset: function(element, data) {
        element.empty();
        element.trigger(eventPrefix + "init", [data]);
      }
    }
  }
];

//do things when the document has finished loading
$(document).ready(function(){
  //attach event handlers to all things that match in data
  for (var selector in initData) {
    //data for this element
    var elementInitData = initData[selector];

    //get the element we should do an init with
    var element = $(selector);

    //check with the type selector until we find a match
    var typeIndex = 0;
    while (! element.is(fieldTypes[typeIndex].typeSelector)) {
      typeIndex ++;
    }

    //if there actually was a match then attach all the events for this type
    if (typeIndex < fieldTypes.length) {
      var typeEvents = fieldTypes[typeIndex].events;
      for (var eventName in typeEvents) {
        console.log(eventName, typeIndex);
        //pass function that has the element and data in it's closure
        element.bind(eventPrefix + eventName, function() {
          console.log("fired", eventName);
          typeEvents[eventName](element, elementInitData);
        });
      }
    }
  }

  //trigger all init events
  $("#editor-main")
    .find("*")
    .trigger(eventPrefix + "init");

  //register reset buttons
  $(".reset-button").click(function(event) {
    //trigger reset for all contained elements
    $("#" + event.currentTarget.getAttribute("for"))
      .find("*")
      .trigger(eventPrefix + "reset");
  });
});
