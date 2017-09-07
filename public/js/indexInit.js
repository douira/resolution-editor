/*jshint esnext: false, browser: true, jquery: true*/
/*global loadFilePick, generatePdf, downloadJson: true*/
//registers events and data, controls interaction behavior

var dataPrefix = "resEd"; //prefix for data stored in elements

//global autofill settings
var autofillSettings = {
  limit: 10,
  minLength: 2
};

//number of subclauses allowed for op and preamb clauses with 0 being no subclauses allowed
var allowedSubclauseDepth = {
  preamb: 1,
  op: 2
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
            //if is array
            if (str instanceof Array) {
              //add all of array
              str.forEach(function(s) {
                obj[s] = propValue;
              });
            } else {
              //normal prop add
              obj[str] = propValue;
            }
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

//queue of alert message we want to display
var alertQueue = [];

//checks if we can display an alert now or starts processing the queue
function checkAlertDisplay() {
  //only if any items in queue and still animating
  if (alertQueue.length) {
    var modal = $("#alert-message-modal");
    if (! (modal.hasClass("open") || modal.hasClass("velocity-animating"))) {
      //get next alert message from queue and display
      var modalData = alertQueue.shift();

      //get the modal element
      var modalElement = $("#alert-message-modal");

      //add content to the modal
      modalElement
        .find(".modal-content-title")
        .html("<i class='material-icons small'>" + modalData.icon + "</i> " + modalData.title);
      modalElement.find(".modal-dismiss-btn").html(modalData.buttonText);

      //set error code if given
      modalElement
        .find(".error-code")
        .text(modalData.hasErrorCode ? "error #" + modalData.errorCode : "")
        [modalData.hasErrorCode ? "show" : "hide"]();

      //call callback for content if given
      var contentBody = modalElement.find(".modal-content-body");
      if (typeof modalData.callbackOrMessage === "string") {
        contentBody.html(modalData.callbackOrMessage);
      } else {
        contentBody.empty();
        modalData.callbackOrMessage(contentBody, modalElement);
      }

      //open the modal for the user to see
      modalElement.modal("open");
    }
  }
}

//creates an alert message
function makeAlertMessage(icon, title, buttonText, callbackOrMessage, errorCode) {
  //default button text
  if (typeof buttonText === "undefined") {
    buttonText = "OK";
  }

  //add alert message object to queue
  alertQueue.push({
    icon: icon,
    title: title,
    buttonText: buttonText,
    callbackOrMessage: callbackOrMessage,
    hasErrorCode: typeof errorCode !== "undefined",
    errorCode: errorCode
  });

  //check immediately
  checkAlertDisplay();
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
      makeAlertMessage(
        "error_outline", "Attention!", "Yes, I will do that now",
        "Please <b>disable</b> Grammarly spellchecking on this website because it may break the" +
        " website visually, its internal workings or even obstruct its usage. It's advised that " +
        "you save your progress before <b>reloading</b> the page after having disabled Grammarly" +
        "or any other browser extention that manipulates website content. Grammarly integration" +
        " may become a feature some time in the future.");

      //set flag in case modal breaks
      canUseEditor = false;
    }
  });
};

