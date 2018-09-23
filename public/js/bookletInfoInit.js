/*global makeAlertMessage, displayToast*/

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
$(document).ready(() => {
  //there are three states: not rendered, rendering, pdf not viewed (clicking goes back to stage 1)
  //the button can also be disabled when wrong data has been entered
  let renderState = "disabled"; //unrendered, rendering, rendered, disabled

  //true when there are changes that haven't been saved to the server
  let unsavedChanges = false;

  //last saved booklet state
  let savedBookletState;

  //current booklet state
  let currentBookletState;

  //get booklet id
  const bookletId = $("#booklet-id").text();

  //query elements
  const elems = {
    titleInput: $("#title-input"),
    sessionInput: $("#session-input"),
    saveBtn: $("#save-btn"),
    printBtn: $("#print-btn"),
    printBtnInner: $("#print-btn-inner"),
    printBtnText: $("#print-btn-text"),
    renderingSpinner: $("#pdf-wait-spinner"),
    eligibleList: $("#eligible-list"),
    selectedList: $("#selected-list"),
    saveMsg: $("#unsaved-changes-msg"),
    selectedListEmptyMsg: $("#selected-list + .no-cotent-msg"),
    selectedResIconsTemplate: $("#icon-block-template .selected-icons")
  };
  elems.printBtnIcon = elems.printBtnInner.find("i");

  //preselect signature info elements in groups
  const sigGroups = $("#sig-list .sig-field-group").map(function() {
    //return object of both input fields
    const elem = $(this);
    return {
      nameInput: elem.find("input.sig-name"),
      posInput: elem.find("input.sig-pos")
    };
  }).get();

  //sets the render state and updates UI elements
  const setRenderState = newState => {
    //set new state
    renderState = newState;

    //depending on new state
    switch (newState) {
      case "unrendered":
        //make enabled and set flat style to display action is ready
        elems.printBtn.removeClass("disabled btn").addClass("btn-flat");

        //set text to display that a render will happen on hover
        elems.printBtnText.text("Hover to Generate PDF");

        //set correct icon
        elems.printBtnIcon.text("refresh");
        break;
      case "rendering":
        //show spinner and hide regular text
        elems.renderingSpinner.removeClass("hide-this");
        elems.printBtnInner.addClass("hide-this");
        break;
      case "rendered":
        //hide rendering spinner and show regular text
        elems.renderingSpinner.addClass("hide-this");
        elems.printBtnInner.removeClass("hide-this");

        //set normal button style (action requires click)
        elems.printBtn.removeClass("btn-flat").addClass("btn")

        //and set url to pdf
        .attr("href", `/rendered/booklet${bookletId}.pdf?c=${Date.now()}`);

        //set text and icon to display rendering done
        elems.printBtnText.text("View PDF");
        elems.printBtnIcon.text("print");
        break;
      case "disabled":
        //set text to display function of button
        elems.printBtnText.text("Generate PDF");

        //and set default disabled style
        elems.printBtn.addClass("disabled btn").removeClass("btn-flat");

        //hide spinner in case it was there and show normal display text
        elems.renderingSpinner.addClass("hide-this");
        elems.printBtnInner.removeClass("hide-this");

        //set disabled icon
        elems.printBtnIcon.text("do_not_disturb");
        break;
    }
  };

  //reads the state of the booklet ui
  const getBookletState = () => {
    //construct object with data
    const data = {
      //the title and session strings
      title: elems.titleInput.val().trim(),
      session: elems.sessionInput.val().trim(),

      //map signatures from input values and get values from elements
      signatures: sigGroups.map(group => ({
        name: group.nameInput.val().trim(),
        position: group.posInput.val().trim()
      })),

      //get all selected resolutions
      resolutions: elems.selectedList.find(".token").map(function() {
        //map to token string
        return $(this).text();
      }).get()
    };

    //remove the eigth signature if it's empty
    const lastSignature = data.signatures[7];
    if (! (lastSignature.name.length || lastSignature.position.length)) {
      //remove from signatures
      delete data.signatures[7];
    }

    //return created booklet data
    return data;
  };

  //checks if objects are the same, expects structure to stay identical
  const objectsDiffer = (a, b) => {
    //check all props
    for (const prop in a) {
      //get values of prop
      const aValue = a[prop];
      const bValue = b[prop];

      //is another object
      if (typeof aValue === "object") {
        //if is array, check lengths
        if (aValue instanceof Array && aValue.length !== bValue.length) {
          return true;
        }

        //check recursively
        const result = objectsDiffer(aValue, bValue);

        //return immediately if truthy
        if (result) {
          return true;
        }
      } else if (aValue !== bValue) { //compare values directly
        //unsaved change present
        return true;
      }
    }

    //if nothing returns until now, no change was detected
    return false;
  };

  //sets the save state
  const setSaveState = saved => {
    //enable save button and message
    elems.saveBtn.classStatus("disabled", saved);
    elems.saveMsg.classStatus("hide-this", saved);

    //set render state
    //but don't set if set as disabled, update list re-enabled when allowed
    if (renderState !== "disabled") {
      //set to unrendered no matter what, resolutions may have changed in the mean time
      setRenderState("unrendered");
    }
  };

  //register that a change has been made to the booklet
  const madeChange = () => {
    //get data for booklet
    currentBookletState = getBookletState();

    //check if saved and current states differ
    unsavedChanges = objectsDiffer(currentBookletState, savedBookletState);

    //set save state depending on unsaved changes present
    setSaveState(! unsavedChanges);
  };

  //saves the current state of the booklet to the server
  const saveBooklet = () => {
    //no action if all changes already saved
    if (! unsavedChanges) {
      //return already resolved promise
      return $.Deferred().resolve().promise();
    }

    //send data to server and return promise
    return $.post(`/list/booklet/save/${bookletId}`, currentBookletState).done(() => {
      //reset flag
      unsavedChanges = false;

      //copy over current state to last saved state as we just saved the current one
      savedBookletState = currentBookletState;

      //set display as saved
      setSaveState(true);

      //display feeback toast message
      displayToast("Saved Booklet");
    }).fail(() =>
      //display error message
      makeAlertMessage(
        "error_outline", "Error saving Booklet", "ok",
        "The server encountered an error while saving the booklet." +
        " Ask IT-Management for help if this problem persists after" +
        " reloading the page.", "pdf_gen")
    );
  };

  //updates the display of the no content message and the collection list
  const updateListDisplay = () => {
    //get the selected resolution items
    const selectedRes = elems.selectedList.children();

    //check if the list if empty
    const listLength = selectedRes.length;

    //show and hide depending on list empty status
    if (listLength) {
      elems.selectedListEmptyMsg.addClass("hide-this");
      elems.selectedList.removeClass("hide-this");
    } else {
      elems.selectedListEmptyMsg.removeClass("hide-this");
      elems.selectedList.addClass("hide-this");
    }

    //check if the resolution can be printed
    //must have at least one resolution and all resolutions in stage range [7, 9]
    if (listLength && selectedRes.get().every(el => {
      //get the stage of this resolution item
      const stage = parseInt($(el).find(".res-stage").text(), 10);

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
  };

  //handle mouseenter (like hover) and click of view pdf button
  elems.printBtn
  .on("mouseenter", () => {
    //if no resolutions are selected
    //if the booklet hasn't been rendered yet
    if (renderState === "unrendered") {
      //move into rendering stage (with spinner)
      setRenderState("rendering");

      //trigger check for changes, change event might now have been fired on input yet
      madeChange();

      //save first
      saveBooklet().done(() =>
        //ask the server to render
        $.get(`/list/booklet/renderpdf/${bookletId}`).always(() =>
          //finished rendering, sets url
          //on fail: maybe there is a older pdf to look at
          setRenderState("rendered")
        ).fail(() =>
          //display error and and help directives
          makeAlertMessage(
            "error_outline", "Error generating PDF", "ok",
            "The server encountered an error while trying to generate the requested" +
            " PDF file. This may happen when a resolution or the booklet includes illegal" +
            "characters or some attribute of the booklet is invalid." +
            " Please talk to the owner of this document and ask IT-Management for help if" +
            " this problem persists.", "pdf_gen_booklet")
        )
      );
    }
  })
  .on("click", e => {
    /*when the open pdf button is clicked and opened the pdf,
    go back to unrendered because one of the resolutions might have changed,
    we're not reporting resolution changes but the server does regard them internally
    when deciding whether or not to actually re-render the booklet*/
    if (renderState === "rendered") {
      //blur to remove focus that makes it go dark
      elems.printBtn.blur();

      //move back to unrendered
      setRenderState("unrendered");
    } else {
      //prevent following link, there is nothing valid to look at
      e.preventDefault();
    }
  });

  //register change of any input
  $("input").on("change", madeChange);

  //do save (will not save if nothing to save) on clicking save button
  elems.saveBtn.on("click", saveBooklet);

  //clicking on eligible resolution makes it become selected
  elems.eligibleList.on("click", "li.collection-item:not(.selected-res)", function() {
    const elem = $(this);

    //move a copy to the selected resolutions
    elem
      .clone()
      .appendTo(elems.selectedList)

      //add ui icons
      .append(elems.selectedResIconsTemplate.clone())

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

  //action handlers on selected resolutions:
  //remove from list by clicking the x icon
  elems.selectedList.on("click", ".remove-icon", function() {
    //get item and token to unselect
    const item = $(this).getResItem();
    const token = item.find(".token").text();

    //remove resolution from list
    item.remove();

    //unselect eligible resolution with the token of the removed item
    elems.eligibleList
      .find(`.token:contains(${token})`)
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
    const item = $(this).getResItem();
    item.insertAfter(item.next());

    //changes were probably made
    madeChange();
  })

  //move up list in clicking up icon
  .on("click", ".up-icon", function() {
    //insert above previous sibling
    const item = $(this).getResItem();
    item.insertBefore(item.prev());

    //changes were probably made
    madeChange();
  });

  //do initial check of selected resolution list
  updateListDisplay();

  //save current initial state as the saved state
  savedBookletState = getBookletState();

  //register do you want to leave message
  $(window)
  .on("beforeunload", e => {
    //halt close if flag set that there are unsaved changes
    if (unsavedChanges) {
      e.preventDefault();

      //try to send a message to the user, the default from the browser is fine too though
      const msg = "You have unsaved changes that will be lost if you proceed!" +
        "Press the 'Save Changes' button to save the booklet state.";
      e.returnValue = msg;
      return msg;
    }
  });
});
