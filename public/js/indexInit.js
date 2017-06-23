/*jshint asi: false, esnext: false, browser: true, jquery: true, indent: 2*/
//all countries/orgs that can be sponsors or co-sponsors
var listOfSponsors = {
  "Placeholder Coutry": "http://placehold.it/250x250",
  "Italy": null,
  "China": null,
  "United States of America": null,
  "Germany": null
};

//all phrases possible in the two different clause types
var listOfPreambPhrases = {
  "Notices": null,
  "Approves of": null,
  "BLAHBLAHBLAH": null,
  "Calls out with joy": null
};
var listOfOpPhrases = {
  "Recommends": null,
  "Calls uppon": null,
  "other things": null
};

//data used to inititalize input fields/thingies and their other options
var initData = {
  "#co-spon": {
    autocompleteOptions: {
      data: listOfSponsors,
      limit: 20,
      minLength: 1
    },
    secondaryPlaceholder: "Co-Sponors",
    placeholder: "Co-Sponors"
  },
  "#main-spon": {
    data: listOfSponsors,
    limit: 20,
    minLength: 1
  },
  "#preamb-clauses .phrase-input": {
    data: listOfPreambPhrases,
    limit: 20,
    minLength: 1
  },
  "#op-clauses .phrase-input": {
    data: listOfOpPhrases,
    limit: 20,
    minLength: 1
  }
};

//resets sibling labels
function resetSiblingLabels(field) {
  //get the siblings of the field and reset them by removing the active class
  $(field).siblings("label").removeClass("active");
}

//gets esolution-editor specific data from given dom element
function getData(context) {
  return $(context).data("resEd");
}
var fieldTypes = {
  ".autocomplete": {
    init: function() {
      //first convert plain html element to jQuery element because the materialize functions only work on that
      console.log(getData(this));
      $(this).autocomplete(getData(this));
    },
    reset: function() {
      //reset by setting value to empty string
      $(this).val("");

      //also reset label for this field
      resetSiblingLabels(this);
    }
  },
  "input": {
    reset: function() {
      $(this).val("");
      resetSiblingLabels(this);
    }
  },
  ".chips": {
    init: function() {
      $(this).material_chip(getData(this));
    },
    reset: function() {
      $(this).empty();
      $(this).trigger("init");
    }
  }
};

//do things when the document has finished loading
$(document).ready(function() {
  //for all types of things we need to attach events to
  for (var selector in fieldTypes) {
    //get the elements this type is for
    var elements = $(selector);

    //for all init data attach the data to the element
    for (var dataSelector in initData) {
      //attach data to all elements that match
      elements
        .filter(dataSelector)
        .data("resEd", initData[dataSelector]);
    }

    //attach all event handler specified
    var typeEvents = fieldTypes[selector];
    for (var eventName in typeEvents) {
      //attach current event to all elements
      elements.on(eventName, typeEvents[eventName]);
    }
  }

  //trigger all init events
  $("#editor-main").find("*").trigger("init");

  //register reset buttons
  $(".reset-button").click(function(event) {
    //trigger reset for all contained elements
    $("#" + event.currentTarget.getAttribute("for"))
      .find("*")
      .trigger("reset");
  });
});
