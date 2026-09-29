const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");
const passport = require("passport");

router.get(
  "/user/me",
  passport.authenticate("jwt", { session: false }),
  indexController.getUserInfo,
);

router.put(
  "/user/me",
  passport.authenticate("jwt", { session: false }),
  indexController.updateUserInfo,
);

module.exports = router;
