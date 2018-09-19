/*jshint esversion: 6, node: true */
const express = require("express");
const router = module.exports = express.Router();

//GET render textbox page
router.get("/", (req, res) => res.render("handytextbox"));
