---
id: first-login
title: First Login & Security Setup
sidebar_label: First Login
sidebar_position: 5
---

After starting MosBot OS for the first time, complete these steps to secure your installation.

## 1. Log in

Open **[http://localhost:5173](http://localhost:5173)** (or your configured dashboard URL) and log
in with:

- **Email**: the value of `BOOTSTRAP_OWNER_EMAIL` from your `.env`
- **Password**: the value of `BOOTSTRAP_OWNER_PASSWORD` from your `.env`

## 2. Remove the bootstrap password

The `BOOTSTRAP_OWNER_PASSWORD` variable is only needed for the very first startup. Once you've
logged in successfully:

1. Open `mosbot-api/.env`
2. Remove or blank out `BOOTSTRAP_OWNER_PASSWORD`:

   ```bash
   # BOOTSTRAP_OWNER_PASSWORD=  # removed after first login
   ```

3. Restart the API:

   ```bash
   cd mosbot-api
   docker compose restart api
   # or: make restart (if available)
   ```

This prevents the bootstrap password from being used to reset or recreate the owner account.

## 3. Change your password

It's good practice to change the bootstrap password to something you've chosen yourself:

1. In the dashboard, go to **Settings → Users**
2. Find your account and click **Edit**
3. Set a new strong password

## 4. Invite additional users

If you have team members who need access:

1. Go to **Settings → Users**
2. Click **Add User**
3. Assign an appropriate role:

| Role      | Access level                                               |
| --------- | ---------------------------------------------------------- |
| **Owner** | Full access, including user management and system settings |
| **Admin** | Full access except user management                         |
| **User**  | Read/write access to tasks and workspaces                  |
| **Agent** | Agent-level access (used for AI agent accounts)            |

See [Security → Roles & Permissions](../security/roles-permissions) for the full permissions matrix.

## 5. Connect OpenClaw

If you installed OpenClaw as recommended, add the integration variables to your `.env` to enable
agent monitoring, workspace browsing, and agents page features:

```bash
OPENCLAW_WORKSPACE_URL=http://localhost:18780
OPENCLAW_WORKSPACE_TOKEN=your-workspace-token
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
```

Then restart the API:

```bash
cd mosbot-api
docker compose restart api
```

See [OpenClaw Integration](../openclaw/overview) for the full setup guide.

## Production checklist

Before exposing MosBot OS to the internet, review the
[Production Checklist](../deployment/production).
