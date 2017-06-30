/*jshint asi: false, esnext: true, node: true, indent: 2*/
const express = require('express');
const router = module.exports = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});
