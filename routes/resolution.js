/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const pandoc = require("node-pandoc");
const latexGenerator = require("../lib/latex-generator");
const db = require("../lib/database");

const inspect = ((spect) => {
  return (obj) => console.log(spect(obj, {
    colors: true,
    depth: null,
    breakLength: 0
  }));
})(require("util").inspect);

//setup leatex to html rendering
const pandocArgs = "-o public/out.pdf --template=public/template.latex";

//POST generate pdf
router.post("/renderpdf", function(req, res, next) {
  inspect(req.body);
  pandoc(latexGenerator(req.body), pandocArgs, (pandocErr, pandocResult) => {
    //throw error if occured
    if (pandocErr) {
      throw pandocErr;
    }

    //send rendered html
    res.send("out.pdf");
  });
});

//POST save resolution
router.post("/save", function(req, res, next) {
  //authorize user access of to this resolution with its token
  //...

  //put resolution into database
  db.collection("resolutons").insertOne(req.body);
});
