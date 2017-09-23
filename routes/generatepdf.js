/*jshint esversion: 6, node: true */
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
const pandocArgs = "-o public/out.pdf --template=tex-templates/template.latex";

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

    //send link to rendered pdf
    res.send("out.pdf");
  });
});
