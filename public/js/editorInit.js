/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
  loadFilePick,
  generatePdf,
  downloadJson,
  bugReportLink,
  serverSave,
  displayToast,
  generatePlaintext,
  registerAccessInputs,
  serverLoad,
  makeAlertMessage,
  startLiveviewWS,
  sendLVUpdate,
  Materialize*/
/* exported
  checkRequiredFields,
  sendLVUpdates,
  resolutionStage,
  resolutionToken,
  resolutionAttributes*/
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

//keeps track of any invalid fields that are marked as such
var badFieldPresent = true;

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

//set to true when there are unsaved changes that the user has to be alerted about
var changesSaved = false;
var noChangesMade = true;
var metaChangesSaved = true;

//token and access code for this resolution, used for saving
var resolutionToken, resolutionCode;

//access level and chair mode are later taken from document
var accessLevel, chairMode;

//attach the default settings
var makeAutofillSettings = makeAutofillSettingsPre.bind({}, autofillSettings);

//is set to true if we need to send updates to LV viewers
var sendLVUpdates = false;

//stage of the resolution, parsed from the rendered html page
var resolutionStage;

//attribute string of resolution, gotten from page
var resolutionAttributes, attributesString;

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
          structure.map(function(obj) {
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

//checks if required fields have values, return true for all fields ok
function checkRequiredFields() {
  //reset flag
  badFieldPresent = false;

  //call check on all required elements
  $(".required").trigger("checkRequired");

  //return for usa of result
  return ! badFieldPresent;
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
        "Please <b>disable Grammarly</b> spellchecking on this website because it may break the " +
        "website visually, its internal workings or even obstruct its usage. It's advised that " +
        "you save your progress before <b>reloading</b> the page after having disabled Grammarly " +
        "or any other browser extention that manipulates website content. Grammarly integration " +
        "may become a feature some time in the future.");
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
    .appendTo(subList)
    .trigger("updateTreeDepth");

  //move button to bottom of list
  subList.children(".add-clause-container").appendTo(subList);

  //only activate if enabled (load mode needs no activation state changes)
  if (activationStateChanges) {
    strippedClause.trigger("editActive");
  }

  //update is of all clauses in list
  subList.children(".clause").trigger("updateId");

  //made a change
  changesSaved = false;

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

  //made a change
  changesSaved = false;

  //structure update not sent here because this is also called when loading the resolution

  //return this for chaining
  return this;
};

//registers event handlers that are essential for the general function of the page
function registerEssentialEventHandlers(doLoad) {
  $("body")
  .on("touchstart", function() {
    //register touch event and remove tooltips for touch-devices
    $(".tooltipped").tooltip("remove");
  });
  if (doLoad) {
    $(".modal").on("reset", function(e) {
      e.stopPropagation();
      var elem = $(this);
      elem.find("input,textarea").trigger("reset");
      elem.find("#file-selector").hide();
    });
  }
  $("#action-pdf")
  .on("click", function(e) {
    e.stopPropagation();

    //finalize editing on all fields
    $(".clause").trigger("editInactive");

    //save first if anything changed
    if (changesSaved) {
      //no saving necessary
      generatePdf();
    } else {
      //save json to server first
      serverSave(function() {
        //display pdf directly after generating
        generatePdf();
      }, true);
    }
  });
  $("#action-plaintext")
  .on("click", function(e) {
    e.stopPropagation();

    //finalize editing on all fields
    $(".clause").trigger("editInactive");

    //save first if anything changed
    if (changesSaved) {
      //no saving necessary
      generatePlaintext();
    } else {
      //save json to server first
      serverSave(function() {
        //display pdf directly after generating
        generatePlaintext();
      }, true);
    }
  });
}

//registers event handlers necessary for the editor
//we can be sure this is loaded after all the data is gotten from the page and
//other data loaded from the server (like autofill data)
function registerEventHandlers(loadedData) {
  $(window)
  .on("beforeunload", function(e) {
    //stop close if flag set that there are unsaved changes
    if (! (changesSaved || noChangesMade)) {
      e.preventDefault();

      //try to send a message to the user, the default from the browser is fine too though
      return "You have unsaved changes that will be lost if you proceed!" +
        "Press the 'Save' button to save your resolution.";
    }
  });
  if (accessLevel === "MA") {
    //init selector for attribute setting, only allow one handler to be set
    $("select").one("init", function() {
      //init select box
      $(this).material_select();

      //container for all of this
      var selectBox = $("#attribute-select-box");
      var selectBoxContainer = selectBox.find(".select-wrapper");

      //get the input element to set validation classes
      var selectBoxInput = selectBoxContainer.children("input");

      //get the submit button
      var selectBoxSubmitButton = $("#attribute-submit-btn");

      //gets the value of the selector (false returned if bad value or none selected)
      var getSelectValue = function() {
        //check which li element of the select wrapper is active
        var activeOption = selectBoxContainer.find("li.active");

        //any must be active
        if (! activeOption.length) {
          //remove valdation classes, disable button
          selectBoxInput.removeClass("invalid valid");
          selectBoxSubmitButton.addClass("disabled");

          //none selected
          return false;
        }

        //get text of that option and get id for it
        var activeId = selectBoxContainer.find("option:contains(" +
          activeOption.children("span").text() + ")").val();

        //must be one of the four possible states and not the current one
        if (activeId === attributesString ||
            ["none", "readonly", "noadvance", "static"].indexOf(activeId) === -1) {
          //disable button and invalidate field
          selectBoxInput.removeClass("valid").addClass("invalid");
          selectBoxSubmitButton.addClass("disabled");

          //bad value
          return false;
        }

        //all is ok, enable button and display input field as valid
        selectBoxInput.removeClass("invalid").addClass("valid");
        selectBoxSubmitButton.removeClass("disabled");

        //return truthy id string as gotten value
        return activeId;
      };

      //attribute select and submission
      selectBoxSubmitButton
      .on("click", function(e) {
        //prevent default link following
        e.preventDefault();

        //get value from validation
        var selectedValue = getSelectValue();

        //proceed to submission if value is truthy and selection thereby valid
        if (selectedValue) {
          //inject code input element
          selectBox.append("<input type='hidden' name='code' value='" +
                           resolutionCode + "'>");

          //add action url to form with token
          selectBox.attr("action", "/resolution/setattribs/" + resolutionToken);

          //submit form to set attributes and then be redirected back here
          selectBox.submit();
        }
      })
      .on("mouseover", function() {
        //validation only
        getSelectValue();
      });

      //trigger on change of selecter
      selectBox.find("select").on("change", function() {
        //validation only
        getSelectValue();
      });
    });
  }
  $(".autocomplete")
  .on("init", function(e) {
    e.stopPropagation();
    $(this).autocomplete($(this).getData());
  });
  $("input.required, textarea.required")
  .on("checkRequired", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //get value of required field
    var value = elem.val().trim();

    //keep track if value invalid
    var valueBad = false;

    //check for presence of value
    valueBad = ! (value && value.length);

    //check for presence in autofill data mapping and require value to be in data if so
    if (! valueBad) {
      //get the data we have to match to
      var matchDataSelector = Object.keys(loadedData.autofillDataMapping)
        .find(function(selector) {
          //check if element matches this selector
          return elem.is(selector);
        });

      //only if there actually is a selector for this element in the data mappings
      if (matchDataSelector) {
        valueBad = valueBad || ! loadedData
          .autofillDataMapping[matchDataSelector].includes(value);
      }
    }

    //change validation state accordingly
    elem[valueBad ? "addClass" : "removeClass"]("invalid");

    //apply to global flag
    badFieldPresent = badFieldPresent || valueBad;
  })
  .on("change", function() {
    //check again on changed value
    $(this).trigger("checkRequired");
  });
  $("input[type='file']")
  .on("reset", function(e) {
    e.stopPropagation();
    $(this).val("");
  })
  .on("change", function() {
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
  });
  //don't bind on inputs that are descendants of a not-editor classed element
  $("textarea,input").not("* .not-editor")
  .on("activateLabel", function(e) {
    e.stopPropagation();
    //make associated labels active
    $(this).siblings("label").addClass("active");
  })
  .on("reset", function(e) {
    e.stopPropagation();
    //reset invalid labels
    $(this).removeClass("invalid");
  })
  .on("change paste keyup", function() {
    //register changed content and set flag for user alert
    changesSaved = false;
    noChangesMade = false;
  });
  $(".meta-input-wrapper")
  .on("change", "input", function() {
    //set meta canges unsaved flag
    metaChangesSaved = true;
  });
  $("input#forum-name")
  .on("change", function(e) {
    e.stopPropagation();

    //replace if has abbreviation extension
    var elem = $(this);
    var unabbreviated = loadedData.forumAbbrevMapping[elem.val().trim().toLowerCase()];
    if (unabbreviated) {
      //replace with non-abbreviated version
      elem.val(unabbreviated);

      //make field check for validity now
      elem.trigger("checkRequired");
    }
  });
  $("input:not(.not-editor)")
  .on("reset", function(e) {
    e.stopPropagation();
    $(this).val("").resetSiblingLabels();
  });
  $("textarea")
  .on("click", function() {
    var triggerOn = $(this);

    //set on timeout to trigger after extension has finished doing things
    window.setTimeout(function() {
      triggerOn.trigger("removeForeign");
    }, 200);
  })
  .on("reset", function(e) {
    e.stopPropagation();
    $(this)
      .val("") //empty content
      .removeAttr("style") //restore size
      .resetSiblingLabels();
  })
  .on("removeForeign", function(e) {
    e.stopPropagation();
    //removes other things than what we put there, like grammarly stuff
    //this may be removed at some point when we get the cloning to work properly
    $(this)
      .siblings()
      .not("label, textarea")
      .detectManipulator();

    //cleanup textarea element
    $(this).removeAttr("data-gramm");
  });
  $(".chips")
  .on("init", function(e) {
    e.stopPropagation();
    var elem = $(this);
    elem.material_chip(elem.getData());

    //reset data object in init data, may have been changed as data load
    elem.getData().data = [];
  })
  .on("reset", function(e) {
    e.stopPropagation();
    $(this).val("");
    $(this).trigger("init");
  });
  $(".chips.required")
  .on("checkRequired", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //get value of field
    var value = elem.material_chip("data");

    //keep track if value invalid
    var valueBad = false;

    //check for presence of values
    valueBad = ! (value && value.length);

    //color label according to status
    elem.siblings("label")
      [valueBad ? "addClass" : "removeClass"]("red-text");

    //check that all entries are ok sponsors in autofill data
    if (! valueBad) {
      //get the data selector we have to match to
      var matchDataSelector = Object.keys(loadedData.autofillDataMapping)
        .find(function(selector) {
          //check if element matches this selector
          return elem.is(selector);
        });

      //only if there actually is a selector for this element in the data mappings
      if (matchDataSelector) {
        var matchData = loadedData.autofillDataMapping[matchDataSelector];

        //check all chips values for being included
        valueBad = ! value.reduce(function(allOk, item, index) {
          //must be included in data and not equal the main sponsor
          var value = item.tag.trim();
          var isOk = matchData.includes(value) && $("#main-spon").val().trim() !== value;

          //color-mark tag object
          elem.children(".chip:eq(" + index + ")")
            [isOk ? "removeClass" : "addClass"]("red white-text");

          //return for validation of whole array
          return allOk && isOk;
        }, true) || valueBad;
      }
    }

    //apply to global flag
    badFieldPresent = badFieldPresent || valueBad;
  })
  .on("chip.add chip.delete", function() {
    //change action
    changesSaved = false;
    noChangesMade = false;
  })
  .on("focusout", function(e) {
    e.stopPropagation();

    //check again on changed value
    $(this).trigger("checkRequired");
  });
  $(".clause")
  .on("reset", function(e) {
    //resets this clause after cloning
    e.stopPropagation();
    var elem = $(this);
    elem.trigger("clear");
    elem.find(".clause-list").remove();

    //reset phrase field with re-init
    elem
      .children(".phrase-input-wrapper")
      .find(".phrase-input")
      .trigger("init");
  })
  .on("clear", function(e) {
    //clears field content
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

    //change made
    changesSaved = false;
  })
  .on("editActive", function(e) {
    e.stopPropagation();
    //save to server if meta hanges are unsaved
    if (! metaChangesSaved && resolutionStage) {
      serverSave(null, false, true);
    }

    //make all other clauses inactive
    $(".clause").not(this).trigger("editInactive");

    //find the edit mode button for this clause (not descendants!)
    var elem = $(this);
    var editModeBtn = elem.find(".edit-mode-btn").first();

    //hide edit button
    editModeBtn
      .hide()
      .before($("#eab-wrapper").show()); //show edit action buttons and move to clause

    //update eab button disable
    $(this)
      .find("#eab-wrapper")
      .children()
      .trigger("updateDisabled");

    //show add clause button if we're in a subclause (otherwise it's always visible)
    if (elem.isSubClause()) {
      elem.siblings(".add-clause-container").show();
    }
  })
  .on("editInactive", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //hide edit action buttons
    var eab = elem.find("#eab-wrapper");
    eab.hide().insertAfter($("#eab-inactive-anchor"));

    //show edit button to make switch to edit mode possible again
    elem.find(".edit-mode-btn").show();

    //hide add clause button if we're a subclause
    if (elem.isSubClause()) {
      elem.siblings(".add-clause-container").hide();
    }

    //auto-save if not at stage 0 and has unsaved changes
    //no alert message on fail, only red mark
    if (! changesSaved && ! noChangesMade && resolutionStage) {
      serverSave(null, false, true);
    }
  })
  .on("updateId", function(e) {
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
  })
  .on("updateTreeDepth", function(e) {
    e.stopPropagation();
    //updates the tree depth of this clause and adds "Sub"s to the clause name
    var subClauseDepth = $(this).amountAbove(".clause-list-sub");
    if (subClauseDepth) {
      $(this).find(".clause-prefix").text("Sub".repeat(subClauseDepth) + "-");
    }
  })
  .on("attemptRemove", function(e) {
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

      //made changes
      changesSaved = false;

      //send structure update
      sendLVUpdate("structure");
    }
  })
  .on("click", function(e) {
    //only activate if came from input fields
    if ($(e.target).is("input, textarea")) {
      e.stopPropagation();
      $(this).trigger("editActive");
    }
  })
  .on("fromLoadedData", function(e) {
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
  });
  $(".clause-list")
  .on("fromLoadedData", function(e) {
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
  });
  $(".add-clause-container")
  .on("click", function(e) {
    e.stopPropagation();

    //only respond if button itself was clicked and not just the enclosing div
    if ($(e.target).is("a")) {
      //add clause in enclosing list
      $(this).addClause(1, true);

      //send structure update
      sendLVUpdate("structure");
    }
  });
  $(".edit-mode-btn")
  .on("click", function(e) {
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
  });
  $(".reset-button")
  .on("click", function(e) {
    e.stopPropagation();

    //trigger reset for all contained elements
    $("#" + $(this).attr("for"))
      .find("*")
      .trigger("reset");

    //changes made, now unsaved
    changesSaved = false;

    //also set meta changes unsaved flag to allow next focus on clause to autosave
    metaChangesSaved = false;
  });
  $("#eab-move-down")
  .on("click", function(e) {
    e.stopPropagation();
    var clause = $(this).closest(".clause");
    clause.next(".clause").after(clause);

    //made a change
    changesSaved = false;

    //update id of all clauses in section
    clause.triggerAllIdUpdate();

    //send structure update
    sendLVUpdate("structure");
  })
  .on("updateDisabled", makeEabMoveUpdateDisabledHandler(false));
  $("#eab-move-up")
  .on("click", function(e) {
    e.stopPropagation();
    var clause = $(this).closest(".clause");
    clause.prev(".clause").before(clause);

    //made a change
    changesSaved = false;

    //update id of all clauses in section
    clause.triggerAllIdUpdate();

    //send structure update
    sendLVUpdate("structure");
  })
  .on("updateDisabled", makeEabMoveUpdateDisabledHandler(true));
  $("#eab-add-sub")
  .on("click", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //get enclosing clause and make inactive to prevent cloning of eab and add subclause
    elem.closest(".clause").addSubClause(true);

    //send structure update
    sendLVUpdate("structure");
  })
  .on("updateDisabled", function(e) {
    e.stopPropagation();

    //set disabled state according to wether or not a subclause can be added
    $(this).disabledState(! $(this).canReceiveSubclause());
  });
  $("#eab-add-ext")
  .on("click", function(e) {
    e.stopPropagation();

    //un-hide extended clause content field
    $(this).closest(".clause").children(".clause-content-ext").show();

    //make disabled after action performed
    $(this).disabledState(true);

    //send structure update
    sendLVUpdate("structure");
  })
  .on("updateDisabled", function(e) {
    e.stopPropagation();

    //set disabled state according to wether or not a subclause can be added
    //also can't un-hide again (disabled if visible)
    var clause = $(this).closest(".clause");
    $(this).disabledState(
      ! clause.find(".clause").length || //disable if doesn't already have subclause
      clause.children(".clause-content-ext:visible").length); //disable if already there
  });
  $("#eab-clear")
  .on("click", function(e) {
    e.stopPropagation();
    $(this).closest(".clause").trigger("clear");

    //send structure update because ext cont is removed
    sendLVUpdate("structure");
  });
  $("#eab-delete")
  .on("click", function(e) {
    e.stopPropagation();
    $(this).closest(".clause").trigger("attemptRemove");
  })
  .on("updateDisabled", function(e) {
    e.stopPropagation();

    //check if enclosing clause can be removed
    $(this).disabledState(! $(this).closest(".clause").clauseRemovable());
  });
  $("#eab-done")
  .on("click", function(e) {
    e.stopPropagation();
    $(this).closest(".clause").trigger("editInactive");
  });
  $("#legacy-action-load")
  .on("click", function(e) {
    //file actions are defined in a seperate file
    e.stopPropagation();

    //load file from computer file system
    loadFilePick();
  });
  $("#legacy-action-save")
  .on("click", function(e) {
    e.stopPropagation();

    //finalize editing on all fields
    $(".clause").trigger("editInactive");

    //download editor json
    downloadJson();
  });
  $("#action-save")
  .on("click", function(e) {
    e.stopPropagation();

    //display message before triggering save on clauses, will probably be in saved state afterwards
    if (changesSaved) {
      displayToast("Already saved");
    } else {
      //save message
      Materialize.toast("Saving", 3000);
    }

    //finalize editing on all fields
    $(".clause").trigger("editInactive");

    //save to server if still not everything saved
    if (! changesSaved) {
      //save json to server first
      serverSave(null, true);
    }
  });
}

