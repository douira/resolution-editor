/*jshint esversion: 6, node: true */
const spect = require("util").inspect;

//inspection function with settings applied
module.exports = (obj, depth) => {
  console.log(spect(obj, {
    colors: true,
    depth: typeof depth === "number" ? depth : null,
    breakLength: 0
  }));
};
