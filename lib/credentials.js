/*jshint esversion: 6, node: true */
const extend = require("extend");

//require keys file for set keys
let keyFile;
try {
  keyFile = require("../lib/keys.json");
} catch (err) {
  keyFile = {};
  console.log("No lib/key.json file found, using default (and insecure) credentials!");
}

//extend cdefault credentials
module.exports = extend(true, {
  //default keys
  tokenSuffix: "TpAZzGqtbAaSIwP4sPCFXx6TppDmCl77CDxYTCqg",
  tokenSeed: 1839367566,
  makeCodesSuffix: "enph3LHnUfLD9QVsIZEMy49Ejh5NcRk5K3vh9zjh"
}, keyFile); //use data from file first if any found
