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

//make object to attach fucntions to
const tokenLib = { };
module.exports = tokenLib;

//generates a new token, does not have the same character twice in succession
tokenLib.generate = (rLength, vLength, prefix) => {
  //generate string with given length
  let str = "";

  //keep track of what index we had last
  let lastIndex = -1;

  //iterate length times
  let picked;
  for (let i = 0; i < rLength; i ++) {
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
  return str + tokenLib.getValidation(str, vLength);
};

//returns the validation characters for a given string, given length of validation string
//also does not have the same character twice in succession
tokenLib.getValidation = (forStr, vLength) => {
  //get hash number of token and prefix
  let hashNumber = XXH.h32(forStr + credentials.tokenSuffix, credentials.tokenSeed)
    .toNumber();

  //string accumulator
  let strOut = "";

  //for number of chars to make
  let lastIndex;
  for (let i = 0; i < vLength; i ++) {
    //get current index of char to take
    let charIndex = hashNumber % charset.length;

    //increment if same as last
    if (typeof lastIndex === "undefined"
      ? charset.indexOf(forStr[forStr.length - 1]) === charIndex
      : charIndex === lastIndex) {
      //change to make not the same
      charIndex = (charIndex + 1) % charset.length;
    }

    //copy over to last
    lastIndex = charIndex;

    //add char with index in charset to string
    strOut += charset[charIndex];

    //move number to next level ("shift")
    hashNumber = Math.floor(hashNumber / charset.length);
  }

  //return generated string
  return strOut;
};

//generates a access code or token
tokenLib.makeToken = () =>
  tokenLib.generate(randomLength, validationLength, "@");
tokenLib.makeCode = () =>
  tokenLib.generate(randomLength, validationLength, "!");

//checks if a given token is valid like from this generator
tokenLib.check = checkThis => {
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
  return tokenLib.getValidation(
    checkThis.substr(0, randomLength + 1),
    validationLength,
    checkThis[0]) === checkThis.substr(-validationLength);
};
