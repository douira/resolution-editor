/*jshint esversion: 6, node: true */
const XXH = require("xxhashjs");
const credentials = require("../lib/credentials");

//charset to make tokens out of
const charset = "BCDGHJKLMNPQRSTVWXYZ123456789";

//length of codes and tokens, must be at least 2 long
const tokenCodeLength = Math.max(8, 2);

//length of validation part in tokens and codes, must be shorter than tokenCodeLength
const validationLength = Math.min(3, tokenCodeLength - 1);

//calculate length of the codes and tokens that is random
const randomLength = tokenCodeLength - validationLength;

module.exports = {
  //generates a new token, does not have the same character twice
  generate: function(rLength, vLength, prefix) {
    //generate string with given length
    let str = "";

    //keep track of what index we had last
    let lastIndex = -1;

    //iterate length times
    let picked;
    for (let i = 0; i < rLength; i++) {
      //pick random index
      picked = Math.floor(Math.random() * charset.length);

      //increment one if it's what we had last time
      if (picked === lastIndex) {
        picked = (picked + 1) % charset.length;
      }

      //append character for selected index to string
      str += charset[picked];

      //remember index
      lastIndex = picked;
    }

    //add prefix
    str = prefix + str;

    //return generated string
    return str + this.getValidation(str, vLength);
  },
  //returns the validation characters for a given string, given length of validation string
  getValidation: function(forStr, vLength) {
    //get hash number of token and prefix
    let hashNumber = XXH.h32(forStr + credentials.tokenSuffix, credentials.tokenSeed)
      .toNumber();

    //string accumulator
    let strOut = "";

    //current digit base
    let base = charset.length;

    //for number of chars to make
    for (let i = 0; i < vLength; i++) {
      //add char with index in charset to string
      strOut += charset[hashNumber % charset.length];

      //move number to next level ("shift")
      hashNumber = Math.floor(hashNumber / charset.length);

      //increment base for next level
      base *= charset.length;
    }

    //return generated string
    return strOut;
  },
  //generates a access code or token
  makeToken: function() {
    return this.generate(randomLength, validationLength, "@");
  },
  makeCode: function() {
    return this.generate(randomLength, validationLength, "!");
  },
  //checks if a given token is valid like from this generator
  check: function(checkThis) {
    //check if right length
    if (! checkThis || checkThis.length - 1 !== tokenCodeLength) {
      return false;
    }

    //must begin with ! or @
    if (checkThis[0] !== "!" && checkThis[0] !== "@") {
      //not a token or a code
      return false;
    }

    //make upper case
    checkThis = checkThis.toUpperCase();

    //check validation content
    return this.getValidation(
      checkThis.substr(0, randomLength + 1),
      validationLength,
      checkThis[0]) === checkThis.substr(- validationLength);
  }
};

/*
Perf. Test:

const tokenProcessor = require("./lib/token");
let ok;
let ms = Date.now();
let n = 100000;
for (let i = 0; i < n; i ++) {
  const token = tokenProcessor.makeToken();
  ok = tokenProcessor.check(token);
  //console.log(token, ok);
  if (! ok) {
    console.log(token, ok);
    break;
  }
}
ms = Date.now() - ms;
console.log("done in " + ms + "ms; " + (ms / n) + "ms per calc");
*/
