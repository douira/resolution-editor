/*jshint asi: false, esnext: false, browser: true, jquery: true, indent: 2*/
var dataPrefix = "resEd"; //prefix for data stored in elements

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
  var gottenData = $(context).data(dataPrefix);

  //make data if none present
  if (typeof gottenData === "undefined") {
    gottenData = {};
    $(context).data(dataPrefix, gottenData);
  }
  return gottenData;
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
        .data(dataPrefix, initData[dataSelector]);
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
function makeAlertMessage(type, title, message, buttonText) {
  //default button text
  if (typeof buttonText === "undefined") {
    buttonText = "OK";
  }

  //get the modal element
  var modalElement = $("#alert-message-modal");
  console.log(modalElement);
  //add content to the modal
  modalElement.find(".modal-content-title").html(title);
  modalElement.find(".modal-content-body").html(message);
  modalElement.find(".modal-dismiss-btn").html(buttonText);

  //open the modal for the user to see
  modalElement.modal("open");
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
    makeAlertMessage("alert", "Attention!", "Please <b>disable</b> Grammarly spellchecking on this website because it may break the website visually, its internal workings or even obstruct its usage. It's advised that you save your progress before <b>reloading</b> the page after having disabled Grammarly or any other Browser extention that manipulates website content. Grammarly integration may become a feature some time in the future.", "Yes, I will do that now"); // jshint ignore:line

    //set flag in case modal breaks
    canUseEditor = false;
  }
}

//function that returns the index of a given element in the prent element it's in
function getIndexInParent(elem) {
  elem = $(elem);
  return elem
    .parent()
    .children()
    .index(elem);
}

//triggers updateId on all clauses of parent
function triggerAllIdUpdate(clause) {
  $(clause)
    .parent()
    .children(".clause")
    .trigger("updateId");
}

//for making jquery debugging easier:
$.fn.printThis = function() {
  console.log(this);
  return this;
};

//global autofill settings
var autofillSettings = {
  limit: 20,
  minLength: 1
};

//how long to take for the eabs to fade in, fade out doesn't work at all yet
//set to 0 to disable fading altogether
var eabFadeInTime = 0;

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
          init: function(e) {
            e.stopPropagation();
            //first convert plain html element to jQuery element because the materialize functions
            //only work on that
            $(this).autocomplete(getData(this));
          }
        },
        ".modal": {
          init: function() {
            //not using element specific data because this will be the same for all modals
            //(only the one modal atm)
            $(this).modal({
              dismissible: false
            });
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
          removeForeign: function(e) {
            e.stopPropagation();
            //removes other things than what we put there, like grammarly stuff
            //this may be removed at some point when we get the cloning to work properly
            var otherElements = $(this).siblings().not("label, textarea");

            //if any found, detect and remove
            detectManipulator(otherElements);

            //cleanup textarea element
            $(this).removeAttr("data-gramm");
          }
        },
        ".chips": {
          init: function(e) {
            e.stopPropagation();
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
            var elem = $(this);
            elem.find("textarea, input").trigger("reset");
            elem.find(".clause-list").remove();
          },
          editActive: function(e) {
            e.stopPropagation();
            getData($(this)).editMode = true;

            //set to false for all other clauses
            $(".clause").not(this).trigger("editInactive");

            //prepare for ui change
            var elem = $(this);
            var editModeBtn = elem.find(".edit-mode-btn");

            //hide edit button
            editModeBtn
              .hide()
              .before($("#eab-wrapper").show()); //show edit action buttons
          },
          editInactive: function(e) {
            e.stopPropagation();
            getData($(this)).editMode = false;

            //show edit button to make switch to edit mode possible again
            var elem = $(this);

            //hide edit action buttons
            var eab = elem.find("#eab-wrapper");
            eab.fadeOut(eabFadeInTime, function() {
              eab.insertAfter($("#eab-inactive-anchor"));
              elem.find(".edit-mode-btn").show();
            });

          },
          updateId: function(e) {
            e.stopPropagation();
            //set the displayed id of the clause
            $(this)
              .find(".clause-number")
              .text(getIndexInParent(this) + 1);
          },
          updateTreeDepth: function(e) {
            e.stopPropagation();
            //updates the tree depth of this clause and adds "Sub"s to the clause name
            var subClauseDepth = $(this).parents(".clause-list-sub").length;
            if (subClauseDepth) {
              $(this).find(".clause-prefix").text("Sub".repeat(subClauseDepth) + "-");
            }
          },
          attemptRemove: function(e) {
            e.stopPropagation();
            //tries to remove this clause
            if (getIndexInParent(this)) {
              //inactivate to make eab go away
              $(this).trigger("editInactive");

              //save parent
              var parent = $(this).parent();

              //remove element
              $(this).remove();

              //update ids of other clauses around it
              parent.children(".clause").trigger("updateId");
            }
          },
          click: function(e) {
            //only activate if came from input fields
            if ($(e.target).is("input, textarea")) {
              e.stopPropagation();
              $(this).trigger("editActive");
            }
          }
        },
        ".add-clause-container": {
          click: function(e) {
            e.stopPropagation();
            //add a new clause to the enclosing list by
            //duplicating and resetting the first one of the current type
            $(this).siblings(".clause")
              .first()
              .trigger("editInactive")
              .clone(true, true)
              .trigger("reset")
              .insertBefore(this)
              .trigger("updateId")
              .trigger("editActive");
          }
        },
        "#add-sub-btn": {
          click: function(e) {
            e.stopPropagation();
            var elem = $(this);

            //prepare sublause list
            var newList = elem
              .parent()
              .append("<div></div>")
              .children()
              .last()
              .addClass("clause-list clause-list-sub")
              .append(elem
                .parent(".clause")
                .siblings(".add-clause-container")
                .clone(true, true)
              );

            //add new subclause by copying clause without phrase field
            var strippedClause = elem
              .parent(".clause")
              .clone(true, true)
              .trigger("reset");
            strippedClause
              .children(".row")
              .remove();
            strippedClause
              .insertBefore(newList.find(".add-clause-container"))
              .trigger("updateId").trigger("updateTreeDepth"); //why does it have to be this way?

            //remove this button after subclause was added
            elem.remove();
          }
        },
        ".edit-mode-btn": {
          click: function(e) {
            e.stopPropagation();

            //get current clause we are in
            var thisClause = $(this).closest(".clause");

            //set edit mode for this clause to true
            thisClause.trigger("editActive");
          }
        },
        ".eab-move-down": {
          click: function(e) {
            e.stopPropagation();
            var clause = $(this).closest(".clause");
            clause.next(".clause").after(clause);

            //update id of all clauses in section
            triggerAllIdUpdate(clause);
          }
        },
        ".eab-move-up": {
          click: function(e) {
            e.stopPropagation();
            var clause = $(this).closest(".clause");
            clause.prev(".clause").before(clause);

            //update id of all clauses in section
            triggerAllIdUpdate(clause);
          }
        },
        ".eab-reset": {
          click: function(e) {
            e.stopPropagation();
            $(this).closest(".clause").trigger("reset");
          }
        },
        ".eab-delete": {
          click: function(e) {
            e.stopPropagation();
            $(this).closest(".clause").trigger("attemptRemove");
          }
        },
        ".eab-done": {
          click: function(e) {
            e.stopPropagation();
            $(this).closest(".clause").trigger("editInactive");
          }
        },
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
