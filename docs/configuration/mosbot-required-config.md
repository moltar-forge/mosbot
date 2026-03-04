---
id: mosbot-required-config
title: Key openclaw.json Settings for MosBot
sidebar_label: MosBot Required Config
sidebar_position: 4
---

MosBot API connects to OpenClaw via two services: the workspace service (port 8080) and the gateway
(port 18789). Certain `openclaw.json` settings must be configured correctly for MosBot features to
work. This page lists the settings that matter most.

:::tip For a complete reference of every field, see the [openclaw.json Reference](./openclaw-json).
For a complete annotated example, see the [Sample Configuration](./sample-config). :::

---

## Gateway: allowed origins

**Required for the dashboard to communicate with the gateway.**

```json
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": [
        "http://localhost:18789",
        "https://your-openclaw-domain.example.com",
        "https://your-mosbot-dashboard.example.com"
      ]
    }
  }
}
```

Add both your OpenClaw UI origin and your MosBot dashboard origin. If the dashboard origin is
missing, the browser will block WebSocket and API calls to the gateway with a CORS error.

---

## Gateway: insecure auth (development fallback)

**Required when device auth is not configured.**

```json
{
  "gateway": {
    "controlUi": {
      "allowInsecureAuth": true
    }
  }
}
```

MosBot API connects to the gateway via WebSocket using one of two auth paths:

| Path                       | When used                                          | What it grants                          |
| -------------------------- | -------------------------------------------------- | --------------------------------------- |
| **Device auth**            | `OPENCLAW_DEVICE_*` env vars are set in MosBot API | Full `operator.read/write` scopes       |
| **Insecure auth fallback** | Device auth vars are not set                       | Operator scopes via `allowInsecureAuth` |

If you have not configured device auth credentials in MosBot API's `.env`, set
`allowInsecureAuth: true` in `openclaw.json`. Without it, the gateway will reject MosBot's
connection and the Agent Monitor will show no data.

:::note In production, prefer device auth over `allowInsecureAuth`. See
[Device Authentication](#device-authentication) below. :::

---

## Gateway: authentication mode

**Required for bearer token auth.**

```json
{
  "gateway": {
    "auth": {
      "mode": "token"
    }
  }
}
```

Set `auth.mode: "token"` so MosBot API can authenticate using the `OPENCLAW_GATEWAY_TOKEN`
environment variable.

---

## Tools: session visibility

**Required for session data to appear in the Agent Monitor.**

```json
{
  "tools": {
    "sessions": {
      "visibility": "agent"
    }
  }
}
```

`visibility: "agent"` allows agents to see their own session history. Without this, the
`sessions_list` and `sessions_history` tool calls that MosBot uses will return empty results.

---

## Tools: agent-to-agent

**Required for subagent features.**

```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true
    }
  }
}
```

Enable this if you want agents to delegate work to other agents as subagents. MosBot's subagent
activity tracking depends on this being enabled.

---

## Agents: workspace paths

**Required for the workspace file browser and agents page.**

Each agent must have a `workspace` path that points to a real directory on the workspace filesystem:

```json
{
  "agents": {
    "list": [
      {
        "id": "coo",
        "default": true,
        "workspace": "/home/node/.openclaw/workspace-coo"
      }
    ]
  }
}
```

MosBot API reads this path from `openclaw.json` via the workspace service to determine where each
agent's files live. If the path is missing or wrong, the workspace browser will show an empty
directory or a 404.

---

## Agents: identity

**Required for the agents page and agent selector.**

```json
{
  "agents": {
    "list": [
      {
        "id": "coo",
        "identity": {
          "name": "MosBot",
          "theme": "Research - Delegation - Execution - Orchestration",
          "emoji": "🤖"
        }
      }
    ]
  }
}
```

MosBot reads `identity.name` and `identity.emoji` to display agents in the agents page and workspace
selector. Without these, agents will show as their raw `id` with no icon.

---

## Memory: shared docs path

**Recommended for agents to access shared documentation.**

```json
{
  "memory": {
    "backend": "qmd",
    "qmd": {
      "includeDefaultMemory": true,
      "paths": [
        {
          "path": "../docs",
          "name": "shared-docs",
          "pattern": "**/*.md"
        }
      ]
    }
  }
}
```

The `../docs` path (relative to each agent's workspace) points to the shared `docs/` directory at
the workspace root. This makes shared documentation available as memory to all agents.

:::info Workspace path convention MosBot expects shared content at the workspace root:

```text
/                         ← workspace root
├── workspace-coo/        ← agent workspace
├── workspace-cto/        ← agent workspace
├── docs/                 ← shared docs (memory source)
├── projects/             ← shared projects
└── openclaw.json
```

:::

---

## Channels: Telegram bot token

**Required if using Telegram.**

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "accounts": {
        "default": {
          "botToken": "${TELEGRAM_BOT_TOKEN}"
        }
      }
    }
  },
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

