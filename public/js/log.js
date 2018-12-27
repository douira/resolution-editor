/*exported log*/

//list of log messages
const logMessages = [];

//log message send scheduling info
const logSendSchedule = {
  //the last time we logged to the server
  lastLogFlush: 0,

  //is set to true when we are waiting for a retry
  waitingForRetry: false,

  //minimum wait time between server log flushes
  minLogInterval: 10000,

  //counts the number of consecutive failed send attempts
  failedSends: 0,

  //send 4 times at most
  maxSendRetries: 4
};

//flush the buffer of log messages to the server
const sendBufferItems = () => {
  //time remaining in te current wait interval
  const sinceLastFlush = Date.now() - logSendSchedule.lastLogFlush;

  //if waiting for a retry and the last log was not long enough ago
  if (logSendSchedule.waitingForRetry ||
      sinceLastFlush < logSendSchedule.minLogInterval) {
    //if there is no retry set yet
    if (! logSendSchedule.waitingForRetry) {
      //waiting for retry now
      logSendSchedule.waitingForRetry = true;

      //set to retry in what is left to wait in the specified interval plus a little extra
      //to avoid very fast loops
      setTimeout(() => {
        //reset retry flag
        logSendSchedule.waitingForRetry = false;

        //retry
        sendBufferItems();
      }, logSendSchedule.minLogInterval - sinceLastFlush + 50);
    }

    //stop and wait for later attempt
    return;
  }

  //reset we are flushing to server
  logSendSchedule.waitingForRetry = false;
  logSendSchedule.lastLogFlush = Date.now();

  //stop if nothing to log
  if (! logMessages.length) {
    return;
  }

  //check that jquery has loaded
  if ($ && typeof $.post === "function") {
    //keep track of how many messages we are sending
    const messageAmount = logMessages.length;

    //post to logging endpoint
    $.post("/log", { messages: logMessages }).done(() => {
      //remove as many messages as were present when the request was started
      logMessages.splice(0, messageAmount);
      console.log("sucessful error buffer flush");
    }).fail(() => {
      //seriously bad if we can't even send errors
      console.log("Can't log error messages to server! Messages:", logMessages);

      //increment failed send counter
      logSendSchedule.failedSends ++;

      //only retry if not retried too many times
      if (logSendSchedule.failedSends < logSendSchedule.maxSendRetries) {
        //alert user
        alert( //eslint-disable-line no-alert
          "Failed to log error messages to server!" +
          " Please file an issues with the errors from the console." +
          " See the Bug Report Link at the bottom of the page.");
      } else {
        //retry
        sendBufferItems();
      }
    });
  } else {
    //retry
    sendBufferItems();
  }
};

//logs a message
const log = (dataOrMessage, level) => {
  //log to console for immediate viewing
  console.log(dataOrMessage);

  //make log item object
  const logItem = {
    //include some helpful information
    url: window.location.href,
    timestamp: Date.now(),

    //default level is error
    level: level || "error"
  };

  //if data was given as object
  if (typeof dataOrMessage === "object") {
    //was given an error object
    if (dataOrMessage instanceof Error) {
      //use as .err
      dataOrMessage = { err: dataOrMessage };
    }

    //data has msg property
    if (dataOrMessage.msg) {
      //extract and put seperately into item
      logItem.msg = dataOrMessage.msg;
      delete dataOrMessage.msg;
    }

    //data has err property
    if (dataOrMessage.err && dataOrMessage.err.stack) {
      //add err properties
      logItem.stack = dataOrMessage.err.stack;
    }

    //save as data prop
    logItem.data = dataOrMessage;
  } else {
    //simply attach as message
    logItem.msg = dataOrMessage;
  }

  //append log message to list
  logMessages.push(logItem);

  //try to send to server
  sendBufferItems();
};

//log uncought errors
window.onerror = (msg, url, line, column, error) =>
  //log error and pass args
  log({
    msg: "uncaught error",
    errorUrl: url,
    line,
    column,
    err: error,
    stack: error && error.stack
  });

//handles unload by trying to send the rest of the log messages
const handleUnload = () => {
  //stop if there is nothing to log
  if (! logMessages.length) {
    return;
  }

  //create an object to add the messages to
  const messageObj = { };

  //add all messages to object
  logMessages.forEach((msg, index) => messageObj[index] = msg);

  //use sync post xhr instead
  const client = new XMLHttpRequest();

  //set type and url with data (false is for using sync)
  client.open("GET", `/log?${$.param(messageObj, false)}`, false);

  //send messages
  client.send(null);
};

//before the window closes
$(window).on("beforeunload", handleUnload);
