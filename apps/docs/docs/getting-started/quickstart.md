---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
sidebar_position: 3
---

Get MosBot OS running in under 10 minutes using Docker Compose.

:::tip OpenClaw first

For the complete MosBot OS experience — including agent monitoring, workspace browsing, and the
agents page — [install OpenClaw first](../openclaw/overview). While MosBot OS can start without it, the
core functionality requires OpenClaw. :::

## Step 1: Clone both repositories

MosBot OS consists of two repos that must be cloned **side-by-side** into the same parent folder:

```bash
git clone https://github.com/bymosbot/mosbot-api.git
git clone https://github.com/bymosbot/mosbot-dashboard.git
```

Your directory layout should look like:

```text
parent-folder/
├── mosbot-api/
└── mosbot-dashboard/
```

:::warning Keep repos side-by-side

The Docker Compose setup in `mosbot-api` mounts `../mosbot-dashboard` as a volume. If the repos are
not siblings, the dashboard will not load. :::

## Step 2: Configure environment variables

```bash
cd mosbot-api
cp .env.example .env
```

Open `.env` in your editor and set these required values:

```bash
# Strong password for PostgreSQL
DB_PASSWORD=choose-a-strong-password

# JWT signing secret — generate with:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-long-random-secret-here

# Your first owner account (created automatically on first start)
BOOTSTRAP_OWNER_EMAIL=admin@example.com
BOOTSTRAP_OWNER_PASSWORD=choose-another-strong-password-min-12-chars
```

:::tip Generate a secure JWT_SECRET Run this command to generate a cryptographically secure secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

:::

## Step 3: Start the stack

**Primary method (recommended):**

```bash
cd mosbot-api
make up
```

This is the recommended way to start the full stack for local development. It starts all services
(API, Dashboard, and PostgreSQL) with a single command.

**Alternative methods:**

If you prefer using Docker Compose directly:

```bash
cd mosbot-api
docker compose up -d
```

This starts three services:

| Service          | URL                                            | Description                          |
| ---------------- | ---------------------------------------------- | ------------------------------------ |
| MosBot API       | [http://localhost:3000](http://localhost:3000) | Backend API                          |
| MosBot Dashboard | [http://localhost:5173](http://localhost:5173) | UI (Vite dev server with hot-reload) |
| PostgreSQL       | localhost:5432                                 | Database (internal)                  |

Wait for all services to be healthy (usually 15–30 seconds):

```bash
docker compose ps
```

All services should show `healthy` or `running`.

## Step 4: Verify the API

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}
```

## Step 5: Log in

Open **[http://localhost:5173](http://localhost:5173)** in your browser and log in with the
credentials you set in `BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD`.

You should see the MosBot Dashboard with an empty task board.

## Step 6: Secure your setup

After your first successful login:

1. **Remove `BOOTSTRAP_OWNER_PASSWORD` from `.env`** (or set it to an empty string). This prevents
   the bootstrap account from being re-created or reset on restart.
2. Change your password in the dashboard under **Settings → Users**.
3. Restart the API to confirm it starts without the bootstrap variable:

   ```bash
   docker compose restart api
   ```

## What's next?

- **Connect OpenClaw** — if you haven't already, connect your OpenClaw instance to enable agent
  monitoring, workspace browsing, and the agents page. See [OpenClaw Integration](../openclaw/overview).
- **Invite users** — add team members under **Settings → Users**.
- **Create tasks** — start using the task board to manage work.
- **Explore features** — see the [Features](../features/task-management) section for a full
  overview.

## Stopping the stack

**Primary method:**

```bash
cd mosbot-api
make down
```

**Alternative:**

```bash
cd mosbot-api
docker compose down
```

To also remove the database volume (destructive):

```bash
docker compose down -v
```

## Production deployment

The quickstart uses a Vite dev server for the dashboard (with hot-reload). For production, use the
optimized nginx build:

**Primary method:**

```bash
cd mosbot-api
make up-prod
```

**Alternative:**

```bash
cd mosbot-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

See [Deployment → Docker](../deployment/docker) for details.
