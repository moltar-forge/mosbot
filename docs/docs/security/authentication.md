---
id: authentication
title: Authentication
sidebar_label: Authentication
sidebar_position: 1
---

# Authentication

MosBot OS uses JWT (JSON Web Token) based authentication. Users log in with email and password and
receive a token that's used for all subsequent API requests.

## How it works

```
Dashboard                MosBot API              PostgreSQL
   │                         │                       │
   │  POST /auth/login        │                       │
   │  {email, password}  ──► │                       │
   │                         │  SELECT user by email ►│
   │                         │◄─ user row ────────────│
   │                         │  bcrypt.compare()      │
   │                         │  jwt.sign()            │
   │◄── {token, user} ───────│                       │
   │                         │                       │
   │  GET /tasks              │                       │
   │  Authorization: Bearer ►│                       │
   │                         │  jwt.verify()          │
   │◄── tasks[] ─────────────│                       │
```

1. The user submits their email and password
2. MosBot API looks up the user in PostgreSQL
3. The password is verified using bcrypt
4. A JWT is signed with `JWT_SECRET` and returned
5. The dashboard stores the token and sends it as `Authorization: Bearer <token>` on every request
6. The API verifies the token on each request

## Token configuration

| Variable         | Default | Description                                 |
| ---------------- | ------- | ------------------------------------------- |
| `JWT_SECRET`     | —       | Signing secret (**required**, min 48 chars) |
| `JWT_EXPIRES_IN` | `7d`    | Token expiry (e.g. `7d`, `24h`)             |

## Token storage

The dashboard stores the JWT in `localStorage`. This is a common pattern for SPAs but means:

- Tokens persist across browser sessions until they expire
- Tokens are accessible to JavaScript on the same origin
- Clearing `localStorage` logs the user out

## Password security

Passwords are hashed with bcrypt before storage. Plain text passwords are never stored.

Minimum password requirements:

- 12 characters minimum (enforced for bootstrap password)
- No maximum length

## Session management

MosBot OS uses stateless JWT authentication — there are no server-side sessions. To invalidate a
token before it expires, you must change `JWT_SECRET` (which invalidates all tokens) or wait for the
token to expire naturally.

## First-run bootstrap

On first startup, if `BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD` are set, MosBot API
creates an initial owner account. Remove `BOOTSTRAP_OWNER_PASSWORD` from `.env` after your first
login.

See [First Login](../getting-started/first-login) for the full procedure.

## Public endpoints

These endpoints do not require authentication:

| Endpoint                     | Description               |
| ---------------------------- | ------------------------- |
| `GET /health`                | Health check              |
| `GET /api/v1/config`         | Public configuration      |
| `POST /api/v1/auth/login`    | Login                     |
| `POST /api/v1/auth/register` | Registration (if enabled) |
