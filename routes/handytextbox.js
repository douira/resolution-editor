const express = require("express");
const router = express.Router();
module.exports = router;

//GET render textbox page
router.get("/", (req, res) => res.render("handytextbox"));
