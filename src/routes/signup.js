const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");

router.post("/signup", indexController.signUpPost);

module.exports = router;
