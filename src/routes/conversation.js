const { Router } = require("express");
const router = Router();
const passport = require("passport");
const indexController = require("../controllers/indexController");

router.get(
  "/conversations",
  passport.authenticate("jwt", { session: false }),
  indexController.getAllConversations,
);

router.get(
  "/conversations/:conversationId",
  passport.authenticate("jwt", { session: false }),
  indexController.getOneConversation,
);

router.post(
  "/conversations",
  passport.authenticate("jwt", { session: false }),
  indexController.createConversation,
);

router.post(
  "/conversations/:conversationId/members",
  passport.authenticate("jwt", { session: false }),
  indexController.addToConversation,
);

module.exports = router;
