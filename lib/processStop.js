const { logger } = require("../lib/logger");
const db = require("../lib/database");

//listen on process close signals
db.fullInit.then(
  () => process.on("SIGINT", () => {
    logger.info("received SIGINT, stopping");

    //if database is not connected, no need to disconnect
    if (! db.dbClient || ! db.dbClient.isConnected()) {
      logger.warn("db not connected on exit");
      process.exit(1);
    }

    //require client to be present
    db.dbClient.close().then(
      //exit process
      () => process.exit(),

      //error exititing db connection
      err => {
        logger.error("could not end db connection", { stack: err.stack });
        process.exit(1);
      }
    );
  })
);
