/*jshint esversion: 6, node: true */
//charset to make tokens out of
const charset = "BCDGHJKLMNPQRSTVWXYZ23456789";

//length of codes and tokens, must be at least 2 long
const tokenCodeLength = Math.max(9, 2);

//length of validation part in tokens and codes, must be shorter than tokenCodeLength
const validationLength = Math.min(3, tokenCodeLength - 1);

//calculate length of the codes and tokens that is random
const randomLength = tokenCodeLength - validationLength;

module.export = {
  //generates a new token, does not have the same character twice
  generate: function(rLength, vLength, isToken) {
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
    }

    //return generated string
    return str + this.getValidation(str, vLength, isToken);
  },
  //returns the validation characters for a given string, given length of validation string
  getValidation: function(forStr, vLength, isToken) {
    //reduce to sum of all char indexes, use as index
    let sum = forStr.split("").reduce((acc, char) => acc + charset.indexOf(char), 0);

    //add to sum depending on type to prevent misup of codes and tokens
    sum += isToken ? 2 : 7;

    //string accumulator
    let strOut = "";

    //for number of chars to make
    for (let i = 0; i < vLength; i++) {
      //make index to get char from, add a little to prevent strange math from happening
      sum = Math.pow(sum + i * 2, 3) % charset.length;

      //add char with index in charset to string
      strOut += charset[sum];
    }

    //return generated string
    return strOut;
  },
  //generates a access code or token
  makeToken: function() {
    return "@" + this.generate(randomLength, validationLength, true);
  },
  makeCode: function() {
    return "!" + this.generate(randomLength, validationLength, false);
  },
  //checks if a given token is valid like from this generator
  check: function(checkThis) {
    //check if right length
    if (checkThis.length !== tokenCodeLength) {
      return false;
    }
  }
};
