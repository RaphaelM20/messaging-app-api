const { Router } = require("express");
const router = Router();
const passport = require("passport");
const indexController = require("../controllers/indexController");

router.get(
  "/friends",
  passport.authenticate("jwt", { session: false }),
  indexController.getFriends,
);

router.get(
  "/friends/pending",
  passport.authenticate("jwt", { session: false }),
  indexController.getPendingRequests,
);

//search user route
router.get(
  "/users/search",
  passport.authenticate("jwt", { session: false }),
  indexController.searchUsers,
);

router.post(
  "/friends",
  passport.authenticate("jwt", { session: false }),
  indexController.sendFriendRequest,
);

router.put(
  "/friends/:id",
  passport.authenticate("jwt", { session: false }),
  indexController.acceptFriendRequest,
);

router.delete(
  "/friends/:id",
  passport.authenticate("jwt", { session: false }),
  indexController.removeFriend,
);

module.exports = router;
