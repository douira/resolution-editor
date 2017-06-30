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

//creates an alert message
function makeAlertMessage(type, message) {

}

//detects and warns about an extension manipulating the content and events on our page
function detectManipulator(elements) {
  //stop if no elements given
  if (! elements.length) {
    return;
  }

  //detect grammarly
  if (elements.filter("grammarly-ghost").length) {
    //make disabling alert
    makeAlertMessage("alert", "Please disable Grammarly spellchecking on this website because it may break the website visually, its internal workings or even obstruct its usage. It's advised that you save your progrsss before reloading the page after having disabled Grammarly or ay other Browser extention that manipulates website content. Grammarly integration may become a feature some time in the future."); // jshint ignore:line
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
    autofillData = transformMarkedArrays(data, "_convert", null);

    //call with to register events and init data
    //all reset events and some others must use stopPropagation!
    registerEventsAndData(
      //types of fields to attach events and data to
      {
        ".autocomplete": {
          init: function() {
            //first convert plain html element to jQuery element because the materialize functions
            //only work on that
            $(this).autocomplete(getData(this));
          }
        },
        "input": {
          reset: function(e) {
            e.stopPropagation();
            $(this).val("");
            resetSiblingLabels(this);
          }
        },
        "textarea": {
          click: function() {
            var triggerOn = $(this);

            //set on timeout to trigger after extension has finished doing things
            window.setTimeout(function() {
              triggerOn.trigger("removeForeign");
            }, 200);
          },
          reset: function(e) {
            e.stopPropagation();
            var elem = $(this);
            elem.val(""); //empty content
            elem.removeAttr("style"); //restore size
            resetSiblingLabels(this);
          },
          removeForeign: function() {
            //removes other things than what we put there, like grammarly stuff
            //this may be removed at some point when we get the cloning to work properly
            var otherElements = $(this).siblings().not("label, textarea");

            //if any found, detect and remove
            detectManipulator(otherElements);
            //otherElements.remove();

            //cleanup textarea element
            $(this).removeAttr("data-gramm");
          }
        },
        ".chips": {
          init: function() {
            $(this).material_chip(getData(this));
          },
          reset: function(e) {
            e.stopPropagation();
            $(this).val("");
            $(this).trigger("init");
          }
        },
        ".clause": {
          //resets this clause after cloning
          reset: function(e) {
            e.stopPropagation();
            $(this).find("textarea, input").trigger("reset");
          },
          updateId: function() {
            //set the displayed id of the clause
            $(this)
              .find("span.clause-number")
              .text($(this)
                .siblings(".clause")
                .length + 1
              );
          }
        },
        ".add-clause-btn": {
          click: function() {
            //add a new clause to the enclosing list by
            //duplicating and resetting the first one of the current type
            $(this).siblings(".clause")
              .first()
              .clone(true, true)
              //.empty()
              .trigger("reset")
              .insertBefore($(this).siblings(".divider").last())
              .trigger("updateId");
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
