---
id: configuration
title: Configuration Reference
sidebar_label: Configuration
sidebar_position: 4
---

All MosBot API configuration is provided via environment variables. Copy `.env.example` to `.env` in
the repository root to get started.

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

Required to bootstrap OpenClaw gateway connectivity and the MosBot pairing wizard. Without these
variables, gateway-backed features remain unavailable.

| Variable                         | Default     | Description                                                                                           |
| -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `OPENCLAW_GATEWAY_URL`           | —           | URL of the OpenClaw gateway (e.g. `http://localhost:18789`)                                          |
| `OPENCLAW_GATEWAY_TOKEN`         | —           | Gateway token used to bootstrap MosBot's device pairing flow                                          |
| `OPENCLAW_GATEWAY_TIMEOUT_MS`    | `15000`     | Request timeout in milliseconds                                                                       |
| `OPENCLAW_WS_PERSISTENT_RPC`     | auto        | Tri-state override for gateway RPC mode: `true` force persistent, `false` force short-lived, unset uses runtime default (`NODE_ENV !== test`) |
| `OPENCLAW_WS_RPC_IDLE_MS`        | `1800000`   | Idle-close window for persistent gateway RPC socket (30 minutes by default)                          |
| `OPENCLAW_WS_RPC_MAX_INFLIGHT`   | `1`         | Max in-flight RPCs over the persistent socket (default serialized through one in-flight request)     |
| `OPENCLAW_GATEWAY_INSECURE_TLS`  | `false`     | Set `true` only when gateway uses self-signed/internal certs and you explicitly accept insecure TLS  |

:::important TLS behavior change
MosBot now verifies gateway TLS certificates by default for WebSocket RPCs. If your environment uses
self-signed/internal certificates, set `OPENCLAW_GATEWAY_INSECURE_TLS=true` explicitly.
:::

## OpenClaw Device Auth

MosBot now manages device auth through the dashboard pairing workflow. After setting
`OPENCLAW_GATEWAY_URL` and `OPENCLAW_GATEWAY_TOKEN`, sign in as an `owner` or `admin`, open
`Settings -> OpenClaw Pairing`, then complete `Start pairing` and `Finalize pairing`.

## Subagent runtime files

Legacy runtime file integrations under `/runtime/mosbot/*` are retired and are no longer part of the
supported workspace contract. Configure subagent observability through supported OpenClaw gateway
and activity APIs instead of runtime JSON/JSONL files.

## Model pricing (optional)

Enables live model cost data from OpenRouter for the Agent Monitor.

| Variable                            | Default     | Description                                        |
| ----------------------------------- | ----------- | -------------------------------------------------- |
| `OPENROUTER_API_KEY`                | —           | OpenRouter API key for fetching model pricing data |
| `MODEL_PRICING_REFRESH_INTERVAL_MS` | `604800000` | How often to refresh pricing (default: 7 days)     |

## Dashboard configuration

The web app (`web`) also has its own `.env` file:

| Variable       | Default                 | Description           |
| -------------- | ----------------------- | --------------------- |
| `VITE_API_URL` | `http://localhost:3000` | URL of the MosBot API |

:::note `VITE_*` variables are embedded into the built JavaScript bundle and are therefore
**public**. Never put secrets in dashboard environment variables. :::
