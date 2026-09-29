const { body, validationResult, matchedData } = require("express-validator");
const bcrypt = require("bcryptjs");
const prisma = require("../../db/prisma");
const jwt = require("jsonwebtoken");

// Includes the current user.
const MAX_GROUP_MEMBERS = 10;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SEARCH_RESULTS = 20;
// Shared public demo account; everyone who clicks "Continue as guest" uses it.
const GUEST_USERNAME = "guest";

// Never select the password hash into a response.
const PUBLIC_USER_FIELDS = {
  id: true,
  name: true,
  username: true,
  picture: true,
  bio: true,
};
const MEMBER_FIELDS = { id: true, name: true, picture: true };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Errors use the same shape as express-validator's: { errors: [{ msg }] }.
function sendError(res, status, msg) {
  return res.status(status).json({ errors: [{ msg }] });
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// Resolves only conversations the user belongs to. Callers answer 404 for
// both "missing" and "not yours" so IDs can't be probed.
function findMemberConversation(conversationId, userId, options = {}) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, members: { some: { id: userId } } },
    ...options,
  });
}

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });
}

function isUniqueViolation(err) {
  return err?.code === "P2002";
}

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

const nameRule = () =>
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 50 })
    .withMessage("Name must be 50 characters or fewer")
    .matches(/^[\p{L}\p{M}' -]+$/u)
    .withMessage(
      "Name may only contain letters, spaces, hyphens and apostrophes",
    );

const usernameRule = () =>
  body("username")
    .trim()
    .matches(/^[a-zA-Z0-9 ]+$/)
    .withMessage("Please include only letters, numbers, and spaces")
    .isLength({ min: 4, max: 20 })
    .withMessage("Username must be between 4 and 20 characters");

const validateSignUp = [
  nameRule(),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address"),
  usernameRule(),
  body("password")
    .trim()
    .isLength({ min: 6, max: 20 })
    .withMessage("Password must be between 6 and 20 characters"),
  body("confirmPass")
    .trim()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
  handleValidation,
];

const validateProfile = [
  nameRule(),
  usernameRule(),
  body("bio")
    .optional({ values: "null" })
    .isString()
    .trim()
    .isLength({ max: 190 })
    .withMessage("Bio must be 190 characters or fewer"),
  body("picture")
    .optional({ values: "falsy" })
    .trim()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage("Picture must be an http(s) URL"),
  handleValidation,
];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const signUpPost = [
  validateSignUp,
  async (req, res) => {
    const { name, email, username, password } = matchedData(req);

    const [existingEmail, existingUsername] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.user.findUnique({ where: { username } }),
    ]);
    if (existingEmail) return sendError(res, 400, "Email already in use");
    if (existingUsername) return sendError(res, 400, "Username already in use");

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        username,
        password: await bcrypt.hash(password, 10),
        picture:
          "https://res.cloudinary.com/zrc0epiv/image/upload/v1786553336/no-pfp_snavwl.jpg",
      },
    });

    return res.status(201).json({ token: signToken(newUser.id) });
  },
];

async function loginPost(req, res) {
  return res.json({ token: signToken(req.user.id) });
}

// ---------------------------------------------------------------------------
// Conversations and messages
// ---------------------------------------------------------------------------

