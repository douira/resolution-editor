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
  log,
  onAllSaveDone*/
/* exported
  checkRequiredFields,
  sendLVUpdates,
  resolutionStage,
  resolutionToken,
  resolutionAttributes,
  getAmendmentUpdate,
  amdActionType,
  allowLV*/
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

//set to true when there are unsaved changes that the user has to be alerted about
var changesSaved = false;
var noChangesMade = true;
var metaChangesSaved = true;

//token and access code for this resolution, used for saving
var resolutionToken, resolutionCode;

//access level is later taken from document
var accessLevel;

//is set to true if we need to send updates to LV viewers
var sendLVUpdates = false;

//stage of the resolution, parsed from the rendered html page
var resolutionStage;

//attribute string of resolution, gotten from page
var resolutionAttributes, attributesString;

//if automatic saving is enabled or not, determined from other state variables
var autosaveEnabled;

//is set to true after the phrase in the content message has been displayed
var displayedPhraseContentMessage;

//filled by amendment handler to generate an amendment descriptor object
var getAmendmentUpdate;

//the current amendment action type
var amdActionType;

//true when lv is enabled
var allowLV;

//updates the disabling state of eab movement buttons, used as event handler
function makeEabMoveUpdateDisabledHandler(isUpButton) {
  //return event handler function, type flag is preserved in closure
  return function(e) {
    e.stopPropagation();

    //get index of enclosing clause in list of clauses
    var enclosingClause = $(this).closest(".clause");
    var clauses = enclosingClause.parent().children(".clause");
    var clauseIndex = clauses.index(enclosingClause);

    //depending on direction flag, decide whether or not to disable
    $(this).disabledState(isUpButton ? ! clauseIndex : clauseIndex === clauses.length - 1);
  };
}

//checks if required fields have values, return true for all fields ok
function checkRequiredFields(advanceMode) {
  //reset flag
  badFieldPresent = false;

  //call check on all required elements
  $(".required").trigger("checkRequired", advanceMode);

  //return for use of result
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

//cleans up cloned tooltips by reiniting them
$.fn.cleanupClonedTooltips = function() {
  //forcibly remove tooltip and re-init
  this.find(".tooltipped").removeAttr("data-tooltip-id").tooltip();

  //return original for chaining
  return this;
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

    //hide the add clause container if the clause editInactive handler isn't going to do it
    if (! activationStateChanges) {
      subList.children(".add-clause-container").hide();
    }

    //add created list to clause, add clause button will be made visible by clause event
    this.children(".clause-content-ext").before(subList);

    //reinit tooltips of newly created list
    subList.cleanupClonedTooltips();
  }

  //clone the clause as a base for the new clause
  var strippedClause = this.clone(true, true);

  //remove the phrase field
  //(prevent failing to autocomplete init on "floating" element through reset)
  strippedClause
    .children(".phrase-input-wrapper")
    .remove();

  //also remove phrase condensed field
  strippedClause.children(".clause-cond").children(".cond-phrase").remove();

  strippedClause
    .trigger("reset") //trigger reset to make it like a new clause
    .appendTo(subList) //add it to the end of the subclause list
    .trigger("updateTreeDepth"); //update the info texts on it

  //re-init tooltips after clone
  strippedClause.cleanupClonedTooltips();

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
      addClauseContainer = this.children(".add-clause-container").last();
    } else {
      log({ msg: "could not find add clause container for element", elem: this });
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
      .insertBefore(addClauseContainer)
      //trigger reset after inserting into main document because
      //the autofill init needs to know in what kind of clause it is to get the correct data
      .triggerAll("reset updateId");

    //re-init tooltip after clone
    addedClause.cleanupClonedTooltips();
  }

  //make last added clause active if enabled
  if (activationStateChanges) {
    addedClause.trigger("editActive");
  }

  //made a change
  changesSaved = false;

  //structure update not sent here because this is also called when loading the resolution
  //and we don't want lots of updates to be sent when we load the resolution into the editor

  //return this for chaining
  return this;
};

//makes a modal pop up that informs the user about disallowed characters
var showedDisallowedCharModal = false;
function queueDisallowedCharInfo() {
  //show only once
  if (! showedDisallowedCharModal) {
    //display message
    makeAlertMessage("font_download", "Resolution content warning", "OK",
      "Some characters may haven been removed or changed. This message also serves as a word" +
      " and content length warning." +
      " In general, unnecessary special characters and line breaks are removed." +
      " Please check the detailed <a href='/help#formatting'>help page section</a> on allowed" +
      " characters and formatting advice. This message will only be displayed once.");

    //set flag
    showedDisallowedCharModal = true;
  }
}

