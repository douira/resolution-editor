/*jshint asi: false, esnext: false, browser: true, jquery: true, indent: 2*/
var dataPrefix = "resEd"; //prefix for data stored in elements

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

  //add content to the modal
  modalElement.find(".modal-content-title").html(title);
  modalElement.find(".modal-content-body").html(message);
  modalElement.find(".modal-dismiss-btn").html(buttonText);

  //open the modal for the user to see
  modalElement.modal("open");
}

//updates the disabling state of eab movement buttons, used as event handler
function makeEabMoveUpdateDisabledHandler(isUpButton) {
  //return event handler function, type flag is preserved in closure
  return function(e) {
    e.stopPropagation();

    //get index of enclosing clause in list of clauses
    var enclosingClause = $(this).closest(".clause");
    var clauses = enclosingClause.parent().children(".clause");
    var clauseIndex = clauses.index(enclosingClause);

    //depending on direction flag, decide wether or not to disable
    $(this)[
      (isUpButton ? ! clauseIndex : clauseIndex === clauses.length - 1) ?
      "addClass" : "removeClass"
    ]("disabled");
  };
}


//register jquery plugins
//resets sibling labels
$.fn.resetSiblingLabels = function() {
  return this.each(function() {
    //get the siblings of the field and reset them by removing the active class
    $(this).siblings("label").removeClass("active");
  });
};

//gets resolution-editor specific data from given dom element
$.fn.getData = function() {
  var gottenData = this.data(dataPrefix);

  //make data if none present
  if (typeof gottenData === "undefined") {
    gottenData = {};
    this.data(dataPrefix, gottenData);
  }
  return gottenData;
};

//detects and warns about an extension manipulating the content and events on our page
$.fn.detectManipulator = function() {
  return this.each(function() {
    //detect grammarly
    if ($(this).filter("grammarly-ghost").length) {
      //make disabling alert
      makeAlertMessage("alert", "<i class='material-icons small'>error_outline</i> Attention!", "Please <b>disable</b> Grammarly spellchecking on this website because it may break the website visually, its internal workings or even obstruct its usage. It's advised that you save your progress before <b>reloading</b> the page after having disabled Grammarly or any other browser extention that manipulates website content. Grammarly integration may become a feature some time in the future.", "Yes, I will do that now"); // jshint ignore:line

      //set flag in case modal breaks
      canUseEditor = false;
    }
  });
};

//prints for making jquery debugging easier:
$.fn.printThis = function() {
  console.log(this);
  return this;
};

//function that returns the index of a given element in the parent element it's in
$.fn.indexInParent = function() {
  return this
    .parent()
    .children()
    .index(this);
};

//triggers updateId on all clauses of parent
$.fn.triggerAllIdUpdate = function() {
  return this
      .parent()
      .children(".clause")
      .trigger("updateId");
};

//returns the collection of clauses the nearest enclosing clause is part of
/*$.fn.enclosingClauseCollection = function() {
  return this.closest(".clause").parent().children(".clause");
};*/

//checks if clause can be removed
$.fn.clauseRemovable = function() {
  return this
    .parent()
    .children(".clause")
    .length >= 2;
};

//sets the disabled state for element by adding or removing the .disabled class
$.fn.disabledState = function(makeDisabled) {
  return this.each(function() {
    $(this)[makeDisabled ? "addClass" : "removeClass"]("disabled");
  });
};

//triggers several events in order
$.fn.triggerAll = function(eventNames, params) {
  //trigger all events with params
  eventNames.split(/[ ,]+/).forEach(function(event) {
    this.trigger(event, params);
  }.bind(this));
  return this;
};

