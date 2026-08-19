const { body, validationResult, matchedData } = require("express-validator");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const prisma = require("../../db/prisma");
const jwt = require("jsonwebtoken");
const { json } = require("express");

const validateSignUp = [
  body("name").trim().isAlpha(),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("username")
    .trim()
    .matches(/^[a-zA-Z0-9 ]+$/)
    .withMessage("Please include only letters, numbers, and spaces")
    .isLength({ min: 4, max: 20 })
    .withMessage("Username must be between 4 and 20 characters"),
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
];

const signUpPost = [
  validateSignUp,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array(),
        data: req.body,
      });
    }

    const { name, email, username, password } = matchedData(req);
    const hashedPassword = await bcrypt.hash(password, 10);

    const existingEmail = await prisma.user.findUnique({
      where: { email: email },
    });

    const existingUsername = await prisma.user.findUnique({
      where: { username: username },
    });

    if (existingEmail) {
      return res.status(400).json({
        errors: [{ message: "Email already in use" }],
        data: req.body,
      });
    } else if (existingUsername) {
      return res.status(400).json({
        errors: [{ message: "Username already in use" }],
        data: req.body,
      });
    }

    const newUser = await prisma.user.create({
      data: {
        name: name,
        email: email,
        username: username,
        password: hashedPassword,
        picture:
          "https://res.cloudinary.com/zrc0epiv/image/upload/v1786553336/no-pfp_snavwl.jpg",
      },
    });

    const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.status(201).json({ token: token });
  },
];

async function loginPost(req, res) {
  const token = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
  return res.json({ token: token });
}

async function createMessage(req, res) {
  const message = await prisma.message.create({
    data: {
      senderId: req.user.id,
      conversationId: parseInt(req.params.conversationId),
      content: req.body.content,
    },
  });

  await prisma.conversation.update({
    where: { id: parseInt(req.params.conversationId) },
    data: { lastActivity: new Date() },
  });
  return res.json(message);
}

async function createConversation(req, res) {
  const memberChecks = req.body.members.map((id) => ({
    members: { some: { id } },
  }));

  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { members: { some: { id: req.user.id } } },
        ...memberChecks,
        {
          members: {
            every: { id: { in: [req.user.id, ...req.body.members] } },
          },
        },
      ],
    },
  });

  if (existing) return res.json(existing);

  const conversation = await prisma.conversation.create({
    data: {
      members: {
        connect: [
          { id: req.user.id },
          ...req.body.members.map((id) => ({ id })),
        ],
      },
    },
  });
  return res.json(conversation);
}

async function getAllConversations(req, res) {
  const allConversations = await prisma.conversation.findMany({
    where: {
      members: {
        some: {
          id: req.user.id,
        },
      },
    },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          picture: true,
        },
      },
      messages: {
        select: {
          content: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { lastActivity: "desc" },
  });
  return res.json(allConversations);
}

async function getOneConversation(req, res) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: parseInt(req.params.conversationId),
    },
    include: {
      members: {
        select: {
          id: true,
          name: true,
          picture: true,
        },
      },
      messages: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          sender: {
            select: {
              id: true,
              name: true,
              picture: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return res.json(conversation);
}

async function addToConversation(req, res) {
  const conversation = await prisma.conversation.update({
    where: {
      id: parseInt(req.params.conversationId),
    },
    data: {
      members: {
        connect: [{ id: req.body.recipientId }],
      },
    },
  });

  await prisma.conversation.update({
    where: { id: parseInt(req.params.conversationId) },
    data: { lastActivity: new Date() },
  });
  return res.json(conversation);
}

async function removeFromConversation(req, res) {
  const conversation = await prisma.conversation.update({
    where: {
      members: {
        disconnect: [{ id: req.user.id }],
      },
    },
  });

  return res.json(conversation);
}

async function getFriends(req, res) {
  const friends = await prisma.friend.findMany({
    where: {
      OR: [{ userId: req.user.id }, { buddyId: req.user.id }],
      status: "ACCEPTED",
    },
    include: {
      user: {
        select: { id: true, name: true, picture: true, username: true },
      },
      buddy: {
        select: { id: true, name: true, picture: true, username: true },
      },
    },
  });
  return res.json(friends);
}

async function getPendingRequests(req, res) {
  const received = await prisma.friend.findMany({
    where: {
      buddyId: req.user.id,
      status: "PENDING",
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          picture: true,
          username: true,
        },
      },
    },
  });

  const sent = await prisma.friend.findMany({
    where: {
      userId: req.user.id,
      status: "PENDING",
    },
    include: {
      buddy: {
        select: {
          id: true,
          name: true,
          picture: true,
          username: true,
        },
      },
    },
  });
  return res.json({ received, sent });
}

async function sendFriendRequest(req, res) {
  console.log("body:", req.body);
  try {
    const request = await prisma.friend.create({
      data: {
        userId: req.user.id,
        buddyId: req.body.buddyId,
        status: "PENDING",
      },
    });
    return res.json(request);
  } catch (err) {
    console.log("error:", err);
    return res.status(500).json({ error: err.message });
  }
}

async function acceptFriendRequest(req, res) {
  const request = await prisma.friend.update({
    where: {
      id: parseInt(req.params.id),
    },
    data: {
      status: "ACCEPTED",
    },
  });
  return res.json(request);
}

async function removeFriend(req, res) {
  console.log("id:", req.params.id);
  const remove = await prisma.friend.delete({
    where: { id: parseInt(req.params.id) },
  });

  return res.json(remove);
}

async function searchUsers(req, res) {
  const users = await prisma.user.findMany({
    where: {
      username: {
        contains: req.query.search,
        mode: "insensitive",
      },
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
  });
  return res.json(users);
}

async function updateProfile(req, res) {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      name: req.body.name,
      bio: req.user.bio,
      picture: req.body.picture,
    },
  });
  return res.json(user);
}

async function getUserInfo(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      name: true,
      username: true,
      picture: true,
      bio: true,
    },
  });
  return res.json(user);
}

async function updateUserInfo(req, res) {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      name: req.body.name,
      username: req.body.username,
      picture: req.body.picture,
      bio: req.body.bio,
    },
  });
  return res.json(user);
}

module.exports = {
  signUpPost,
  loginPost,
  createMessage,
  createConversation,
  getOneConversation,
  getAllConversations,
  addToConversation,
  removeFromConversation,
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  searchUsers,
  updateProfile,
  getUserInfo,
  updateUserInfo,
};