async function getAllConversations(req, res) {
  const conversations = await prisma.conversation.findMany({
    where: { members: { some: { id: req.user.id } } },
    include: {
      members: { select: MEMBER_FIELDS },
      messages: {
        select: { content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { lastActivity: "desc" },
  });
  return res.json(conversations);
}

async function getOneConversation(req, res) {
  const conversationId = parseId(req.params.conversationId);
  const conversation =
    conversationId &&
    (await findMemberConversation(conversationId, req.user.id, {
      include: {
        members: { select: MEMBER_FIELDS },
        messages: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            sender: { select: MEMBER_FIELDS },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }));

  if (!conversation) return sendError(res, 404, "Conversation not found");
  return res.json(conversation);
}

async function createConversation(req, res) {
  const { members } = req.body;
  if (!Array.isArray(members)) {
    return sendError(res, 400, "members must be an array of user IDs");
  }

  const parsedIds = members.map(parseId);
  if (parsedIds.includes(null)) {
    return sendError(res, 400, "members must be an array of user IDs");
  }
  // Ignore duplicates and the current user, who is always a member.
  const memberIds = [...new Set(parsedIds)].filter((id) => id !== req.user.id);
  if (memberIds.length === 0) {
    return sendError(res, 400, "Choose at least one other member");
  }
  if (memberIds.length > MAX_GROUP_MEMBERS - 1) {
    return sendError(
      res,
      400,
      `Groups can have up to ${MAX_GROUP_MEMBERS} members`,
    );
  }

  const found = await prisma.user.count({ where: { id: { in: memberIds } } });
  if (found !== memberIds.length) {
    return sendError(res, 400, "One or more members don't exist");
  }

  // Reuse the conversation with exactly these members if it exists.
  const allMemberIds = [req.user.id, ...memberIds];
  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        ...allMemberIds.map((id) => ({ members: { some: { id } } })),
        { members: { every: { id: { in: allMemberIds } } } },
      ],
    },
  });
  if (existing) return res.json(existing);

  const conversation = await prisma.conversation.create({
    data: { members: { connect: allMemberIds.map((id) => ({ id })) } },
  });
  return res.status(201).json(conversation);
}

async function addToConversation(req, res) {
  const conversationId = parseId(req.params.conversationId);
  const recipientId = parseId(req.body.recipientId);
  if (!recipientId) return sendError(res, 400, "recipientId is required");

  const conversation =
    conversationId &&
    (await findMemberConversation(conversationId, req.user.id, {
      include: { _count: { select: { members: true } } },
    }));
  if (!conversation) return sendError(res, 404, "Conversation not found");
  if (conversation._count.members >= MAX_GROUP_MEMBERS) {
    return sendError(
      res,
      400,
      `Groups can have up to ${MAX_GROUP_MEMBERS} members`,
    );
  }

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { id: true },
  });
  if (!recipient) return sendError(res, 404, "User not found");

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      members: { connect: [{ id: recipientId }] },
      lastActivity: new Date(),
    },
  });
  return res.json(updated);
}

async function createMessage(req, res) {
  const conversationId = parseId(req.params.conversationId);
  const content =
    typeof req.body.content === "string" ? req.body.content.trim() : "";

  if (!content) return sendError(res, 400, "Message can't be empty");
  if (content.length > MAX_MESSAGE_LENGTH) {
    return sendError(
      res,
      400,
      `Messages can be at most ${MAX_MESSAGE_LENGTH} characters`,
    );
  }

  const conversation =
    conversationId &&
    (await findMemberConversation(conversationId, req.user.id));
  if (!conversation) return sendError(res, 404, "Conversation not found");

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { senderId: req.user.id, conversationId, content },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastActivity: new Date() },
    }),
  ]);
  return res.status(201).json(message);
}

async function deleteMessage(req, res) {
  // Visitors share the guest account, so one could wipe the demo chats.
  if (req.user.username === GUEST_USERNAME) {
    return sendError(res, 403, "The guest account can't delete messages");
  }

  const conversationId = parseId(req.params.conversationId);
  const messageId = parseId(req.params.messageId);

  const message =
    conversationId &&
    messageId &&
    (await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        conversation: { members: { some: { id: req.user.id } } },
      },
      select: { senderId: true },
    }));

  if (!message) return sendError(res, 404, "Message not found");
  if (message.senderId !== req.user.id) {
    return sendError(res, 403, "You can only delete your own messages");
  }

  await prisma.message.delete({ where: { id: messageId } });
  return res.status(204).end();
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

async function getFriends(req, res) {
  const friends = await prisma.friend.findMany({
    where: {
      OR: [{ userId: req.user.id }, { buddyId: req.user.id }],
      status: "ACCEPTED",
    },
    include: {
      user: { select: { id: true, name: true, picture: true, username: true } },
      buddy: {
        select: { id: true, name: true, picture: true, username: true },
      },
    },
  });
  return res.json(friends);
}

