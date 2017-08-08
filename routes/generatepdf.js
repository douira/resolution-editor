/*jshint asi: false, esnext: true, node: true, indent: 2*/
const express = require("express");
const router = module.exports = express.Router();
const pandoc = require("node-pandoc");
const latexGenerator = require("../lib/latex-generator");

const inspect = ((spect) => {
  return (obj) => console.log(spect(obj, {
    colors: true,
    depth: null,
    breakLength: 0
  }));
})(require("util").inspect);

//setup leatex to html rendering
const pandocArgs = "-o public/out.pdf";

//converts json from client editor to rendered html
function jsonToLatex(data) {
  return latexGenerator(data);
}

/* POST generate pdf. */
router.post("/", function(req, res, next) {
  inspect(req.body);
  pandoc(jsonToLatex(req.body), pandocArgs, (pandocErr, pandocResult) => {
    //throw error if occured
    if (pandocErr) {
      throw pandocErr;
    }

    //send rendered html
    res.send("out.pdf");
  });
});