//prints for making jquery debugging easier:
$.fn.printThis = function() {
  console.log($(this));
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

//checks if clause can be removed
$.fn.clauseRemovable = function() {
  return this
    .parent()
    .children(".clause")
    .length >= 2 || this.closest(".clause-list").is(".clause-list-sub");
};

//checks if elemnt is a subclause
$.fn.isSubClause = function() {
  return this.closest(".clause-list").is(".clause-list-sub");
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

//checks if a subclause is allowed to be added to element
$.fn.canReceiveSubclause = function() {
  //check if we've reached the max depth of sub clauses for this type of clause
  //(different for op or preamb)
  return this.amountAbove(".clause-list-sub") < allowedSubclauseDepth[
    this.closest(".clause").attr("data-clause-type")
  ];
};

//returns the number of ancestors that match the given selector this element has
$.fn.amountAbove = function(selector) {
  return this.parents(selector).length;
};

//adds a subclause for given clause (and makes list if necessary),
//expects inactivation to have been performed if activationStateChanges is falsy
//(and won't activate created first subclause either)
$.fn.addSubClause = function(activationStateChanges) {
  //stop if we're not in a clause
  if (! this.is(".clause")) {
    return this;
  }

  //inactivate if doing state changes
  if (activationStateChanges) {
    this.trigger("editInactive");
  }

  //prepare sublause list, extend already present one if found
  var subList = this.children(".clause-list");
  if (! subList.length) {
    //get a clause list and attach to clause
    subList = this
      .closest(".clause-list")
      .clone(true, true)
      .addClass("clause-list-sub"); //make a sublcause list by adding sigifying class

    //remove left over clauses from clone
    subList.children().not(".add-clause-container").remove();

    //add created list to clause, add clause button will be made visible by clause event
    this.children(".clause-list-anchor").after(subList);
  }

  //add new subclause by copying clause without phrase field
  var strippedClause = this
    .clone(true, true)
    .trigger("reset");
  strippedClause
    .children(".phrase-input-wrapper")
    .remove();
  strippedClause
    .prependTo(subList)
    .trigger("updateTreeDepth");

  //only activate if enabled (load mode needs no activation state changes)
  if (activationStateChanges) {
    strippedClause.trigger("editActive");
  }

  //update is of all clauses in list
  subList.children(".clause").trigger("updateId");

  //return this for chaining
  return this;
};

//adds a clause to the clause list the button was clicked in, see addSubClause for state flag
$.fn.addClause = function(amount, activationStateChanges) {
  //if not a add clause button container, try to find it
  var addClauseContainer = this;
  if (! this.is(".add-clause-container")) {
    if (this.is(".clause-list")) {
      addClauseContainer = this.children(".add-clause-container");
    } else {
      return this;
    }
  }

  //inactivate all clauses if state changes enabled
  if (activationStateChanges) {
    $(".clause").trigger("editInactive");
  }

  //last clause added to the list
  var addedClause;

  //for number of clauses to be added
  for (var i = 0; i < amount; i ++) {
    //add a new clause to the enclosing list by
    //duplicating and resetting the first one of the current type
    addedClause = addClauseContainer
      .siblings(".clause")
      .first()
      .clone(true, true)
      .trigger("reset")
      .insertBefore(addClauseContainer)
      .trigger("updateId");
  }

  //make last added clause active if enabled
  if (activationStateChanges) {
    addedClause.trigger("editActive");
  }

  //return this for chaining
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
    //get forum abbreviation mapping data
    var forumAbbreviations = data.forums.slice();
    forumAbbreviations.shift();

    //convert to mapping object
    var forumAbbrevMapping = {};
    forumAbbreviations.forEach(function(nameSet) {
      //attach mapping
      forumAbbrevMapping[nameSet[1]] = nameSet[0];
    });

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
            var modal = $(this);
            modal.modal({
              dismissible: false,
              complete: function() {
                modal.trigger("reset");

                //display next alert if there is one
                checkAlertDisplay();
              }
            });
          },
          reset: function(e) {
            e.stopPropagation();
            var elem = $(this);
            elem.find("input,textarea").trigger("reset");
            elem.find("#file-selector").hide();
          }
        },
        "input[type='file']": {
          reset: function(e) {
            e.stopPropagation();
            $(this).val("");
          },
          change: function() {
            //get file
            var file = this.files[0];

            //stop if wrong extension
            if (file.name.match(/^.*\.rso/)) {
              //load file
              var reader = new FileReader();
              var callback = $(this).getData().fileLoadCallback;
              reader.onload = function(e) {
                callback(e.target.result);
              };
              reader.readAsText(file);
            }
          }
        },
        "input, textarea": {
          activateLabel: function() {
            //make associated labels active
            $(this).siblings("label").addClass("active");
          }
        },
        "input#forum-name": {
          change: function(e) {
            e.stopPropagation();

            //replace if has abbreviation extension
            var elem = $(this);
            var unabbreviated = forumAbbrevMapping[elem.val().trim()];
            if (unabbreviated) {
              elem.val(unabbreviated);
            }
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
            $(this)
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

            //reset data object in init data, may have been changed as data load
            $(this).getData().data = [];
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
            elem.trigger("clear");
            elem.find(".clause-list").remove();
          },
          //clears field content
          clear: function(e) {
            e.stopPropagation();

            //clear fields
            $(this)
              .children(".phrase-input-wrapper,.clause-content,.clause-content-ext")
              .find("textarea,input")
              .trigger("reset");

            //re-hide extended clause content
            $(this).children(".clause-content-ext").hide();

            //update add-ext disabled state of eab in this clause
            $(this)
              .find("#eab-add-ext")
              .not(".clause-list-sub #eab-add-ext")
              .trigger("updateDisabled");
          },
          editActive: function(e) {
            e.stopPropagation();
            //make all other clauses inactive
            $(".clause").not(this).trigger("editInactive");

            //find the edit mode button for this clause (not descendants!)
            var elem = $(this);
            var editModeBtn = elem.find(".edit-mode-btn").first();

            //hide edit button
            editModeBtn
              .hide()
              .before($("#eab-wrapper").show()); //show edit action buttons

            //update eab button disable
            $(this)
              .find("#eab-wrapper")
              .children()
              .trigger("updateDisabled");

            //show add clause button if we're in a subclause (otherwise it's always visible)
            if (elem.isSubClause()) {
              elem.siblings(".add-clause-container").show();
            }
          },
          editInactive: function(e) {
            e.stopPropagation();

            //show edit button to make switch to edit mode possible again
            var elem = $(this);

            //hide edit action buttons
            var eab = elem.find("#eab-wrapper");
            eab.hide().insertAfter($("#eab-inactive-anchor"));
            elem.find(".edit-mode-btn").show();

            //hide add clause button if we're a subclause
            if (elem.isSubClause()) {
              elem.siblings(".add-clause-container").hide();
            }
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
            var subClauseDepth = $(this).amountAbove(".clause-list-sub");
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

              //check if this clause is the last subclause in its list
              if (parent.children(".clause").length === 1) {
                //get enclosing clause
                var clause = parent.closest(".clause");

                //remove continuation content from parent and add onto normal clause content
                var extField = clause
                  .children(".clause-content-ext")
                  .hide()
                  .children("textarea");
                var contentField = clause.children(".clause-content").children("textarea");
                contentField.val(contentField.val().trim() + " " + extField.val().trim());

                //clear ext field
                extField.trigger("reset");
              }

              //remove this clause
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
          },
          fromLoadedData: function(e) {
            e.stopPropagation();

            //fill with data
            var elem = $(this);
            var data = elem.getData().loadedData;

            //if data is only a string, fill content only
            if (typeof data === "string") {
              //fill content field
              elem
                .children(".clause-content")
                .children("textarea")
                .val(data)
                //trigger keyup to make textarea update its size
                .triggerAll("activateLabel keyup");
            } else {
              //fill phrase field
              elem
                .children(".phrase-input-wrapper")
                .find("input")
                .val(data.phrase)
                .trigger("activateLabel");

              //fill content field
              elem
                .children(".clause-content")
                .children("textarea")
                .val(data.content)
                .triggerAll("activateLabel keyup");

              //add subclause data if given
              if (data.sub) {
                //make subclause list, give data and trigger to continue
                elem.addSubClause(false);
                var subclauseList = elem.find(".clause-list-sub");
                subclauseList.getData().loadedData = data.sub;
                subclauseList.trigger("fromLoadedData");

                //also add ext data if given
                if (data.contentExt) {
                  elem
                    .children(".clause-content-ext")
                    .show()
                    .children("textarea")
                    .val(data.contentExt)
                    .triggerAll("activateLabel keyup");
                }
              }
            }
          }
        },
        ".clause-list": {
          fromLoadedData: function(e) {
            e.stopPropagation();
            var elem = $(this);

            //make needed number of clauses
            var data = $(this).getData().loadedData;
            elem.addClause(data.length - 1, false); //one less, we already have one there by default

            //give them their data and trigger to continue
            elem.children(".clause").each(function(index) {
              $(this).getData().loadedData = data[index];
              $(this).trigger("fromLoadedData");
            });
          }
        },
        ".add-clause-container": {
          click: function(e) {
            e.stopPropagation();

            //only respond if button itself was clicked and not just the enclosing div
            if ($(e.target).is("a")) {
              //add clause in enclosing list
              $(this).addClause(1, true);
            }
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
        "#eab-add-sub": {
          click: function(e) {
            e.stopPropagation();
            var elem = $(this);

            //get enclosing clause and make inactive to prevent cloning of eab and add subclause
            elem.closest(".clause").addSubClause(true);
          },
          updateDisabled: function(e) {
            e.stopPropagation();

            //set disabled state according to wether or not a subclause can be added
            $(this).disabledState(! $(this).canReceiveSubclause());
          }
        },
        "#eab-add-ext": {
          click: function(e) {
            e.stopPropagation();

            //un-hide extended clause content field
            $(this).closest(".clause").children(".clause-content-ext").show();

            //make disabled after action performed
            $(this).disabledState(true);
          },
          updateDisabled: function(e) {
            e.stopPropagation();

            //set disabled state according to wether or not a subclause can be added
            //also can't un-hide again (disabled if visible)
            var clause = $(this).closest(".clause");
            $(this).disabledState(
              ! clause.find(".clause").length || //disable if doesn't already have subclause
              clause.children(".clause-content-ext:visible").length); //disable if already there
          }
        },
        "#eab-clear": {
          click: function(e) {
            e.stopPropagation();
            $(this).closest(".clause").trigger("clear");
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

        //file actions are defined in a seperate file
        "#file-action-load": {
          click: function(e) {
            e.stopPropagation();

            //load file from computer file system
            loadFilePick($("#editor-main"));
          }
        },
        "#file-action-save": {
          click: function(e) {
            e.stopPropagation();

            //finalize editing on all fields
            $(".clause").trigger("editInactive");

            //download editor json
            downloadJson($("#editor-main"));
          }
        },
        "#file-action-pdf": {
          click: function(e) {
            e.stopPropagation();

            //finalize editing on all fields
            $(".clause").trigger("editInactive");

            //display pdf directly after generating
            generatePdf($("#editor-main"));
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
