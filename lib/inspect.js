const { inspect: spect } = require("util");

//inspection function with settings applied
module.exports = (obj, depth) => {
  console.log(spect(obj, {
    colors: true,
    depth: typeof depth === "number" ? depth : null,
    breakLength: 0
  }));
};