//do things when the document has finished loading
$(document).ready(function() {
  //get token and, if present, code from document
  resolutionToken = $("#token-preset").text();
  var codeElement = $("#code-preset");
  if (codeElement) {
    //get code
    resolutionCode = codeElement.text();

    //remove element
    codeElement.remove();
  }

  //check for chair or admin access
  accessLevel = $("#code-access-level").text();
  chairMode = accessLevel === "MA" || accessLevel === "CH";

  //get stage of resolution
  resolutionStage = parseInt($("#resolution-stage").text(), 10);

  //get attributes
  attributesString = $("#resolution-attributes").text();

  //parse what that attribute string means
  resolutionAttributes = {};
  ["readonly", "noadvance", "static"].forEach(function(name) {
    resolutionAttributes[name] = name === attributesString;
  });

  //set other both is static is set
  if (resolutionAttributes.static) {
    resolutionAttributes.readonly = true;
    resolutionAttributes.noadvance = true;
  }

  //allow props combine with access level (MA level supercedes restrictions)
  resolutionAttributes.allowSave = ! resolutionAttributes.readonly || accessLevel === "MA";
  resolutionAttributes.allowAdvance = ! resolutionAttributes.noadvance || accessLevel === "MA";

  //register an access input group for resolution advancement
  registerAccessInputs({
    url: "/resolution/advance/",
    selector: ".advance-submit-btn"
  }, "#advance-code-form", {
    //need to look at both fields, nothing given already
    presetToken: resolutionToken,
    codeFieldSelector: "#advance-code-input",

    //additional validation to check for vote field values
    additionalValidation: function(setFieldState) {
      //return true right away if we're not at stage 6
      if (resolutionStage !== 6) {
        return true;
      }

      //get input elements by selecting elements with their ids
      var fields = ["#infavor-vote-input", "#against-vote-input", "#abstention-vote-input"]
        .map(function(selector) { return $(selector); });

      //get values from all fields
      var values = fields.map(function(e) {
        //return gotten number if above 0
        return e.val();
      });

      //all of them are not positive
      var anyPositive = ! values.every(function(v) { return v <= 0; });

      //mark with validation signs
      fields.forEach(function(e, index) {
        //take individual value into consideration, all invalid if none positive
        setFieldState(e, values[index] > 0 || (anyPositive && ! values[index]));
      });

      //check that there is at least one ok value and no bad value
      return values.some(function(v) { return v; }) &&
          values.every(function(v) { return v >= 0; });
    },

    //additional trigger fields
    //that should trigger a validation check of these fields with additionalValidation
    additionalInputsSelectors: "#infavor-vote-input,#against-vote-input,#abstention-vote-input"
  });

  //check if we are in no load mode
  if ($("#no-load-mode").length) {
    //register an access input group for unlock of editor
    registerAccessInputs({
      url: "/resolution/editor/",
      selector: "#unlock-submit-btn"
    }, "#unlock-code-form", {
      //need to look at both fields, nothing given already
      presetToken: resolutionToken,
      codeFieldSelector: "#unlock-code-input"
    });

    //set save status flags for no load mode
    changesSaved = true;
    noChangesMade = true;

    //only register essential event handler, not associated with editor directly
    registerEssentialEventHandlers(false);

    //trigger all init events
    $("*").trigger("init");
  } else { //proceed normally
    //load external sponsor, phrase and forum name data
    var autofillData;
    $.getJSON("/autofillData.json")
    .fail(function(data, status, error) {
      //log the error we have with getting the data
      console.error(status, error);
      makeAlertMessage(
        "error_outline", "Error loading necessary data!", "ok",
        "Failed to download data! Check the console for more info." +
        " Please file a " + bugReportLink("data_load_fail") + " and describe this problem." +
        "(The editor won't work until you reload the page and the data is downloaded)",
        "data_load_fail");
    })
    .done(function(data) {
      //data object to pass to scope of event handlers
      var loadedData = {};

      //map forums with Chair code mode in mind
      data.forums = data.forums.map(function(forum) {
        //process only if array of length 3
        if (forum instanceof Array && forum[2] === true) {
          //in Chair mode, return normally, otherwise mark to be removed
          return chairMode ? forum : false;
        } else {
          //return normally
          return forum;
        }
      }) //filter out falsy ones that were selected to be removed
      .filter(function(forum) { return forum; });

      //mapping between autofill data and input field selectors
      loadedData.autofillDataMapping = {
        "#forum-name": data.forums.map(function(pair) { return pair[0]; }), //only full name ok
        "#main-spon,#co-spon": data.sponsors.slice(),
        "#preamb-clauses .phrase-input": data.phrases.preamb.slice(),
        "#op-clauses .phrase-input": data.phrases.op.slice(),
      };

      //get forum abbreviation mapping data
      loadedData.forumAbbreviations = data.forums.slice();
      loadedData.forumAbbreviations.shift();

      //convert to mapping object
      loadedData.forumAbbrevMapping = {};
      loadedData.forumAbbreviations.forEach(function(nameSet) {
        //attach mapping
        loadedData.forumAbbrevMapping[nameSet[1].trim().toLowerCase()] = nameSet[0];
      });

      //register all event handlers
      registerEssentialEventHandlers(true);
      registerEventHandlers(loadedData);

      //transform into correct data structure when gotten data
      autofillData = transformMarkedArrays(data, "_convert", null);

      //data used to inititalize input fields/thingies and their other options
      var initData = {
        "#forum-name": makeAutofillSettings(autofillData.forums),
        "#co-spon": {
          autocompleteOptions: makeAutofillSettings(autofillData.sponsors)
        },
        "#main-spon": makeAutofillSettings(autofillData.sponsors),
        "#preamb-clauses .phrase-input": makeAutofillSettings(autofillData.phrases.preamb),
        "#op-clauses .phrase-input": makeAutofillSettings(autofillData.phrases.op),
      };

      //for all init data attach the data to the element
      for (var dataSelector in initData) {
        //attach data to all elements that match
        $(dataSelector).data(dataPrefix, initData[dataSelector]);
      }

      //if in stage 0, start timer for save reminder
      if (! resolutionStage) {
        setTimeout(function() {
          //display alert modal with alert message
          makeAlertMessage(
            "backup", "Save Reminder", "Yes, I will do that now",
            "The page will attempt to prevent you" +
            " from accidentally leaving, but before registering your resolution token permanently" +
            " by saving it for the first time, auto-save will not be active. Please remember to" +
            " save your resolution if it was actually your intention to start writing a new one.");
        }, 1000 * 60 * 5); //5 minutes
      }

      //trigger all init events
      $("*").trigger("init");

      //initiate loading of resolution from server with preset token
      serverLoad(resolutionToken, true, function() {
        //don't send update if still loading,
        //some events may be fake-fired in the process of getting
        $(".clause input, .clause textarea")
        .on("paste keyup", function() {
          //send content update
          sendLVUpdate("content", $(this));
        });
      });

      //if as MA or at stage 6 and authorized as CH, start liveview editor websocket
      if (resolutionStage === 6 && accessLevel === "CH" || accessLevel === "MA") {
        //give token and code, false for being editor type client
        startLiveviewWS(false, resolutionToken, resolutionCode, function(type, newSendStatus) {
          //act on "sendUpdates" update
          switch (type) {
            case "sendUpdates":
              //if now set to true and previously false,
              //send structure update to catch server up on made changes
              if (! sendLVUpdates && newSendStatus) {
                sendLVUpdates = true;
                sendLVUpdate("structure");
              }

              //copy value
              sendLVUpdates = newSendStatus;
              break;
            case "disconnect":
              //set send updates to false because we want to resend after connection failure
              sendLVUpdates = false;
          }
        });
      }
    });
  }
});
