const express = require("express");
const prisma = require("../db/prisma");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
const routes = require("./routes");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set");
}

const app = express();

// Comma-separated allow-list, e.g. "https://raphs-messaging-app.netlify.app".
// Unset allows any origin (auth is by bearer token, not cookies).
const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim());

app.use(express.json({ limit: "20kb" }));
// Express 5 leaves req.body undefined when no JSON body was sent.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : undefined));
app.use(passport.initialize());

//routes
app.use("/", routes.signup);
app.use("/", routes.login);
app.use("/", routes.message);
app.use("/", routes.conversation);
app.use("/", routes.friends);
app.use("/", routes.user);

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { username: username },
      });

      if (!user) {
        return done(null, false, { message: "Incorrect username" });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return done(null, false, { message: "Incorrect password" });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }),
);

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(
  new JwtStrategy(jwtOptions, async (jwtPayload, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: jwtPayload.id },
      });

      if (!user) {
        return done(null, false);
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }),
);

app.use((req, res) => {
  res.status(404).json({ errors: [{ msg: "Not found" }] });
});

// Express 5 forwards rejected async handlers here. Respond with JSON and
// never leak internals to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ errors: [{ msg: "Invalid JSON body" }] });
  }
  if (err.type === "entity.too.large") {
    return res
      .status(413)
      .json({ errors: [{ msg: "Request body too large" }] });
  }
  console.error(err);
  res.status(500).json({ errors: [{ msg: "Something went wrong" }] });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, (error) => {
  if (error) {
    throw error;
  }
  console.log(`app listening on port ${port}!`);
});
