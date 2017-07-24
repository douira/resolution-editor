/*jshint asi: false, esnext: true, node: true, indent: 2*/
const express = require("express");
const router = module.exports = express.Router();
const pandoc = require("node-pandoc");

//setup leatex to html rendering
const pandocArgs = "-o public/out.pdf";

//converts json from client editor to rendered html
function jsonToLatex(json) {
  //return "samplefile.tex";
  return "\\begin{center}\n\\large Title of this document\n\\normalsize A. U. " +
    "Thor\n\\end{center}\n\\vspace{3\\baselineskip}\nHere starts the text.";
}

/* POST generate pdf. */
router.post("/", function(req, res, next) {
  pandoc(jsonToLatex(req.body), pandocArgs, (pandocErr, pandocResult) => {
    //throw error if occured
    if (pandocErr) {
      res.send("error");
      throw pandocErr;
    }

    //send rendered html
    res.send("out.pdf");
  });
});
