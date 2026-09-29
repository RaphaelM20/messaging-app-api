const { Router } = require("express");
const router = Router();
const passport = require("passport");
const indexController = require("../controllers/indexController");

router.post(
  "/conversations/:conversationId/messages",
  passport.authenticate("jwt", { session: false }),
  indexController.createMessage,
);

router.delete(
  "/conversations/:conversationId/messages/:messageId",
  passport.authenticate("jwt", { session: false }),
  indexController.deleteMessage,
);

module.exports = router;
