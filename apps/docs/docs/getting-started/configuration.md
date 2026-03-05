---
id: configuration
title: Configuration Reference
sidebar_label: Configuration
sidebar_position: 4
---

All MosBot API configuration is provided via environment variables. Copy `.env.example` to `.env` in
the `mosbot-api` directory to get started.

## Required variables

These must be set before the API will start:

| Variable      | Description                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| `DB_PASSWORD` | PostgreSQL password. Set this to match your PostgreSQL configuration or generate a secure password.           |
| `JWT_SECRET`  | JWT signing secret. Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CORS_ORIGIN` | Exact dashboard origin (e.g. `http://localhost:5173`). Cannot be `*`.                                         |

## Server

| Variable   | Default       | Description                                                                |
| ---------- | ------------- | -------------------------------------------------------------------------- |
| `PORT`     | `3000`        | HTTP port the API listens on                                               |
| `NODE_ENV` | `development` | Set to `production` in production deployments                              |
| `TIMEZONE` | `UTC`         | IANA timezone for cron schedules and time displays (e.g. `Asia/Singapore`) |

## Database

| Variable      | Default     | Description                                                 |
| ------------- | ----------- | ----------------------------------------------------------- |
| `DB_HOST`     | `localhost` | PostgreSQL host                                             |
| `DB_PORT`     | `5432`      | PostgreSQL port                                             |
| `DB_NAME`     | `mosbot`    | Database name                                               |
| `DB_USER`     | `mosbot`    | Database user                                               |
| `DB_PASSWORD` | —           | See [Required variables](#required-variables) section above |

## Authentication

| Variable         | Default | Description                                                 |
| ---------------- | ------- | ----------------------------------------------------------- |
| `JWT_SECRET`     | —       | See [Required variables](#required-variables) section above |
| `JWT_EXPIRES_IN` | `7d`    | Token expiry duration (e.g. `7d`, `24h`, `1h`)              |

## Bootstrap (first run only)

These variables create the initial owner account on first startup. Remove `BOOTSTRAP_OWNER_PASSWORD`
after your first login.

| Variable                   | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `BOOTSTRAP_OWNER_EMAIL`    | Email for the initial owner account                             |
| `BOOTSTRAP_OWNER_PASSWORD` | Password (minimum 12 characters). **Remove after first login.** |
| `BOOTSTRAP_OWNER_NAME`     | Display name for the owner account (default: `Owner`)           |

## Task archiver

Completed tasks are automatically archived after a configurable number of days.

| Variable             | Default     | Description                                      |
| -------------------- | ----------- | ------------------------------------------------ |
| `ENABLE_ARCHIVER`    | `true`      | Enable the automatic task archiver               |
| `ARCHIVE_CRON`       | `0 3 * * *` | Cron schedule for archiving (default: 3am daily) |
| `ARCHIVE_AFTER_DAYS` | `7`         | Archive tasks completed more than N days ago     |
| `ARCHIVE_ON_STARTUP` | `false`     | Run archiver immediately on startup              |

## OpenClaw Workspace

Required for workspace file browsing, skills management, and config editing. Without these
variables, the workspace browser and skills features will be unavailable.

| Variable                       | Default | Description                                                                                                                                                                                                                                                           |
| ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_WORKSPACE_URL`       | —       | URL of the OpenClaw workspace service (e.g. `http://localhost:18780`)                                                                                                                                                                                                 |
| `OPENCLAW_WORKSPACE_TOKEN`     | —       | Bearer token for workspace service authentication. Obtain from OpenClaw admin panel.                                                                                                                                                                                  |
| `OPENCLAW_PATH_REMAP_PREFIXES` | `''`    | Comma-separated additional host path prefixes remapped to virtual workspace paths before allowlist checks. Built-ins are always active: `/home/node/.openclaw/workspace`, `~/.openclaw/workspace`, `/home/node/.openclaw`, `~/.openclaw` (most specific prefix wins). |

Virtual path conventions:

- Main workspace: `/workspace`
- Sub-agent workspaces: `/workspace-<agent-id>`
- Shared directories: `/projects`, `/skills`, `/docs`

## OpenClaw Gateway

Required for agent monitoring, live session data, and runtime control. Without these variables, the
agents page and agent monitoring features will be unavailable.

| Variable                      | Default | Description                                                 |
| ----------------------------- | ------- | ----------------------------------------------------------- |
| `OPENCLAW_GATEWAY_URL`        | —       | URL of the OpenClaw gateway (e.g. `http://localhost:18789`) |
| `OPENCLAW_GATEWAY_TOKEN`      | —       | Bearer token for gateway authentication                     |
| `OPENCLAW_GATEWAY_TIMEOUT_MS` | `15000` | Request timeout in milliseconds                             |

## OpenClaw Device Auth

Required for full session access with `operator.read`/`operator.write` scopes. These values are
generated by the OpenClaw device pairing flow. Without these, session details in the Agent Monitor
will be limited.

| Variable                      | Description                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `OPENCLAW_DEVICE_ID`          | Device identifier from the pairing flow                                                   |
| `OPENCLAW_DEVICE_PUBLIC_KEY`  | Ed25519 public key (base64url encoded). Generated during OpenClaw device pairing process. |
| `OPENCLAW_DEVICE_PRIVATE_KEY` | Ed25519 private key (base64url encoded)                                                   |
| `OPENCLAW_DEVICE_TOKEN`       | Device pairing token                                                                      |

## Data retention

Controls how long subagent session data and activity logs are kept.

| Variable                          | Default     | Description                              |
| --------------------------------- | ----------- | ---------------------------------------- |
| `SUBAGENT_RETENTION_DAYS`         | `30`        | Keep subagent session data for N days    |
| `ACTIVITY_LOG_RETENTION_DAYS`     | `7`         | Keep activity logs for N days            |
| `RETENTION_ARCHIVE_ENABLED`       | `true`      | Enable retention archiving               |
| `ENABLE_SUBAGENT_RETENTION_PURGE` | `true`      | Enable automatic purge of old data       |
| `SUBAGENT_RETENTION_CRON`         | `0 3 * * *` | Purge cron schedule (default: 3am daily) |
| `SUBAGENT_RETENTION_ON_STARTUP`   | `false`     | Run purge immediately on startup         |

## Model pricing (optional)

Enables live model cost data from OpenRouter for the Agent Monitor.

| Variable                            | Default     | Description                                        |
| ----------------------------------- | ----------- | -------------------------------------------------- |
| `OPENROUTER_API_KEY`                | —           | OpenRouter API key for fetching model pricing data |
| `MODEL_PRICING_REFRESH_INTERVAL_MS` | `604800000` | How often to refresh pricing (default: 7 days)     |

## Dashboard configuration

The dashboard (`mosbot-dashboard`) also has its own `.env` file:

| Variable       | Default                 | Description           |
| -------------- | ----------------------- | --------------------- |
| `VITE_API_URL` | `http://localhost:3000` | URL of the MosBot API |

:::note `VITE_*` variables are embedded into the built JavaScript bundle and are therefore
**public**. Never put secrets in dashboard environment variables. :::
