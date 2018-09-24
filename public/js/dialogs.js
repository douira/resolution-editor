/*global Materialize*/
/*exported makeAlertMessage, displayToast */
//queue of alert message we want to display
const alertQueue = [];

//checks if we can display an alert now or starts processing the queue
const checkAlertDisplay = () => {
  //only if any items in the queue and still animating
  if (alertQueue.length) {
    const modal = $("#alert-message-modal");
    if (! (modal.hasClass("open") || modal.hasClass("velocity-animating"))) {
      //get next alert message from queue and display
      const modalData = alertQueue.shift();

      //get the modal element
      const modalElement = $("#alert-message-modal");

      //add content to the modal
      modalElement
        .find(".modal-content-title")
        .html(`<i class='material-icons small'>${modalData.icon}</i> ${modalData.title}`);
      modalElement.find(".modal-dismiss-btn").html(modalData.buttonText);

      //set error code if given
      modalElement
        .find(".error-code")
        .text(modalData.hasErrorCode ? `error #${modalData.errorCode}` : "")[
          modalData.hasErrorCode ? "show" : "hide"
        ]();

      //call callback for content if given
      const contentBody = modalElement.find(".modal-content-body");
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
};

//creates an alert message
const makeAlertMessage = (icon, title, buttonText, callbackOrMessage, errorCode) => {
  //default button text
  if (typeof buttonText !== "string") {
    buttonText = "OK";
  }

  //add alert message object to queue
  alertQueue.push({
    icon,
    title,
    buttonText,
    callbackOrMessage,
    hasErrorCode: typeof errorCode !== "undefined",
    errorCode: errorCode && errorCode.split(" ").join("_")
  });

  //check immediately
  checkAlertDisplay();
};

//register modal handler
$(document).ready(() => {
  //not using element specific data because this will be the same for all modals
  //(only the one modal atm)
  const modal = $(".modal");
  modal.modal({
    dismissible: false,
    complete: () => {
      modal.trigger("reset");

      //display next alert if there is one
      checkAlertDisplay();
    }
  });
});

//does a toast display
const displayToast = (msg, duration) => {
  //default duration is 3 seconds
  if (typeof duration === "undefined") {
    duration = 3000;
  }

  //do the toast
  Materialize.toast(msg, duration);
};