//removes illegal characters from inputs and textareas
$.fn.filterIllegalContent = function() {
  //for every passed element
  this.each(function() {
    var elem = $(this);

    //get field content
    var content = elem.val();

    //extra flag without modifying content
    var contentInvalid = false;

    //stop if there is no content, handled by validity checker
    if (! content.trim().length) {
      return;
    }

    //check if normalization is possible in this environment
    var newContent;
    if (String.prototype.normalize) {
      //apply normalization to prevent added diacritical marks from being lost
      newContent = content.normalize("NFKC");
    } else {
      newContent = content;
    }

    //run cleansing regexp replacements over the content
    //see lib/latexGenerator.js for the server version of this and explanations
    newContent = newContent
      //normalize apostrophes
      .replace(/ *[`´']+/g, "’")

      //normalize quotes
      .replace(/[“”‹›«»]/g, "\"")

      //remove all non-space whitespace and/or at least two spaces surrounded by any whitespace
      //(replace by single space to preserve words)
      .replace(/\s*[^\S ]+| {2,}\s*/g, " ")

      //remove trailing _ and ^ (produce latex error), also remove trailing .,-(&/+
      .replace(/[_^,\-(&/+]+$/g, "")

      //remove preceding |.,-)&/+
      .replace(/^[|.,\-)&/+]+/g, "")

      //remove padding whitespace
      .trim()

      //filter characters
      .replace(/[^a-zA-Z0-9*_^|&’"\-.,()/+\u00c0-\u024F ]+/g, "");

    //append final " if there is an odd amount
    if ((newContent.match(/"/g) || []).length % 2) {
      //append at end of the string to satisfy renderer
      //(would be done on server otherwise, do it here so the user can be informed)
      newContent += "\"";
    }

    //check for too long content and too long words
    if (content.length > 2500 || content.match(/\b[^\s ]{46,}/g)) {
      //set flag to notify
      contentInvalid = true;
    }

    //if something changed
    if (content !== newContent || contentInvalid) {
      //make notification
      queueDisallowedCharInfo();
    }

    //trim now, trim shouldn't trigger message
    newContent = newContent.trim();

    //if there was any change, apply back to element
    if (content !== newContent) {
      //apply by setting the content in the elemement
      elem.val(newContent);

      //trigger autoresize to correct textarea size
      elem.trigger("autoresize");

      //trigger content update for this changed content
      sendLVUpdate("content", "charfilter", elem);
    }
  });
};

//gets the current id value of the select container this was called on
$.fn.getSelectValueId = function() {
  //get the actual wrapper element generated by materialize
  var selectWrapper = this.find(".select-wrapper");

  //check which li element of the select wrapper is active
  var activeOption = selectWrapper.find("li.active");

  //any must be active
  if (! activeOption.length) {
    //none selected
    return false;
  }

  //get text of that option and get id for it
  var activeId = selectWrapper.find("option:contains(" +
    activeOption.children("span").text() + ")").val();

  //must be one of the possible states
  if (["noselection", "add", "change", "replace", "remove"].indexOf(activeId) === -1) {
    //bad value
    return false;
  }

  //return truthy id string as gotten value
  return activeId;
};

//sets the value id of a select container by re-initializing
$.fn.setSelectValueId = function(setValueId) {
  //get the select element from the select container
  var select = this.find("select");

  //on all options in select
  select
    .children("option")

    //remove selected active from all
    .prop("active selected", false)

    //find option with given id and activate
    .filter("[value='" + setValueId + "']")
    .prop("selected", true);

  //re-initialize
  select.material_select("destroy");
  select.material_select();
};

//checks if a input field has an autocompletable and ok value
$.fn.checkAutoCompValue = function(loadedData) {
  var elem = this;

  //require to ba called on a single element
  if (this.length > 1) {
    //use only first
    elem = this.eq(0);
  } else if (! this.length) {
    return;
  }

  //get value of required field
  var value = elem.val().trim();

  //stop on missing value
  if (! value.length) {
    return false;
  }

  //keep track of value ok
  var valueOk = true;

  //check for presence of value
  valueOk = value && value.length;

  //check for presence in autofill data mapping and require value to be in data if so
  if (valueOk) {
    //get the data we have to match to
    var matchDataSelector = Object.keys(loadedData.autofillDataMapping)
      .find(function(selector) {
        //check if element matches this selector
        return elem.is(selector);
      });

    //only if there actually is a selector for this element in the data mappings
    if (matchDataSelector) {
      //get data to match value in
      var matchData = loadedData.autofillDataMapping[matchDataSelector];

      //resolve reference to loadedData if given as string
      if (typeof matchData === "string") {
        matchData = loadedData[matchData];
      }

      //for array type data match check if its contained, otherwise must have value 1 to be valid
      valueOk = matchData instanceof Array ?
        matchData.indexOf(value) !== -1 :
        matchData[value] === 1 || typeof matchData[value] === "object";
    }
  }

  //return determined state
  return valueOk;
};

//does autocomplete abbreviation replacement
$.fn.abbrevReplace = function(mapping) {
  var value = this.val();
  var unabbreviated = mapping[abbrevMappingPrep(value)];
  if (typeof unabbreviated === "object") {
    //set value to new unabbreviated name
    value = unabbreviated.to;

    //replace with non-abbreviated version
    this.val(value);

    //make field check for validity now
    this.trigger("checkRequired");
  }
  return value;
};

//processes text for condensed clause display, highlights special chars
function processCondText(text, markInvalid) {
  //return right away if empty or falsy
  if (! text || ! text.length) {
    return text;
  }

  //if in stage for fc
  if (resolutionStage === 3) {
    //enclose ^_|* with bold colored span tags
    text = text.replace(/[_^|*]+/g, function(match) {
      //return enclosed in emphasis tags
      return "<span class='bold deep-orange lighten-3'>" + match + "</span>";
    });
  }

  //enclose in red text tags if marked as invalid
  if (markInvalid) {
    text = "<span class='red-text'>" + text + "</span>";
  }

  //return processed string
  return text;
}

//registers event handlers that are essential for the general function of the page
function registerEssentialEventHandlers(doLoad) {
  //we can only load from file or delete if we loaded the resolution
  if (doLoad) {
    $(".modal").on("reset", function(e) {
      e.stopPropagation();
      var elem = $(this);
      elem.find("input,textarea").trigger("reset");
      elem.find("#delete-action-confirm").hide();
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
      //no saving necessary, register to run after save completes
      onAllSaveDone(generatePdf);
    } else {
      //save json to server first
      serverSave(function() {
        //display pdf directly after generating
        generatePdf();
      });
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

  $("#hide-liveview-hint")
  .on("click", function(e) {
    //toggle visibility of liveview hint
    var clickText = $(this);
    var hint = $("#liveview-hint");

    //for both states, set visivility state and modify click text
    if (hint.is(":visible")) {
      hint.hide();
      clickText.text("[Show hint]");
    } else {
      hint.show();
      clickText.text("[Hide hint]");
    }

    //prevent following of link and scroll movement
    e.preventDefault();
  });

  //init selectors
  $("select").one("init", function() {
    //init select box
    $(this).material_select();
  });

  //setup amd if lv is enabled
  if (allowLV) {
    //the current amendment action type
    amdActionType = "noselection";

    //flag is set to true when an amendment can be displayed properly (clause and type selected)
    var amdDisplayable = false;

    //the current selected clause (in a clause-list), start with none
    //the amendment clone, not the original
    var amdClauseListSelection = $();

    //the top level clause in amdClauseListSelection
    var amdClauseElem = $();

    //the current original selected clause
    var amdOrigClause = $();

    //query elements
    var sponsorInput = $("#amd-spon");
    var applyAmdBtn = $("#amd-apply-btn");
    var rejectAmdBtn = $("#amd-reject-btn");
    var amdClauseWrapper = $("#amd-clause-wrapper");
    var amdNoSelectionMsg = $("#amd-no-selection");
    var amdTypeSelect = $("#amd-type-select-box");

    //define here for satisfaction of declaraton order prettiness
    var updateAmd;

    //if it is ok to reject or apply the amendment right now
    var amdActionBtnsEnabled = false;

    //updates the amd reject and apply button states
    var updateActionBtnState = function() {
      //check validitiy of amendments
      amdActionBtnsEnabled =
        //ok if amd is displayable
        amdDisplayable &&

        //check for filled phrase field
        amdClauseElem.find(".phrase-input").checkAutoCompValue(loadedData) &&

        //check that the sponsor is one of the sponsors allowed for that autocomplete field
        sponsorInput.checkAutoCompValue(loadedData);

      //apply state to buttons
      rejectAmdBtn.disabledState(! amdActionBtnsEnabled);
      applyAmdBtn.disabledState(! amdActionBtnsEnabled);
    };

    //send a saveAmd message abd then resets the amd display
    var saveAmd = function(saveType) {
      //validation has already been done, get amd update object
      var saveAmdUpdate = getAmendmentUpdate();

      //make sure we actually got something
      if (! saveAmdUpdate) {
        //error and stop; why is it falsy!?
        console.error("Got falsy amd update object while doing saveAmd update!");
        return;
      }

      //if in apply mode
      if (saveType === "apply") {
        //when in remove mode
        if (amdActionType === "remove") {
          //remove the specified clause from the resolution
          amdOrigClause.trigger("attemptRemove");

          //update all indexes
          $("#op-clauses > .clause-list > .clause").trigger("updateId");
        } else if (amdActionType === "change" || amdActionType === "replace") {
          //insert the amendment clause with the original clause
          amdClauseElem.insertAfter(amdOrigClause);

          //remove the orig clause
          amdOrigClause.trigger("attemptRemove");

          //update the id of the newly inserted clause
          amdClauseElem.trigger("updateId");
        } else if (amdActionType === "add") {
          //in add mode, simply append amd clause to op clauses
          $("#op-clauses > .clause-list > .add-clause-container").before(amdClauseElem)

          //update indexes
          .parent().children(".clause").trigger("updateId");
        } else {
          console.error("invalid action type found when doing saveAmd", amdActionType);
        }

        //set flag for made changes, amendment changed resolution
        changesSaved = false;
      } //in reject the amendment is just removed

      //send the saveAmd message and pass amd update object to use
      sendLVUpdate("saveAmd", saveType, saveAmdUpdate);

      //reset to no state selected
      amdTypeSelect.setSelectValueId("noselection");
      amdActionType = "noselection";

      //remove selected clause
      amdOrigClause = $();

      //clear sponsor field and update its label
      sponsorInput.val("").resetSiblingLabels();

      //update display but don't send another update
      updateAmd(true);
    };

    //called by sendLVUpdate in dataInteraction.js to generate the object that is sent to the server
    //and the liveview clients containing all information describing the current amendment
    getAmendmentUpdate = function(noData) {
      //no update when nothing there to update or no action is selected
      if (! amdClauseElem.length) {
        return false;
      }

      //add index of the current clause
      var clauseIndex;
      if (amdActionType === "add") {
        //update index of clause in add mode
        if (amdClauseElem.length === 1) {
          //sets the index of the current amendment clause element to one more than the current
          //amount of clauses
          amdClauseElem
            .children("h6").children(".clause-number")
            .text($("#op-clauses > .clause-list > .clause").length + 1);
        }
      } else {
        //use index of the original clause
        clauseIndex = amdOrigClause.index();

        //orig was removed if index is -1, the original clause was removed
        if (clauseIndex === -1) {
          //empty the orig clause to properly reset
          amdOrigClause = $();

          //call updateAmd to make clause look right
          updateAmd();

          //stop processing, will be called again once update is processed
          return;
        }

        //set index in amendment display, +1 for natural (1 based) counting in display
        amdClauseElem.children("h6").find(".clause-number").text(clauseIndex + 1);
      }

      //must be displayable and flag for update display only must not be set
      if (! amdDisplayable || noData) {
        //return false to not send an update as no type or no clause has been selected
        return false;
      }

      //start object with required fields
      var amdUpdate = {
        type: amdActionType,
        sponsor: sponsorInput.val().trim() //get value from input field
      };

      //attach index if present
      if (typeof clauseIndex !== "undefined") {
        amdUpdate.clauseIndex = clauseIndex;
      }

      //all types (add, change, replace) except for require a new clause to be specified
      if (amdActionType !== "remove") {
        //get amendment clause as object and allow empty fields (to display typing progress)
        amdUpdate.newClause = amdClauseElem.clauseAsObject(true);

        //change type doesn't need to specify oldClause (now obsolete) because the old clause can be
        //deducted from the passed clause index and the resolution the server keeps track of
      }

      //return object
      return amdUpdate;
    };

    //resets the amendment display with the current type and selected clause
    //also shows the no selection message if no clause is selected or the
    //selected clause has been removed in the mean time
    updateAmd = function(sendNoUpdate) {
      //trigger edit inactive on the current selection to avoid removing the eabs
      amdClauseListSelection.find(".clause").trigger("editInactive");

      //empty clause wrapper to remove any leftover from last amd display
      amdClauseWrapper.empty();

      //use new clause as selection if add type
      if (amdActionType === "add") {
        //add clause is first op clause, id is modified later and
        amdOrigClause = $("#op-clauses").children(".clause-list").children(".clause").eq(0);
      } //show no-selection-message if no clause is selected
      else if (! amdOrigClause.length) {
        //show message and hide amd clause container
        amdClauseWrapper.hide();
        amdNoSelectionMsg.show();
      }

      //displayable if a clause is given
      amdDisplayable = amdOrigClause.length === 1;

      //stop if not displayable
      if (! amdDisplayable) {
        //update action buttons
        updateActionBtnState();
        return;
      }

      //hide select message
      amdNoSelectionMsg.hide();

      //show clause container
      amdClauseWrapper.show();

      //move into amendment display section
      amdClauseListSelection = amdOrigClause
        //prevent cloning of eabs
        .trigger("editInactive")

        //clone the parent list, clause needs to be in list to make subclauses
        .parent(".clause-list")

        //clone clause list
        .clone(true, true);

      //extract add clause container
      var addClauseContainer = amdClauseListSelection
        .children(".add-clause-container")
        .clone(true, true);

      //and empty
      amdClauseListSelection
        .empty()

        //re-add the single clause we want
        .append(amdOrigClause.clone(true, true))

        //re-add clause container
        .append(addClauseContainer)

        //insert prepared list into wrapper
        .appendTo(amdClauseWrapper);

      //reinit tooltips on cloned elements
      amdClauseListSelection.cleanupClonedTooltips();

      //preselect main clause
      amdClauseElem = amdClauseListSelection.children(".clause");

      //disable if in remove mode to prevent editing, only display what will be removed
      if (amdActionType === "remove") {
        //by adding the disabled class the all contained input fields and textarea inputs
        amdClauseListSelection.find("input,textarea").attr("disabled", "");

        //mark clause as a whole as disabled, flag for event handlers of clause
        amdClauseElem.addClass("disabled-clause");
      } else {
        //reset to normal state if not remove type
        amdClauseListSelection.find("input,textarea").removeAttr("disabled");
        amdClauseElem.removeClass("disabled-clause");
      }

      //reset (and thereby empty) if add or replace type
      if (amdActionType === "add" || amdActionType === "replace") {
        //by triggering the reset event
        amdClauseElem.trigger("reset");
      } //change is the only other action type that doesn't reset the clause
      else if (amdActionType === "change") {
        //re-init the autocompleting phrase field
        amdClauseElem.find(".phrase-input").trigger("init");
      }

      //activate new amendment clause
      amdClauseElem.trigger("editActive");

      //update actions buttons now that clause is present
      updateActionBtnState();

      //send amendment update if allowed
      if (! sendNoUpdate) {
        sendLVUpdate("amendment");
      }
    };

    //amendment action type selection
    amdTypeSelect.on("change", function() {
      //update action type
      var newAmdActionType = $(this).getSelectValueId();

      //if change away from add, remove orig clause, because the reference is actually the first
      //clause but it wasn't selected as such
      if (amdActionType === "add" && newAmdActionType !== "add") {
        amdOrigClause = $();

        //no need to remove handler as the original clause was synthetic anyways
      }

      //set new action type as current
      amdActionType = newAmdActionType;

      //reset amendment display with new type
      updateAmd();
    });

    //eab amendment button
    $("#eab-amd")
    .on("click", function(e) {
      e.stopPropagation();

      //get parent clause
      var clause = $(this).closest(".clause");

      //only change if a different clause was chosen than the already selected clause
      //we need to compare the actual com objects here because the jquery object isn't persistent
      //doesn't aply in add mode, need to copy new in any case then
      if (amdActionType === "add" || amdOrigClause.get(0) !== clause.get(0)) {
        //update the selected clause object
        amdOrigClause = clause;

        //move the amendment display into view
        $("#amd-info").scrollIntoView();

        //cannot be add type if clause is selected
        if (amdActionType === "add") {
          amdTypeSelect.setSelectValueId("noselection");
          amdActionType = "noselection";
        }

        //reset amendment display with new clause
        updateAmd();
      }
    })
    .on("updateDisabled", function(e) {
      e.stopPropagation();

      //get closest enclosing clause
      var clause = $(this).closest(".clause");

      //only enabled if in top level op clause that isn't already in the amendment display
      $(this).disabledState(
        //must be op clause
        clause.attr("data-clause-type") !== "op" ||

        //must not be in amendment display
        clause.closest("#amd-clause-wrapper").length ||

        //must not be inside a sub clause list (be top level clause)
        clause.parent().hasClass("clause-list-sub")
      );
    });

    //sponsor field change
    sponsorInput.on("change", function() {
      //send amendment update
      sendLVUpdate("amendment");

      //update the reject and apply button states
      updateActionBtnState();
    });

    //update button state of change of phrase field in amendment display
    amdClauseWrapper.on("change", ".phrase-input", function() {
      //also update on change of phrase input
      updateActionBtnState();
    });

    //on clicking reject button
    rejectAmdBtn.on("click", function(e) {
      e.stopPropagation();

      //check that button was enabled
      if (! amdActionBtnsEnabled) {
        //illegal click
        console.error("illegal reject btn click");
        return;
      }

      //send a saveAmd message
      saveAmd("reject");
    });

    //on clicking apply amendment button
    applyAmdBtn.on("click", function(e) {
      e.stopPropagation();

      //check that button was enabled
      if (! amdActionBtnsEnabled) {
        //illegal click
        console.error("illegal apply btn click");
        return;
      }

      //send a saveAmd message
      saveAmd("apply");
    });
  }

  //the attribute selector, only allow one handler to be set
  if (accessLevel === "MA") {
    $("#attribute-select-box > select").one("init", function() {
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

        //proceed to submission if the value is truthy and selection thereby valid
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
    var elem = $(this);

    //get the autofill data that matches a selector in autofillInitData
    var foundData;
    for (var selector in loadedData.autofillInitData) {
      //if this element matches the selector, use that data
      if (elem.is(selector)) {
        //store data and stop looking
        foundData = loadedData.autofillInitData[selector];
        break;
      }
    }

    //if there actually was any data for this element
    if (foundData) {
      //get data from loadedData if it is string attrib reference
      if (typeof foundData === "string") {
        foundData = loadedData[foundData];
      }

      //prepare the autocomplete init options object, other settings are taken from autofillSettings
      var autoOpts = {
        //init the autocomplete on this field with the data for this field's autocomplete role
        data: foundData
      };

      //if this is a editor-relevant field that tracks changes and must be in a clause
      //do not send content updates for amendment display clauses, those are handled seperately
      if (elem.is(".clause .autocomplete")) {
        //attach a handler that makes a content update happen when a autocomplete field changes
        autoOpts.onAutocomplete = function() {
          sendLVUpdate("content", "autocomplete", elem);
        };
      }

      //init with prepared data and predefined settings
      elem.autocomplete($.extend(autoOpts, autofillSettings));
    } else { //there was no data for this element, error
      log({ msg: "no autocomplete data found for field", elem: this });
    }
  });
  $("input#forum-name")
  .on("change", function(e) {
    e.stopPropagation();

    //replace if there is unabbreviated version
    var elem = $(this);
    var value = elem.abbrevReplace(loadedData.forumMapping);

    //forum is now a valid name, check if it changed from the current mapping forum name
    //forum changed, update mappings: if change caused mapping update
    if (value !== loadedData.selectedForum) {
      //get outout from generator
      var newDataFor = loadedData.generateAutofillData(value);

      //if forums changed
      if (newDataFor.countries) {
        //re-init fields that use sponsor data
        //check chips and sponsor fields for validity with new sponsor data
        $("#main-spon, #co-spon, #amd-spon").triggerAll("init checkRequired");
      }

      //if phrases changed
      if (newDataFor.phrases) {
        //re-init op phrase autofill fields
        $("#op-clauses .phrase-input,#amd-clause-wrapper .phrase-input")
          .triggerAll("init checkRequired");
      }
    }
  });
  $("#main-spon, #amd-spon").on("change", function() {
    //replace if there is unabbreviated version
    var elem = $(this);
    elem.abbrevReplace(loadedData.countryMapping);
  });
  $("#main-spon").on("change", function() {
    //update chips on main sponsor change
    $("#co-spon").trigger("checkRequired");
  });
  $("input.required, textarea.required")
  .on("change", function() {
    //check again on changed value
    $(this).trigger("checkRequired");
  });
  var requiredContainers = $("#meta-data, #preamb-clauses, #op-clauses");
  requiredContainers.on("checkRequired", "input.required, textarea.required", function() {
    var elem = $(this);

    //change validation state to wether or not this field contains a correct value
    var valueOk = elem.checkAutoCompValue(loadedData);
    elem.classState(! valueOk, "invalid");

    //apply to global flag
    badFieldPresent = badFieldPresent || ! valueOk;
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
  $("textarea,input").not(".not-editor *")
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
  $("input:not(.not-editor *)")
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
    //removes other things than what we put there, like Grammarly stuff
    //this may be removed at some point when we get the cloning to work properly
    $(this)
      .siblings()
      .not("label, textarea")
      .detectManipulator();

    //cleanup textarea element
    $(this).removeAttr("data-gramm");
  });
  $(".chips#co-spon")
  .on("init", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //get already present data (re-init is happening if this is an object)
    var prevData = elem.material_chip("data");

    //init the chips thing with autocomplete options
    elem.material_chip({
      //chips prefilled data (loaded document)
      data: prevData || elem.getData().initData,

      //autocomplete options for the input field
      autocompleteOptions: $.extend({
        //have it use the correct autocomplete data
        data: loadedData.simpleCountryList,

        //don't send content updates for header information

        //other settings are taken from autofillSettings
      }, autofillSettings)
    });
  })
  .on("reset", function(e) {
    e.stopPropagation();
    $(this).val("");
    $(this).trigger("init");
  });
  requiredContainers
  .on("checkRequired", ".chips.required", function(e, advanceMode) {
    var elem = $(this);

    //get value of field
    var value = elem.material_chip("data");

    //keep track if value invalid
    var valueBad = false;

    //check for presence of values
    valueBad = ! (
      value && value.length &&
      (! advanceMode || value.length >= loadedData.minCoSponsors)
    );

    //color label according to status
    elem.siblings("label").classState(valueBad, "red-text");

    //check that all entries are ok sponsors in autofill data
    if (! valueBad) {
      var matchData = loadedData.countryMapping;

      //check all chips values for being included
      var mainSponsor = $("#main-spon").val().trim();
      valueBad = ! value.reduce(function(allOk, item, index) {
        //get tag item content
        var value = item.tag.trim();

        //must not be main sponsor and have an non-valid (not mapping) value in the data
        var isOk = value !== mainSponsor && matchData[value] === 1;

        //color-mark tag object
        elem.children(".chip:eq(" + index + ")").classState(! isOk, "red white-text");

        //return for validation of whole array
        return allOk && isOk;
      }, true) || valueBad;
    }

    //apply to global flag
    badFieldPresent = badFieldPresent || valueBad;
  });
  $(".chips.required")
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
    var elem = $(this);

    //clear fields
    elem
      .children(".phrase-input-wrapper,.clause-content,.clause-content-ext")
      .find("textarea,input")
      .trigger("reset");

    //re-hide extended clause content
    elem.children(".clause-content-ext").setHide(true);

    //update add-ext disabled state of eab in this clause
    elem
      .find("#eab-add-ext")
      .not(".clause-list-sub #eab-add-ext")
      .trigger("updateDisabled");

    //change made
    changesSaved = false;
  })
  .on("editActive click", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //prevent activation of disabled clauses or their children
    if (elem.closest(".disabled-clause").length) {
      //do not activate clause edit mode
      return;
    }

    //save to server if meta changes are unsaved (note that this is activation of the cause)
    if (! metaChangesSaved && autosaveEnabled) {
      //do autosave
      serverSave(null, false, true);
    }

    //activate by unhiding input fields and hiding condensed input
    elem.children(".clause-content, .phrase-input-wrapper").setHide(false);
    elem.children(".clause-ext-cond, .clause-cond").setHide(true);

    //get ext content element and unhide when if it has content
    var extContentElem = elem.children(".clause-content-ext");
    if (extContentElem.children("textarea").val().length) {
      extContentElem.setHide(false);
    }

    //make all other clauses inactive
    $(".clause").not(this).trigger("editInactive", true);

    //find the edit mode button for this clause (not descendants!)
    var editModeBtn = elem.children(".clause-title").children(".edit-mode-btn");

    //hide edit button
    editModeBtn
      .setHide(true)
      .before($("#eab-wrapper").show()); //show edit action buttons and move to clause

    //update eab button disable
    elem
      .find("#eab-wrapper")
      .children()
      .trigger("updateDisabled");

    //show add clause button if we're in a subclause (otherwise it's always visible)
    if (elem.isSubClause()) {
      elem.siblings(".add-clause-container").show();
    }
  })
  .on("editInactive", function(e, amdUpdatePossible, noExtCondUpdate) {
    e.stopPropagation();
    var elem = $(this);

    //get EABs
    var clauseTitle = elem.children(".clause-title");
    var eabs = clauseTitle.children("#eab-wrapper");

    //strip illegal characters and whitespace from textareas and inputs
    //this is done on the server as well, but we want to discourage this behavior in the user
    elem.find("textarea.required,input.required").filterIllegalContent();

    //get content ext field and cond
    var clauseExtCond = elem.children(".clause-ext-cond");
    var clauseContentExt = elem.children(".clause-content-ext");
    var contentExtVal = clauseContentExt.children("textarea").val();

    //if we are allowed to update, there is no ext content, but the ext content field was visible
    if (! noExtCondUpdate &&
        ! contentExtVal.length && ! clauseContentExt.hasClass("hide-this")) {
      //hide to include hidden in structure update
      clauseContentExt.setHide(true);

      //is either hidden by attemptRemove of subclause, or is just empty and thereby unused
      //send lv structure update to signal removal of unused ext content field
      sendLVUpdate("structure", "remext", elem);
    }

    //hide input fields
    elem.children(".clause-content, .clause-content-ext, .phrase-input-wrapper").setHide(true);

    //get condensed wrapper element
    var condensedWrapper = elem.children(".clause-cond");

    //show condensed
    condensedWrapper.setHide(false);

    //if there is ext content
    if (contentExtVal.length) {
      //fill ext content condensed with text from field and show
      clauseExtCond.html(processCondText(contentExtVal)).setHide(false);
    }

    //get text content
    var textContent = elem.children(".clause-content").children("textarea").val().trim();

    //if a phrase field is present
    var phraseFieldWrapper = elem.children(".phrase-input-wrapper");
    if (phraseFieldWrapper.length) {
      //get phrase input field
      var phraseField = phraseFieldWrapper.find("input");

      //put value into condensed element
      condensedWrapper.children(".cond-phrase")

        //mark as invalid if field has invalid class
        .html(processCondText(phraseField.val(), phraseField.hasClass("invalid")));

      //add space to content, between phrase and content
      textContent = " " + textContent;
    }

    //also move content into condensed content element
    condensedWrapper
      .children(".cond-content")
      .html(textContent.length && textContent !== " " ?
        processCondText(textContent) : textContent + "<em class='red-text'>no content</span>");

    //if they are present, we were in edit just now
    //stop if we were already not in edit mode
    if (! eabs.length) {
      return;
    }

    //hide edit action buttons and move to resting place
    eabs.hide().insertAfter($("#eab-inactive-anchor"));

    //trigger amd update on real inactivation, (not on just-making-sure inactivation)
    //amd diff update is too costly for server and clients to do for every keypress
    if (amdUpdatePossible && elem.closest("#amd-clause-wrapper").length) {
      sendLVUpdate("amendment", "inactivation");
    }

    //show edit button to make switch to edit mode possible again
    clauseTitle.children(".edit-mode-btn").setHide(false);

    //hide add clause button if we're a subclause
    if (elem.isSubClause()) {
      elem.siblings(".add-clause-container").hide();
    }

    //only check if message wasn't displayed yet
    if (! displayedPhraseContentMessage) {
      //get text of textarea
      var clauseContent = elem
        //get the textarea
        .children(".clause-content")
        .children("textarea")

        //get and prepare the content for processing
        .val()
        .trim()
        .toLowerCase();

      //get the list of phrases that applies to this clause
      var phrases = loadedData.phrases[elem.attr("data-clause-type")];

      //check if the content text area includes a phrase
      if (phrases.some(function(phrase) {
        //return true if it starts with the phrase
        return clauseContent.indexOf(phrase.toLowerCase()) === 0;
      })) {
        //display message concerning phrase field
        makeAlertMessage("info", "Phrase found in content field", "OK",
          "The editor has detected that a clause content field in this resolution begins" +
          " with a phrase. Please use the content text area only for the clause content and not" +
          " the phrase of the clause. The text input field labeled 'Phrase' will suggest " +
          " possible phrases when you start typing. This message will only be displayed once.");

        //set flag to disabling state
        displayedPhraseContentMessage = true;
      }
    }

    //auto-save if not at stage 0 and has unsaved changes
    //no alert message on fail, only red marks
    if (! changesSaved && ! noChangesMade && autosaveEnabled) {
      //do autosave
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
    var elem = $(this);

    //tries to remove this clause
    if (elem.clauseRemovable()) {
      //inactivate to make eab go away
      elem.trigger("editInactive");

      //save parent
      var parent = elem.parent();

      //check if this clause is the last subclause in its list
      if (parent.children(".clause").length === 1) {
        //get enclosing clause
        var clause = parent.closest(".clause");

        //remove continuation content from parent and add onto normal clause content
        var extField = clause
          .children(".clause-content-ext")
          .setHide(true)
          .children("textarea");
        var contentField = clause.children(".clause-content").children("textarea");
        contentField.val(contentField.val().trim() + " " + extField.val().trim());

        //trigger autoresize on modified field
        contentField.trigger("autoresize");

        //clear ext field
        extField.trigger("reset");

        //hide ext content condensed field on parent and trigger inactivation to update cond fields
        var parentClause = parent.parent();
        parentClause.children(".clause-ext-cond").setHide(true);
        parentClause.trigger("editInactive", [false, true]);
      }

      //remove this clause
      elem.remove();

      //update ids of other clauses around it
      parent.children(".clause").trigger("updateId");

      //made changes
      changesSaved = false;

      //send structure update, use parent as given element because this clause is now gone
      sendLVUpdate("structure", "remove", parent);
    }
  })
  .on("fromLoadedData", function(e) {
    e.stopPropagation();

    //fill with data
    var elem = $(this);
    var data = elem.getData().loadedData;

    //fill phrase field if present
    if ("phrase" in data) {
      elem
        .children(".phrase-input-wrapper")
        .find("input")
        .val(data.phrase)
        .trigger("activateLabel");
    }

    //fill the content field
    elem
      .children(".clause-content")
      .children("textarea")
      .val(data.content)
      .triggerAll("activateLabel keyup");

    //add subclause data if given
    if ("sub" in data) {
      //make subclause list, give data and trigger to continue
      elem.addSubClause(false);
      var subclauseList = elem.find(".clause-list-sub");
      subclauseList.getData().loadedData = data.sub;
      subclauseList.trigger("fromLoadedData");

      //also add ext data if given
      if (data.contentExt) {
        elem
          .children(".clause-content-ext")
          .setHide(false)
          .children("textarea")
          .val(data.contentExt)
          .triggerAll("activateLabel autoresize");
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
    var elem = $(this);

    //only respond if button itself was clicked and not just the enclosing div
    if ($(e.target).is("a")) {
      //add clause in enclosing list
      elem.addClause(1, true);

      //send structure update
      sendLVUpdate("structure", "add", elem.parent());
    }
  });
  $(".edit-mode-btn")
  .on("click", function(e) {
    e.stopPropagation();

    //get current clause we are in
    var thisClause = $(this).closest(".clause");

    //set edit mode for this clause to true
    thisClause.trigger("editActive");

    //update the disabled state of movement buttons
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
    sendLVUpdate("structure", "move", clause);
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
    sendLVUpdate("structure", "move", clause);
  })
  .on("updateDisabled", makeEabMoveUpdateDisabledHandler(true));
  $("#eab-add-sub")
  .on("click", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //get enclosing clause and make inactive to prevent cloning of eab and add subclause
    var clause = elem.closest(".clause");
    clause.addSubClause(true);

    //send structure update
    sendLVUpdate("structure", "makesub", clause);
  })
  .on("updateDisabled", function(e) {
    e.stopPropagation();

    //set disabled state according to whether or not a subclause can be added
    $(this).disabledState(! $(this).canReceiveSubclause());
  });
  $("#eab-add-ext")
  .on("click", function(e) {
    e.stopPropagation();
    var elem = $(this);

    //un-hide extended clause content field
    var clause = elem.closest(".clause").children(".clause-content-ext").setHide(false);

    //make disabled after action performed
    elem.disabledState(true);

    //send structure update
    sendLVUpdate("structure", "addext", clause);
  })
  .on("updateDisabled", function(e) {
    e.stopPropagation();

    //set disabled state according to whether or not a subclause can be added
    //also can't un-hide again (disabled if visible)
    var clause = $(this).closest(".clause");
    $(this).disabledState(
      ! clause.find(".clause").length || //disable if doesn't already have subclause
      clause.children(".clause-content-ext:visible").length); //disable if already there
  });
  $("#eab-clear")
  .on("click", function(e) {
    e.stopPropagation();
    var clause = $(this).closest(".clause").trigger("clear");

    //send structure update because ext cont is removed
    sendLVUpdate("structure", "clear", clause);
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
    $(this).closest(".clause").trigger("editInactive", true);
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

    //display message before triggering save on clauses, will probably be in saved state afterward
    if (changesSaved) {
      displayToast("Already saved");
    } else {
      //save message
      displayToast("Saving");
    }

    //finalize editing on all fields
    $(".clause").trigger("editInactive");

    //save to server if still not everything saved
    if (! changesSaved) {
      //save json to server first
      serverSave(null, true);
    }
  });
  $("#delete-action-confirm")
  .on("click", function(e) {
    e.stopPropagation();

    //send the delete request
    $.post("/resolution/delete/" + resolutionToken, { code: resolutionCode }, function() {
      //go back to front page
      location.href = "/";
    });
  });
  $("#action-delete")
  .on("click", function(e) {
    e.stopPropagation();

    //ask for confirmation
    makeAlertMessage(
      "delete_forever", "Really Delete?!", "Keep",
      function(contentBody, modal) {
        //set text
        contentBody.html(
          "Are you really sure you want to delete this resolution forever? It will be gone" +
          " and all its content lost forever. <br>Only use this option if the resolution contains" +
          " content that clearly violates the <a href='/help/contentguidelines'>content" +
          " guidelines</a>! Just leave it be if it was created accidentally or filled with" +
          " random key smashing.");

        //show button
        modal.find("#delete-action-confirm").show();
      });
  });
}

//converts an array of strings into an object with each string as a null prop
function convertPropObj(orig) {
  //convert to prop object
  var obj = {};
  orig.forEach(function(str) {
    //prop add, 1 signals ok value
    obj[str] = null;
  });
  return obj;
}

//prepares string for lookup in abbreviation mapping
function abbrevMappingPrep(str) {
  //lower case and remove other chars
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "");
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

  //get stage of resolution
  resolutionStage = parseInt($("#resolution-stage").text(), 10);

  //check for chair or admin access
  accessLevel = $("#code-access-level").text();

  //autosave is aenabled if at non 0 stage
  autosaveEnabled = resolutionStage > 0;

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

  //if chair, sg or master access, liveview allowed
  allowLV =
    ! resolutionAttributes.readonly && (
    resolutionStage === 6 && (accessLevel === "CH" || accessLevel === "SG") ||
    resolutionStage === 10 && accessLevel === "SG") ||
    resolutionStage && accessLevel === "MA";

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
      //if in stage 1, check co sponsor amount
      if (resolutionStage === 1) {
        //validate resolution
        checkRequiredFields(true);

        //stop if invalid
        if (badFieldPresent) {
          return false;
        }
      }

      //return true right away if we're not at a voting/lv stage
      if (! (resolutionStage === 6 || resolutionStage === 10)) {
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
    //load external sponsor and forum ext data and phrases
    $.getJSON("/extData")
    .fail(function(xhr, status, error) {
      //log the error we have with getting the data
      log({ msg: "error loading autofill data", status: status, err: error });
      makeAlertMessage(
        "error_outline", "Error loading necessary data!", "ok",
        "Failed to download data! Check the console for more info." +
        " Please file a " + bugReportLink("data_load_fail") + " and describe this problem." +
        "(The editor won't work until you reload the page and the data is downloaded)",
        "data_load_fail");
    })
    .done(function(extData) {
      //data object to pass to event handlers
      var loadedData = {};

      //maps from forum abbreviation to name and has forum object for real names, allows value check
      loadedData.forumMapping = { };
      loadedData.forumAutofill = { };

      //for all forums
      for (var forumId in extData.forumsFlat) {
        //get the current forum
        var forum = extData.forumsFlat[forumId];

        //create mapping to name for abbr
        loadedData.forumMapping[abbrevMappingPrep(forum.abbr)] = { to: forum.name };

        //signal ok with forum object
        loadedData.forumMapping[forum.name] = forum;

        //create null props for autofill
        loadedData.forumAutofill[forum.abbr] = null;
        loadedData.forumAutofill[forum.name] = null;
      }

      //mapping (like forumMapping) from alt names to id name, id name has value 1
      loadedData.countryMapping = { };
      loadedData.countryAutofill = { };

      //list of countries autocomplete format, only allowed named as no replacing happens in chips
      loadedData.simpleCountryList = { };

      //original regular and sc extended op phrases
      var opPhrases = {
        regular: extData.op,
        sc: extData.op.concat(extData.scop)
      };

      //plain phrase lists
      loadedData.phrases = {
        preamb: extData.preamb

        //op is added by generateAutofillData
      };

      //generate prefix combinations
      var phrases, prefixes, phrase, phraseIndex, prefixIndex, phrasesLength;
      [{
        phrases: opPhrases.regular,
        prefixType: "op"
      }, {
        phrases: opPhrases.sc,
        prefixType: "op"
      }, {
        phrases: loadedData.phrases.preamb,
        prefixType: "preamb"
      }].forEach(function(phraseGenConfig) {
        //get list of phrases
        phrases = phraseGenConfig.phrases;

        //get list of prefixes for this type of phrase
        prefixes = extData.prefix[phraseGenConfig.prefixType] || [];

        //for all phrases
        for (phraseIndex = 0, phrasesLength = phrases.length;
             phraseIndex < phrasesLength; phraseIndex ++) {
          //get current phrase
          phrase = phrases[phraseIndex];

          //change first char to lower case
          phrase = phrase[0].toLowerCase() + phrase.substr(1);

          //for all phrase prefixes
          for (prefixIndex = 0; prefixIndex < prefixes.length; prefixIndex ++) {
            //add prefixed phrase to list of phrases for this type
            phrases.push(prefixes[prefixIndex] + " " + phrase);
          }
        }
      });

      //object ref converted for autofill op phrases
      var opPhrasesConverted = {
        regular: convertPropObj(opPhrases.regular),
        sc: convertPropObj(opPhrases.sc)
      };

      //function that generates country name mappings for a given selected forum name in loadedData
      loadedData.generateAutofillData = function(selectedForum) {
        //get selected forum object
        var forumCountries = loadedData.forumMapping[selectedForum];

        //keeps track of what things changed
        var newDataFor = {
          countries: false,
          phrases: false
        };

        //stop if not present
        if (forumCountries) {
          //get list of countries
          forumCountries = forumCountries.countries;
        } else {
          //nothing changed
          return newDataFor;
        }

        //save minimum amount of required co-sponsors (20%)
        loadedData.minCoSponsors = Math.ceil(0.2 * forumCountries.length);

        //set the name of the forum these country mappings are for
        loadedData.selectedForum = selectedForum;

        //forum changed, this function is only called on forum change
        newDataFor.countries = true;

        //generate mapping for all countries of this forum, reset to flush old values
        loadedData.countryMapping = { };
        loadedData.countryAutofill = { };
        loadedData.simpleCountryList = { };

        //for all countries of this forum
        forumCountries.forEach(function(countryId) {
          //get country object
          var country = extData.countriesFlat[countryId];

          //add full and placard name as mapping to real name
          loadedData.countryMapping[abbrevMappingPrep(country.placardname)] = { to: country.name };
          loadedData.countryMapping[abbrevMappingPrep(country.fullname)] = { to: country.name };

          //id name maps to 1 for signaling ok name
          loadedData.countryMapping[country.name] = 1;

          //create null props for autofill
          loadedData.countryAutofill[country.placardname] = null;
          loadedData.countryAutofill[country.fullname] = null;
          loadedData.countryAutofill[country.name] = null;

          //also add to simple autofill list
          loadedData.simpleCountryList[country.name] = null;
        });

        //check if forum is allowed to use sc phrases, if is part of scop forums
        var scForum = extData.scopForums.indexOf(selectedForum) !== -1;

        //if situation changed
        if (loadedData.scForum !== scForum) {
          //update state for next run
          loadedData.scForum = scForum;

          //get the current op phrases to use
          var useOpPhrases = scForum ? opPhrases.sc : opPhrases.regular;

          //set op phrase list in loadedData.phrases
          loadedData.phrases.op = useOpPhrases;

          //set op phrases in loadedData for reference lookup
          loadedData.opPhrases = useOpPhrases;

          //also set converted op phrases
          loadedData.opPhrasesConverted =
            scForum ? opPhrasesConverted.sc : opPhrasesConverted.regular;

          //updated data
          newDataFor.phrases = true;
        }

        //return change state
        return newDataFor;
      };

      //mapping between raw autofill data and input field selectors
      loadedData.autofillDataMapping = {
        "#main-spon,#co-spon,#amd-spon": "countryMapping", //only reference
        "#forum-name": loadedData.forumMapping, //use mapping object
        "#preamb-clauses .phrase-input": loadedData.phrases.preamb,
        "#op-clauses .phrase-input,#amd-clause-wrapper .phrase-input": "opPhrases",
      };

      //data used to inititalize autocomplete fields/thingies and their other options
      loadedData.autofillInitData = {
        "#main-spon,#amd-spon": "countryAutofill", //only reference
        "#forum-name": loadedData.forumAutofill,
        "#preamb-clauses .phrase-input": convertPropObj(loadedData.phrases.preamb),
        "#op-clauses .phrase-input,#amd-clause-wrapper .phrase-input": "opPhrasesConverted",
      }; //co sponsor chips gets data on its own

      //register all event handlers
      registerEssentialEventHandlers(true);
      registerEventHandlers(loadedData);

      //if not in stage 0 (there is something to load from the server)
      if (resolutionStage) {
        //trigger all init events that can be triggered before loading the resolution
        //init is triggered on .chips in serverLoad after settign the data it should contain
        $("*:not(.autocomplete, .chips)").trigger("init");

        //initiate loading of resolution from server with preset token
        serverLoad(resolutionToken, true, function(initForum) {
          //don't send update if still loading,
          //some events may be fake-fired in the process of getting data into the clauses
          $(".clause input, .clause textarea")
          .on("paste keyup", function() {
            //send content update
            sendLVUpdate("content", "type", $(this));
          });

          //create country mappings and phrases with forum
          loadedData.generateAutofillData(initForum);

          //init autocomplete fields now, they require to be already in their final positions
          //to detect the correct dataset to use for completion,
          //the forum is also necessary to create the correct country autofill data
          $(".autocomplete, #co-spon").trigger("init");
        });
      } else {
        //trigger init on all
        $("*").trigger("init");

        //activate the first preamb clause as a starting point
        $("#preamb-clauses").find(".clause").trigger("editActive");

        //start timer for save reminder
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

      //if as MA or at stage 6/10 and authorized as CH/SG, start liveview editor websocket
      if (allowLV) {
        //disable autosave for liveview, we don't want to be accidentally saving a undesired state
        autosaveEnabled = false;

        //give token and code, false for being editor type client
        startLiveviewWS(false, resolutionToken, resolutionCode, function(type, newSendStatus) {
          //act on update
          if (type === "sendUpdates") {
            //if now set to true and previously false,
            //send structure update to catch server up on made changes
            if (! sendLVUpdates && newSendStatus) {
              sendLVUpdates = true;
              sendLVUpdate("structure", "catchup");
            }

            //copy value and use a new current
            sendLVUpdates = newSendStatus;
          } else if (type === "disconnect") {
            //set send updates to false because we want to resend after connection failure
            sendLVUpdates = false;
          }
        });
      }

      //check if localStorage is supported and no flag is found
      if (typeof localStorage !== "undefined" && ! localStorage.getItem("helppagehint")) {
        //set to false when an error happens while setting the flag in the local storage
        //we won't display the hint if we can't prevent it
        //from being shown every time the page is reloaded
        var canSetFlag = true;

        //set the flag
        try {
          localStorage.setItem("helppagehint", "ok");
        } catch (e) {
          //didn't manage to set the flag
          canSetFlag = false;
        }

        //display the help page hint if we were able to set the flag
        if (canSetFlag) {
          //provide links to help page and formatting section
          makeAlertMessage(
            "help", "Read the Help Page", "I'm informed now",
            "It is strongly recommended for all users who have't yet accustomed themselves to" +
            " this editor to read the <a href='/help'>help page</a> before writing a resolution." +
            " Specifically, the section <a href='/help#formatting'>Formatting Advice and Special" +
            " Characters</a> helps to avoid confusion that arises from special syntax and" +
            " disallowed characcters. Read the help page before asking any questions about how" +
            " to use the editor. This message will only be displayed once.");
        }
      }
    });
  }
});
