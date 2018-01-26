/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();
const resUtil = require("../lib/resUtil");
const routingUtil = require("../lib/routingUtil");

//GET display enter access code page
router.get("/print", function(req, res) {
  res.render("printqueueopen");
});

//POST secreteriat print queue page, gets code from post
router.post("/print/list", function(req, res) {
  //do simple code auth
  routingUtil.checkCode(req, res, codeDoc => {
    console.log(codeDoc);
    //check that the code matches the required permission
    if (resUtil.checkStaticPermission(codeDoc, "printqueue")) {
      //render the list page
      res.render("printqueue");
    } else {
      //show the weakperm page for work queues
      res.render("weakperm", { type: "workqueue" });
    }
  });
});

//POST return list of items to be printed
router.post("/print/getitems", function(req, res) {

});
