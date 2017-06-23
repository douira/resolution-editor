/*jshint asi: false, esnext: false, browser: true, jquery: true, indent: 2*/
//transforms arrays containign a certain flag in an object and array json structure
function transformMarkedArrays(structure, flag, propValue, depth) {
  //propValue is null if not given otherwise
  if (typeof propValue === "undefined") {
    propValue = null;
  }

  //start at depth if not given
  if (typeof depth === "undefined") {
    depth = 0;
  }

  //don't recurse if at max depth and is actually an array or object
  if (depth < 10 && typeof structure === "object") {
    //is an array
    if (structure instanceof Array) {
      //if it actuallly has anything to deal with
      if (structure.length) {
        //check if this array should be converted
        if (structure[0] === flag) {
          //remove flag
          structure.shift();

          //convert to prop object
          var obj = {};
          structure.forEach(function(str) {
            obj[str] = propValue;
          });
          structure = obj;
        } else {
          //recurse deeper
          structure.map(function(obj, index) {
            return transformMarkedArrays(obj, flag, propValue, depth + 1);
          });
        }
      }
    } else {
      //call for all properties
      for (var propName in structure) {
        structure[propName] = transformMarkedArrays(structure[propName],
                                                    flag, propValue, depth + 1);
      }
    }
  }

  //return object back
  return structure;
}

//resets sibling labels
function resetSiblingLabels(field) {
  //get the siblings of the field and reset them by removing the active class
  $(field).siblings("label").removeClass("active");
}

//gets esolution-editor specific data from given dom element
function getData(context) {
  return $(context).data("resEd");
}

//registers event handler and init data
function registerEventsAndData(fieldTypes, initData) {
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
}

//global autofill settings
var autofillSettings = {
  limit: 20,
  minLength: 1
};

//makes a autofill settings object
function makeAutofillSettingsPre(defaultSettings, data, settings) {
  //use default settings if no extra settings given
  if (typeof settings === "undefined") {
    settings = defaultSettings;
  }

  //merge settings and data prop object
  return $.extend({
    data: data
  }, settings);
}

//flag for keepng track of wether or not the editor can be used
var canUseEditor = false; //false until data loaded

//attach the default settings
var makeAutofillSettings = makeAutofillSettingsPre.bind({}, autofillSettings);

//do things when the document has finished loading
$(document).ready(function() {
  //load external sponsor, phrase and forum name data
  var autofillData;
  $.getJSON("/autofillData.json")
  .fail(function(data, status, error) {
    //log the error we have with getting the data
    console.log(status, error);
    window.alert("Failed to get auto-complete data! Check the console for more info." +
                 "(The editor won't work until you reload the page and the data is downloaded)");
  })
  .done(function(data) {
    //transform into correct data structure when gotten data
    autofillData = transformMarkedArrays(data,
                                          "_convert",
                                          null);
    console.log(autofillData);
    //call with to register events and init data
    registerEventsAndData(
      //types of fields to attach events and data to
      {
        ".autocomplete": {
          init: function() {
            //first convert plain html element to jQuery element because the materialize functions
            //only work on that
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
      },

      //data used to inititalize input fields/thingies and their other options
      {
        "#forum-name": makeAutofillSettings(autofillData.forums),
        "#co-spon": {
          autocompleteOptions: makeAutofillSettings(autofillData.sponsors),
          secondaryPlaceholder: "Co-Sponors",
          placeholder: "Co-Sponors"
        },
        "#main-spon": makeAutofillSettings(autofillData.sponsors),
        "#preamb-clauses .phrase-input": makeAutofillSettings(autofillData.phrases.preamb),
        "#op-clauses .phrase-input": makeAutofillSettings(autofillData.phrases.op),
      }
    );

    //trigger all init events
    $("#editor-main").find("*").trigger("init");

    //register reset buttons
    $(".reset-button").click(function(event) {
      //trigger reset for all contained elements
      $("#" + event.currentTarget.getAttribute("for"))
        .find("*")
        .trigger("reset");
    });

    //set flag on completion of setup
    canUseEditor = true;
  });
});