//do things when the document has finished loading
$(document).ready(function() {
  //load external sponsor, phrase and forum name data
  var autofillData;
  $.getJSON("/autofillData.json")
  .fail(function(data, status, error) {
    //log the error we have with getting the data
    console.error(status, error);
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
            $(this).autocomplete($(this).getData());
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
            $(this).val("").resetSiblingLabels();
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
            elem
              .val("") //empty content
              .removeAttr("style") //restore size
              .resetSiblingLabels();
          },
          removeForeign: function(e) {
            e.stopPropagation();
            //removes other things than what we put there, like grammarly stuff
            //this may be removed at some point when we get the cloning to work properly
            $(this)
              .siblings()
              .not("label, textarea")
              .detectManipulator();

            //cleanup textarea element
            $(this).removeAttr("data-gramm");
          }
        },
        ".chips": {
          init: function(e) {
            e.stopPropagation();
            $(this).material_chip($(this).getData());
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
            $(this).getData().editMode = true;

            //set to false for all other clauses
            $(".clause").not(this).trigger("editInactive");

            //prepare for ui change
            var elem = $(this);
            var editModeBtn = elem.find(".edit-mode-btn");

            //hide edit button
            editModeBtn
              .hide()
              .before($("#eab-wrapper").show()); //show edit action buttons

            //update eab button disable
            $(this)
              .find("#eab-wrapper")
              .children()
              .trigger("updateDisabled");
          },
          editInactive: function(e) {
            e.stopPropagation();
            $(this).getData().editMode = false;

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
              .text($(this).indexInParent() + 1);

            //update disabled state of buttons
            $(this)
              .find("#eab-wrapper")
              .children()
              .trigger("updateDisabled");
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
            if ($(this).clauseRemovable()) {
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

            //only respond if button itself was clicked and not just the enclosing div
            if ($(e.target).is("a")) {
              //add a new clause to the enclosing list by
              //duplicating and resetting the first one of the current type
              $(this).siblings(".clause")
                .first()
                .trigger("editInactive")
                .clone(true, true)
                .trigger("reset")
                .insertBefore(this)
                .triggerAll("editActive updateId");
            }
          }
        },
        "#eab-add-sub": {
          click: function(e) {
            e.stopPropagation();
            var elem = $(this);

            //get enclosing clause and make inactive to prevent cloning of eab
            var clause = elem.closest(".clause").trigger("editInactive");

            //prepare sublause list
            var newList = clause
              .append("<div></div>")
              .children()
              .last()
              .addClass("clause-list clause-list-sub");

            //add new subclause by copying clause without phrase field
            var strippedClause = clause
              .clone(true, true)
              .trigger("reset");
            strippedClause
              .children(".row")
              .remove();
            strippedClause
              .appendTo(newList)
              .triggerAll("updateId updateTreeDepth editActive");
          },
          updateDisabled: function(e) {
            e.stopPropagation();

            //check if we've reached the max depth of sub clauses for this type of clause
            //(different for op or preamb)

          }
        },
        ".edit-mode-btn": {
          click: function(e) {
            e.stopPropagation();

            //get current clause we are in
            var thisClause = $(this).closest(".clause");

            //set edit mode for this clause to true
            thisClause.trigger("editActive");

            //update disabled state of movement buttons
            thisClause
              .find("#eab-wrapper")
              .children()
              .trigger("updateDisabled");
          }
        },
        "#eab-move-down": {
          click: function(e) {
            e.stopPropagation();
            var clause = $(this).closest(".clause");
            clause.next(".clause").after(clause);

            //update id of all clauses in section
            clause.triggerAllIdUpdate();
          },
          updateDisabled: makeEabMoveUpdateDisabledHandler(false)
        },
        "#eab-move-up": {
          click: function(e) {
            e.stopPropagation();
            var clause = $(this).closest(".clause");
            clause.prev(".clause").before(clause);

            //update id of all clauses in section
            clause.triggerAllIdUpdate();
          },
          updateDisabled: makeEabMoveUpdateDisabledHandler(true)
        },
        "#eab-reset": {
          click: function(e) {
            e.stopPropagation();
            $(this).closest(".clause").trigger("reset");
          }
        },
        "#eab-delete": {
          click: function(e) {
            e.stopPropagation();
            $(this).closest(".clause").trigger("attemptRemove");
          },
          updateDisabled: function(e) {
            e.stopPropagation();

            //check if enclosing clause can be removed
            $(this).disabledState(! $(this).closest(".clause").clauseRemovable());
          }
        },
        "#eab-done": {
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
