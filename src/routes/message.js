const { Router } = require("express");
const router = Router();
const passport = require("passport");
const indexController = require("../controllers/indexController");

router.post(
  "/conversations/:conversationId/messages",
  passport.authenticate("jwt", { session: false }),
  indexController.createMessage,
);

module.exports = router;
