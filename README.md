# Messaging App API

REST API for [Messaging App](https://github.com/RaphaelM20/messaging-app), a full-stack Discord-inspired messaging app. [Live Demo](https://raphs-messaging-app.netlify.app/login)

## Tech Stack

- Node.js, Express
- PostgreSQL, Prisma ORM
- Passport.js (Local + JWT)
- bcryptjs

## Running Locally

```bash
git clone https://github.com/RaphaelM20/messaging-app-api
cd messaging-app-api
npm install
```

Create `.env`:

```
DATABASE_URL="your-postgresql-connection-string"
JWT_SECRET="any-random-string"

# Optional
PORT=3000
CORS_ORIGIN="http://localhost:5173"   # comma-separated allow-list; unset allows any origin
```

```bash
npx prisma migrate dev
npx prisma generate
npm run dev
```

API runs on `http://localhost:3000`.

## API Endpoints

All endpoints except `/signup` and `/login` require an `Authorization: Bearer <token>` header. Errors are JSON: `{ "errors": [{ "msg": "..." }] }`.

| Method | Endpoint                               | Description                                         |
| ------ | -------------------------------------- | --------------------------------------------------- |
| POST   | /signup                                | Register                                            |
| POST   | /login                                 | Log in                                              |
| GET    | /user/me                               | Get your profile                                    |
| PUT    | /user/me                               | Update your name, username, picture and bio         |
| GET    | /conversations                         | Your conversations, newest activity first           |
| POST   | /conversations                         | Start a conversation (reuses one with same members) |
| GET    | /conversations/:id                     | A conversation you belong to, with messages         |
| POST   | /conversations/:id/members             | Add a member to a conversation you belong to        |
| POST   | /conversations/:id/messages            | Send a message (1–2000 characters)                  |
| DELETE | /conversations/:id/messages/:messageId | Delete a message you sent                           |
| GET    | /friends                               | Accepted friendships                                |
| GET    | /friends/pending                       | Pending requests, `{ received, sent }`              |
| POST   | /friends                               | Send a friend request                               |
| PUT    | /friends/:id                           | Accept a request sent to you                        |
| DELETE | /friends/:id                           | Remove a friend, decline or cancel a request        |
| GET    | /users/search?search=                  | Search users by username                            |

### Access rules

- Conversations and their messages are visible only to members. Requests for a conversation you don't belong to return `404`, the same as one that doesn't exist.
- Only the sender can delete a message.
- Only the recipient can accept a friend request; either side can remove a friendship or request.
- Groups are limited to 10 members, including you.
- Responses never include password hashes or email addresses.
