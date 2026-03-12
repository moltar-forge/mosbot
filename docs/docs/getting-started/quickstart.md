---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
sidebar_position: 3
---

Get MosBot OS running in under 10 minutes with the monorepo layout.

## Step 1: Clone the repository

```bash
git clone https://github.com/ByMosDev/mosbot-os.git
cd mosbot
```

## Step 2: Configure environment variables

```bash
cp api/.env.example .env
```

Edit `.env` in the repo root and set at least:

```bash
DB_PASSWORD=choose-a-strong-password
JWT_SECRET=your-long-random-secret-here
BOOTSTRAP_OWNER_EMAIL=admin@example.com
BOOTSTRAP_OWNER_PASSWORD=choose-another-strong-password-min-12-chars
```

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Step 3: Install dependencies

```bash
npm install
```

## Step 4: Start the stack

```bash
npm run compose:up
```

This starts:

| Service          | URL                                            | Description                          |
| ---------------- | ---------------------------------------------- | ------------------------------------ |
| MosBot API       | [http://localhost:3000](http://localhost:3000) | Backend API                          |
| MosBot Web       | [http://localhost:5173](http://localhost:5173) | UI (Vite dev server with hot-reload) |
| Workspace Server | [http://localhost:18780](http://localhost:18780) | OpenClaw workspace sidecar           |
| PostgreSQL       | localhost:5432                                 | Database (internal)                  |

## Step 5: Verify and log in

```bash
curl http://localhost:3000/health
curl http://localhost:18780/health
```

Open [http://localhost:5173](http://localhost:5173) and log in with the bootstrap credentials.

## Step 6: Secure your setup

1. Remove `BOOTSTRAP_OWNER_PASSWORD` from `.env` after first successful login.
2. Change the password in **Settings → Users**.
3. Restart API to confirm startup without bootstrap variables:

```bash
docker compose restart api
```

## Stop the stack

```bash
npm run compose:down
```