async function getPendingRequests(req, res) {
  const personFields = { id: true, name: true, picture: true, username: true };
  const [received, sent] = await Promise.all([
    prisma.friend.findMany({
      where: { buddyId: req.user.id, status: "PENDING" },
      include: { user: { select: personFields } },
    }),
    prisma.friend.findMany({
      where: { userId: req.user.id, status: "PENDING" },
      include: { buddy: { select: personFields } },
    }),
  ]);
  return res.json({ received, sent });
}

async function sendFriendRequest(req, res) {
  const buddyId = parseId(req.body.buddyId);
  if (!buddyId) return sendError(res, 400, "buddyId is required");
  if (buddyId === req.user.id) {
    return sendError(res, 400, "You can't add yourself as a friend");
  }

  const buddy = await prisma.user.findUnique({
    where: { id: buddyId },
    select: { id: true },
  });
  if (!buddy) return sendError(res, 404, "User not found");

  const existing = await prisma.friend.findFirst({
    where: {
      OR: [
        { userId: req.user.id, buddyId },
        { userId: buddyId, buddyId: req.user.id },
      ],
    },
  });
  if (existing) {
    return sendError(
      res,
      409,
      existing.status === "ACCEPTED"
        ? "You're already friends"
        : "A friend request between you already exists",
    );
  }

  const request = await prisma.friend.create({
    data: { userId: req.user.id, buddyId, status: "PENDING" },
  });
  return res.status(201).json(request);
}

// Only the recipient of a pending request can accept it.
async function acceptFriendRequest(req, res) {
  const id = parseId(req.params.id);
  const { count } = id
    ? await prisma.friend.updateMany({
        where: { id, buddyId: req.user.id, status: "PENDING" },
        data: { status: "ACCEPTED" },
      })
    : { count: 0 };

  if (count === 0) return sendError(res, 404, "Friend request not found");
  const request = await prisma.friend.findUnique({ where: { id } });
  return res.json(request);
}

// Either side can remove a friendship or withdraw/decline a request.
async function removeFriend(req, res) {
  const id = parseId(req.params.id);
  const { count } = id
    ? await prisma.friend.deleteMany({
        where: {
          id,
          OR: [{ userId: req.user.id }, { buddyId: req.user.id }],
        },
      })
    : { count: 0 };

  if (count === 0) return sendError(res, 404, "Friendship not found");
  return res.status(204).end();
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function searchUsers(req, res) {
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (!search || search.length > 20) return res.json([]);

  const users = await prisma.user.findMany({
    where: {
      username: { contains: search, mode: "insensitive" },
      NOT: { id: req.user.id },
    },
    select: {
      id: true,
      name: true,
      username: true,
      picture: true,
      friendsOf: {
        where: { userId: req.user.id },
        select: { status: true },
      },
      friends: {
        where: { buddyId: req.user.id },
        select: { status: true },
      },
    },
    orderBy: { username: "asc" },
    take: MAX_SEARCH_RESULTS,
  });
  return res.json(users);
}

async function getUserInfo(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: PUBLIC_USER_FIELDS,
  });
  return res.json(user);
}

const updateUserInfo = [
  validateProfile,
  async (req, res) => {
    const { name, username, picture, bio } = matchedData(req);
    const data = { name, username };
    // Optional fields change only when sent; an empty value clears them.
    if ("picture" in req.body) data.picture = picture || null;
    if ("bio" in req.body) data.bio = bio || null;
    try {
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data,
        select: PUBLIC_USER_FIELDS,
      });
      return res.json(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return sendError(res, 409, "Username already in use");
      }
      throw err;
    }
  },
];

module.exports = {
  signUpPost,
  loginPost,
  createMessage,
  deleteMessage,
  createConversation,
  getOneConversation,
  getAllConversations,
  addToConversation,
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  searchUsers,
  getUserInfo,
  updateUserInfo,
};
