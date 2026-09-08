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
```

```bash
npx prisma migrate dev
npx prisma generate
npm run dev
```

API runs on `http://localhost:3000`.

## API Endpoints

| Method | Endpoint                    | Description         |
| ------ | --------------------------- | ------------------- |
| POST   | /signup                     | Register            |
| POST   | /login                      | Log in              |
| GET    | /conversations              | Get conversations   |
| POST   | /conversations              | Create conversation |
| GET    | /conversations/:id          | Get conversation    |
| POST   | /conversations/:id/messages | Send message        |
| GET    | /friends                    | Get friends         |
| POST   | /friends                    | Send friend request |
| PUT    | /friends/:id                | Accept request      |
| DELETE | /friends/:id                | Remove friend       |
| GET    | /users/search               | Search users        |
