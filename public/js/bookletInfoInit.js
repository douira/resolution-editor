/*jshint esversion: 5, browser: true, varstmt: false, jquery: true */
/*global
makeAlertMessage,
displayToast*/

//gets the enclosing resolution collection item
$.fn.getResItem = function() {
  //return closest ancestor that is a collection item
  return this.closest("li.collection-item");
};

//sets the class status for an element and given class
$.fn.classStatus = function(useClass, status) {
  //add or remove depening on passed status
  this[status ? "addClass" : "removeClass"](useClass);
};

//on document ready
$(document).ready(function() {
  //there are three states: not rendered, rendering, pdf not viewed (clicking goes back to stage 1)
  //the button can also be disabled when wrong data has been entered
  var renderState = "disabled"; //unrendered, rendering, rendered, disabled

  //true when there are changes that haven't been saved to the server
  var unsavedChanges = false;

  //get booklet id
  var bookletId = $("#booklet-id").text();

  //query elements
  var titleInput = $("#title-input");
  var sessionInput = $("#session-input");
  var saveBtn = $("#save-btn");
  var printBtn = $("#print-btn");
  var printBtnInner = $("#print-btn-inner");
  var printBtnText = $("#print-btn-text");
  var printBtnIcon = printBtnInner.find("i");
  var renderingSpinner = $("#pdf-wait-spinner");
  var eligibleList = $("#eligible-list");
  var selectedList = $("#selected-list");
  var saveMsg = $("#unsaved-changes-msg");
  var selectedListEmptyMsg = $("#selected-list + .no-cotent-msg");
  var selectedResIconsTemplate = $("#icon-block-template .selected-icons");

  //preselect signature info elements in groups
  var sigGroups = $("#sig-list .sig-field-group").map(function() {
    //return object of both input fields
    var elem = $(this);
    return {
      nameInput: elem.find("input.sig-name"),
      posInput: elem.find("input.sig-pos")
    };
  }).get();

  //register that a change has been made to the booklet
  function madeChange() {
    //set flag
    unsavedChanges = true;

    //set render state to unrendered
    //but don't set if set as disabled, update list re-enabled when allowed
    if (renderState !== "disabled") {
      setRenderState("unrendered");
    }

    //enable save button and message
    saveBtn.removeClass("disabled");
    saveMsg.removeClass("hide-this");
  }

  //saves the current state of the booklet to the server
  function saveBooklet() {
    //no action if all changes already saved
    if (! unsavedChanges) {
      //return already resolved promise
      return $.Deferred().resolve().promise();
    }

    //get data for booklet
    var bookletData = {
      //the title and session strings
      title: titleInput.val().trim(),
      session: sessionInput.val().trim(),

      //map signatures from input values
      signatures: sigGroups.map(function(group) {
        //get values from elements
        return {
          name: group.nameInput.val().trim(),
          position: group.posInput.val().trim()
        };
      }),

      //get all selected resolutions
      resolutions: selectedList.find(".token").map(function() {
        //map to token string
        return $(this).text();
      }).get()
    };

    //remove the eigth signature if it's empty
    var lastSignature = bookletData.signatures[7];
    if (! (lastSignature.name.length && lastSignature.position.length)) {
      //remove from signatures
      delete bookletData.signatures[7];
    }

    //send data to server and return promise
    return $.post("/list/booklet/save/" + bookletId, bookletData).done(function() {
      //reset flag
      unsavedChanges = false;

      //reset save button to all changes saved and hide message
      saveBtn.addClass("disabled");
      saveMsg.addClass("hide-this");

      //display feeback toast message
      displayToast("Saved Booklet");
    }).fail(function() {
      //display error message
      makeAlertMessage(
        "error_outline", "Error saving Booklet", "ok",
        "The server encountered an error while saving the booklet." +
        " Ask IT-Management for help if this problem persists after" +
        " reloading the page.", "pdf_gen");
    });
  }

  //sets the render state and updates UI elements
  function setRenderState(newState) {
    //set new state
    renderState = newState;

    //depending on new state
    switch (newState) {
      case "unrendered":
        //make enabled and set flat style to display action is ready
        printBtn.removeClass("disabled btn").addClass("btn-flat");

        //set text to display that a render will happen on hover
        printBtnText.text("Hover to Generate PDF");

        //set correct icon
        printBtnIcon.text("refresh");
        break;
      case "rendering":
        //show spinner and hide regular text
        renderingSpinner.removeClass("hide-this");
        printBtnInner.addClass("hide-this");
        break;
      case "rendered":
        //hide rendering spinner and show regular text
        renderingSpinner.addClass("hide-this");
        printBtnInner.removeClass("hide-this");

        //set normal button style (action requires click)
        printBtn.removeClass("btn-flat").addClass("btn")

        //and set url to pdf
        .attr("href", "/rendered/booklet" + bookletId + ".pdf");

        //set text and icon to display rendering done
        printBtnText.text("View PDF");
        printBtnIcon.text("print");
        break;
      case "disabled":
        //set text to display function of button
        printBtnText.text("Generate PDF");

        //and set default disabled style
        printBtn.addClass("disabled btn").removeClass("btn-flat");

        //hide spinner in case it was there and show normal display text
        renderingSpinner.addClass("hide-this");
        printBtnInner.removeClass("hide-this");

        //set disabled icon
        printBtnIcon.text("do_not_disturb");
        break;

      //bad state given
      default:
        console.error("Bad render state given", newState);
        break;
    }
  }

  //updates the display of the no content message and the collection list
  function updateListDisplay() {
    //get the selected resolution items
    var selectedRes = selectedList.children();

    //check if the list if empty
    var listLength = selectedRes.length;

    //show and hide depending on list empty status
    if (listLength) {
      selectedListEmptyMsg.addClass("hide-this");
      selectedList.removeClass("hide-this");
    } else {
      selectedListEmptyMsg.removeClass("hide-this");
      selectedList.addClass("hide-this");
    }

    //check if the resolution can be printed
    //must have at least one resolution and all resolutions in stage range [7, 9]
    if (listLength && selectedRes.get().every(function(el) {
      //get the stage of this resolution item
      var stage = parseInt($(el).find(".res-stage").text());

      //when the stage matches the range
      return stage >= 7 && stage <= 9;
    })) {
      //reset to renderable if still disabled
      if (renderState === "disabled") {
        setRenderState("unrendered");
      }
    } else {
      //disable rendering
      setRenderState("disabled");
    }
  }

  //handle mouseenter (like hover) and click of view pdf button
  printBtn
  .on("mouseenter", function() {
    //if no resolutions are selected
    //if the booklet hasn't been rendered yet
    if (renderState === "unrendered") {
      //move into rendering stage (with spinner)
      setRenderState("rendering");

      //save first
      saveBooklet().done(function() {
        //ask the server to render
        $.get("/list/booklet/renderpdf/" + bookletId).always(function() {
          //finished rendering, sets url
          //on fail: maybe there is a older pdf to look at
          setRenderState("rendered");
        }).fail(function() {
          //display error and and help directives
          makeAlertMessage(
            "error_outline", "Error generating PDF", "ok",
            "The server encountered an error while trying to generate the requested" +
            " PDF file. This may happen when a resolution includes illegal characters or" +
            " some attribute of the booklet is invalid." +
            " Please talk to the owner of this document and ask IT-Management for help if" +
            " this problem persists.", "pdf_gen_booklet");
        });
      });
    }
  })
  .on("click", function(e) {
    /*when the open pdf button is clicked and opened the pdf,
    go back to unrendered bcause one of the resolutions might have changes,
    we're not reporting resolution changes but the server does regard them internally
    when deciding wether or not to actually re-render the booklet*/
    if (renderState === "rendered") {
      //blur to remove focus that makes it go dark
      printBtn.blur();

      //move back to unrendered
      setRenderState("unrendered");
    } else {
      //prevent following link, there is nothing valid to look at
      e.preventDefault();
    }
  });

  //change of any input
  $("input").on("change", function() {
    //register change
    madeChange();
  });

  //clicking save button
  saveBtn.on("click", function() {
    //do save (will not save if nothing to save)
    saveBooklet();
  });

  //clicking on eligible resolution makes it become selected
  eligibleList.on("click", "li.collection-item:not(.selected-res)", function() {
    var elem = $(this);

    //move a copy to the selected resolutions
    elem
      .clone()
      .appendTo(selectedList)

      //add ui icons
      .append(selectedResIconsTemplate.clone())

      //remove the icons meant for selection status display
      .find(".eligible-icons")
      .remove();

    //update the no content message status
    updateListDisplay();

    //make eligible item selected
    elem.addClass("selected-res");

    //register a change (resolution added)
    madeChange();
  });

  //action handlers on selected resolutions
  selectedList

  //remove from list by clicking the x icon
  .on("click", ".remove-icon", function() {
    //get item and token to unselect
    var item = $(this).getResItem();
    var token = item.find(".token").text();

    //remove resolution from list
    item.remove();

    //unselect eligible resolution with token of removed item
    eligibleList
      .find(".token:contains(" + token + ")")
      .getResItem()
      .removeClass("selected-res");

    //update the list display (length changed)
    updateListDisplay();

    //register a change (resolution removed)
    madeChange();
  })

  //move down list in clicking down icon
  .on("click", ".down-icon", function() {
    //insert below next sibling
    var item = $(this).getResItem();
    item.insertAfter(item.next());

    //changes were probably made
    madeChange();
  })

  //move up list in clicking up icon
  .on("click", ".up-icon", function() {
    //insert above previous sibling
    var item = $(this).getResItem();
    item.insertBefore(item.prev());

    //changes were probably made
    madeChange();
  });

  //do initial check of selected resolution list
  updateListDisplay();

  //register do you want to leave message
  $(window)
  .on("beforeunload", function(e) {
    //halt close if flag set that there are unsaved changes
    if (unsavedChanges) {
      e.preventDefault();

      //try to send a message to the user, the default from the browser is fine too though
      return "You have unsaved changes that will be lost if you proceed!" +
        "Press the 'Save Changes' button to save the booklet state.";
    }
  });
});