Always reference the bot token via `${TELEGRAM_BOT_TOKEN}` — never hardcode it. The matching
`plugins.entries.telegram.enabled: true` is also required to activate Telegram support.

---

## Device authentication

**Recommended for production: full operator scopes without `allowInsecureAuth`.**

Device auth uses an Ed25519 key pair to authenticate MosBot API as a trusted device. Once paired,
MosBot receives `operator.read`, `operator.write`, and `operator.admin` scopes, enabling full
session access.

### Step 1: Generate credentials in OpenClaw

Follow OpenClaw's device pairing procedure to generate:

- A device ID
- An Ed25519 public/private key pair
- A device token

### Step 2: Configure MosBot API

Add the credentials to `mosbot-api/.env`:

```bash
OPENCLAW_DEVICE_ID=your-device-id
OPENCLAW_DEVICE_PUBLIC_KEY=your-ed25519-public-key-base64url
OPENCLAW_DEVICE_PRIVATE_KEY=your-ed25519-private-key-base64url
OPENCLAW_DEVICE_TOKEN=your-device-token
```

### Step 3: Remove `allowInsecureAuth`

Once device auth is working, you can remove `allowInsecureAuth: true` from `openclaw.json` (or set
it to `false`).

---

## Minimal openclaw.json for MosBot

The smallest `openclaw.json` that gives MosBot full functionality:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/anthropic/claude-sonnet-4.6",
        "fallbacks": []
      }
    },
    "list": [
      {
        "id": "agent",
        "default": true,
        "workspace": "/home/node/.openclaw/workspace-agent",
        "identity": {
          "name": "Agent",
          "theme": "General Assistant",
          "emoji": "🤖"
        }
      }
    ]
  },
  "tools": {
    "sessions": {
      "visibility": "agent"
    },
    "agentToAgent": {
      "enabled": true
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": ["http://localhost:18789", "https://your-mosbot-dashboard.example.com"],
      "allowInsecureAuth": true
    },
    "auth": {
      "mode": "token"
    },
    "tls": {
      "enabled": false
    }
  },
  "memory": {
    "backend": "qmd",
    "qmd": {
      "includeDefaultMemory": true
    }
  }
}
```

---

## Quick reference

| Setting                                 | Required for                      | Default if missing    |
| --------------------------------------- | --------------------------------- | --------------------- |
| `gateway.controlUi.allowedOrigins`      | Dashboard → gateway communication | CORS errors           |
| `gateway.controlUi.allowInsecureAuth`   | Gateway auth without device auth  | Connection rejected   |
| `gateway.auth.mode: "token"`            | Bearer token auth                 | Auth may fail         |
| `tools.sessions.visibility: "agent"`    | Agent Monitor session data        | Empty session list    |
| `tools.agentToAgent.enabled`            | Subagent tracking                 | Subagents not tracked |
| `agents[].workspace`                    | Workspace browser, agents page    | 404 / empty workspace |
| `agents[].identity`                     | Agents page display names         | Raw IDs, no icons     |
| `memory.qmd.paths`                      | Shared docs in agent memory       | No shared memory      |
| `channels.telegram.accounts[].botToken` | Telegram integration              | Telegram disabled     |
| `plugins.entries.telegram.enabled`      | Telegram plugin activation        | Telegram disabled     |
