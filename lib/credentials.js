/*jshint esversion: 6, node: true */
const { logger } = require("../lib/logger");

//require keys file for set keys
let keyFile;
try {
  keyFile = require("../resources/keys.json");
} catch (err) {
  keyFile = {};
  logger.warn("No resources/key.json file found, using default (and insecure) credentials!");
}

//extend cdefault credentials
module.exports = Object.assign({
  //default keys
  tokenSuffix: "TpAZzGqtbAaSIwP4sPCFXx6TppDmCl77CDxYTCqg",
  tokenSeed: 1839367566,
  makeCodesSuffix: "enph3LHnUfLD9QVsIZEMy49Ejh5NcRk5K3vh9zjh",
  dbUserPassword: "VfGPv4IWU8IKi967CAo1NBoOm5zNmvWjJJIcHNFE",
  dbAdminPassword: "HjCfjGbnPepAsc1BN00TzCDxkSnkRWeVrivGC6eT",
  cookieSecret: "x1nhOahj7Cm7jL2Y77NgcFev9cJn97XciC5Cb3e7"
}, keyFile); //use data from file first if any found
