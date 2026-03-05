---
id: openclaw-json
title: openclaw.json Reference
sidebar_label: openclaw.json Reference
sidebar_position: 1
---

`openclaw.json` is the primary configuration file for OpenClaw. It defines agents, models, channels,
tools, memory, and all runtime behavior. This file lives in the root of the OpenClaw workspace
filesystem.

For a complete annotated example, see the [Sample Configuration](./sample-config).

---

## Top-level structure

```json
{
  "meta": { ... },
  "env": { ... },
  "logging": { ... },
  "secrets": { ... },
  "models": { ... },
  "agents": { ... },
  "tools": { ... },
  "messages": { ... },
  "commands": { ... },
  "channels": { ... },
  "bindings": [ ... ],
  "gateway": { ... },
  "memory": { ... },
  "plugins": { ... }
}
```

---

## `meta`

Version tracking metadata. Updated automatically by OpenClaw when the config is saved.

```json
{
  "meta": {
    "lastTouchedVersion": "2026.3.1",
    "lastTouchedAt": "2026-02-28T14:00:00.000Z"
  }
}
```

| Field                | Description                                     |
| -------------------- | ----------------------------------------------- |
| `lastTouchedVersion` | OpenClaw version that last modified this config |
| `lastTouchedAt`      | ISO 8601 timestamp of the last modification     |

---

## `env`

Environment variable declarations. Values can reference system environment variables using
`${VAR_NAME}` syntax. These variables are injected into the OpenClaw runtime.

```json
{
  "env": {
    "BRAVE_API_KEY": "${BRAVE_API_KEY}",
    "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}"
  }
}
```

Use `${VAR_NAME}` to reference environment variables set in the container/system. This keeps secrets
out of the config file itself.

---

## `logging`

Controls log output behavior.

```json
{
  "logging": {
    "level": "info",
    "consoleStyle": "json",
    "redactSensitive": "tools"
  }
}
```

| Field             | Values                           | Description              |
| ----------------- | -------------------------------- | ------------------------ |
| `level`           | `debug`, `info`, `warn`, `error` | Log verbosity level      |
| `consoleStyle`    | `json`, `pretty`                 | Log output format        |
| `redactSensitive` | `tools`, `all`, `none`           | What to redact from logs |

---

## `secrets`

Configures how secrets are resolved. The `env` provider reads secrets from environment variables.

```json
{
  "secrets": {
    "providers": {
      "default": {
        "source": "env"
      }
    }
  }
}
```

---

## `models`

Defines model providers and their available models. Supports multiple providers simultaneously.

```json
{
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://ollama.agents.svc.cluster.local:11434/v1",
        "apiKey": "__OPENCLAW_REDACTED__",
        "api": "openai-completions",
        "models": [
          {
            "id": "llama3.1:8b",
            "name": "llama3.1:8b",
            "api": "openai-completions",
            "reasoning": false,
            "input": ["text"],
            "cost": {
              "input": 0,
              "output": 0,
              "cacheRead": 0,
              "cacheWrite": 0
            },
            "contextWindow": 128000,
            "maxTokens": 32768
          }
        ]
      }
    }
  }
}
```

### Provider fields

| Field     | Description                                           |
| --------- | ----------------------------------------------------- |
| `baseUrl` | API base URL for the provider                         |
| `apiKey`  | API key (use `${ENV_VAR}` or `__OPENCLAW_REDACTED__`) |
| `api`     | API type: `openai-completions`                        |
| `models`  | Array of model definitions                            |

### Model fields

| Field           | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| `id`            | Model identifier used in agent config                          |
| `name`          | Display name                                                   |
| `api`           | API type for this model                                        |
| `reasoning`     | Whether the model supports reasoning/thinking                  |
| `input`         | Supported input types: `["text"]`, `["text", "image"]`         |
| `cost`          | Cost per million tokens (input, output, cacheRead, cacheWrite) |
| `contextWindow` | Maximum context window in tokens                               |
| `maxTokens`     | Maximum output tokens                                          |

### Built-in providers

OpenClaw has built-in support for these providers (no `models` section needed):

- `openrouter` — OpenRouter (access to 200+ models)
- `anthropic` — Anthropic Claude
- `openai` — OpenAI GPT

For these, use the provider prefix in model IDs: `openrouter/anthropic/claude-sonnet-4.6`

---

## `agents`

Defines agent defaults and the list of agents.

### `agents.defaults`

Default settings applied to all agents unless overridden:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/moonshotai/kimi-k2.5",
        "fallbacks": [
          "openrouter/google/gemini-2.5-flash",
          "openrouter/anthropic/claude-sonnet-4.6"
        ]
      },
      "models": {
        "openrouter/anthropic/claude-sonnet-4.6": {
          "alias": "Sonnet 4.6",
          "params": {
            "contextWindow": 200000,
            "maxTokens": 4096,
            "temperature": 0.4,
            "cacheControlTtl": "1h",
            "reasoning": true
          }
        }
      },
      "userTimezone": "Asia/Singapore",
      "envelopeTimezone": "user",
      "envelopeTimestamp": "on",
      "envelopeElapsed": "on",
      "compaction": {
        "mode": "safeguard",
        "reserveTokensFloor": 40000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 22000,
          "prompt": "Session context is nearing compaction...",
          "systemPrompt": "You are a memory extraction assistant..."
        }
      },
      "blockStreamingDefault": "off",
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8,
        "model": "openrouter/moonshotai/kimi-k2.5"
      }
    }
  }
}
```

#### Default model settings

| Field             | Description                                      |
| ----------------- | ------------------------------------------------ |
| `model.primary`   | Default primary model for all agents             |
| `model.fallbacks` | Ordered list of fallback models if primary fails |
| `models`          | Per-model parameter overrides (applied globally) |

#### Model params

| Param             | Description                              |
| ----------------- | ---------------------------------------- |
| `contextWindow`   | Override the model's context window      |
| `maxTokens`       | Maximum output tokens                    |
| `temperature`     | Sampling temperature (0.0–1.0)           |
| `cacheControlTtl` | Cache TTL for prompt caching (e.g. `1h`) |
| `reasoning`       | Enable reasoning/thinking mode           |

#### Envelope settings

| Field               | Values        | Description                                |
| ------------------- | ------------- | ------------------------------------------ |
| `userTimezone`      | IANA timezone | Timezone for timestamps shown to users     |
| `envelopeTimezone`  | `user`, `utc` | Which timezone to use in message envelopes |
| `envelopeTimestamp` | `on`, `off`   | Include timestamp in message envelopes     |
| `envelopeElapsed`   | `on`, `off`   | Include elapsed time in message envelopes  |

#### Compaction settings

Controls what happens when the context window approaches its limit:

| Field                             | Description                                         |
| --------------------------------- | --------------------------------------------------- |
| `mode`                            | `safeguard` — compact when near limit               |
| `reserveTokensFloor`              | Minimum tokens to reserve for the response          |
| `memoryFlush.enabled`             | Flush important context to memory before compaction |
| `memoryFlush.softThresholdTokens` | Token count that triggers a memory flush            |
| `memoryFlush.prompt`              | Prompt sent to the agent to trigger memory writing  |

#### Concurrency

| Field                     | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `blockStreamingDefault`   | `on` or `off` — whether to block streaming by default |
| `maxConcurrent`           | Max concurrent agent sessions                         |
| `subagents.maxConcurrent` | Max concurrent subagent invocations                   |
| `subagents.model`         | Default model for subagents                           |

### `agents.list`

Array of agent definitions:

```json
{
  "agents": {
    "list": [
      {
        "id": "coo",
        "default": true,
        "workspace": "/home/node/.openclaw/workspace-coo",
        "model": {
          "primary": "openrouter/moonshotai/kimi-k2.5",
          "fallbacks": ["openrouter/deepseek/deepseek-chat"]
        },
        "heartbeat": {
          "every": "30m",
          "activeHours": {
            "start": "08:00",
            "end": "06:00"
          },
          "model": "google/gemini-2.5-flash-lite",
          "session": "isolated",
          "target": "last",
          "prompt": "Read HEARTBEAT.md if it exists...",
          "ackMaxChars": 200
        },
        "identity": {
          "name": "MosBot",
          "theme": "Research - Delegation - Execution - Orchestration",
          "emoji": "🤖"
        },
        "subagents": {
          "allowAgents": ["cto", "cpo", "cmo"]
        }
      }
    ]
  }
}
```

#### Agent fields

| Field       | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `id`        | Unique agent identifier (used in workspace paths, bindings, etc.) |
| `default`   | `true` if this is the default agent                               |
| `workspace` | Absolute path to the agent's workspace directory                  |
| `model`     | Model overrides for this agent (overrides defaults)               |
| `heartbeat` | Scheduled heartbeat configuration                                 |
| `identity`  | Agent display name, theme, and emoji                              |
| `subagents` | Which agents this agent can invoke as subagents                   |

#### Heartbeat fields

| Field               | Description                                         |
| ------------------- | --------------------------------------------------- |
| `every`             | Interval (e.g. `30m`, `1h`, `2h`)                   |
| `activeHours.start` | Start of active hours (24h format)                  |
| `activeHours.end`   | End of active hours (24h format, can wrap midnight) |
| `model`             | Model to use for heartbeat (use a cheap/fast model) |
| `session`           | `isolated` — heartbeat runs in its own session      |
| `target`            | `last` — target the most recent session             |
| `prompt`            | Prompt sent during heartbeat                        |
| `ackMaxChars`       | Maximum characters in the heartbeat acknowledgment  |

---

## `tools`

Configures which tools are available and how they behave.

```json
{
  "tools": {
    "sessions": {
      "visibility": "agent"
    },
    "agentToAgent": {
      "enabled": true
    },
    "elevated": {
      "enabled": true
    },
    "exec": {
      "host": "gateway"
    }
  }
}
```

| Field                  | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| `sessions.visibility`  | `agent` — agents can see their own sessions. **Required for Agent Monitor.** |
| `agentToAgent.enabled` | Allow agents to invoke other agents. **Required for subagent tracking.**     |
| `elevated.enabled`     | Enable elevated (privileged) tools                                           |
| `exec.host`            | Where exec commands run: `gateway`                                           |

---

## `messages`

Controls message acknowledgment behavior.

```json
{
  "messages": {
    "ackReactionScope": "all"
  }
}
```

| Field              | Values                 | Description                                 |
| ------------------ | ---------------------- | ------------------------------------------- |
| `ackReactionScope` | `all`, `agent`, `none` | Which messages get reaction acknowledgments |

---

## `commands`

Controls native command and skill behavior.

```json
{
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "raw"
  }
}
```

| Field          | Values              | Description                                     |
| -------------- | ------------------- | ----------------------------------------------- |
| `native`       | `auto`, `on`, `off` | Enable native commands                          |
| `nativeSkills` | `auto`, `on`, `off` | Enable skills as commands                       |
| `restart`      | `true`, `false`     | Allow the `/restart` command                    |
| `ownerDisplay` | `raw`, `formatted`  | How owner messages are displayed in the gateway |

---

## `channels`

Configures communication channel integrations.

### Telegram

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "streaming": "partial",
      "groupAllowFrom": ["tg:123456789"],
      "allowFrom": ["tg:123456789"],
      "accounts": {
        "default": {
          "botToken": "${TELEGRAM_BOT_TOKEN}",
          "dmPolicy": "pairing",
          "groupPolicy": "allowlist",
          "groups": {
            "-1001234567890": {
              "requireMention": false
            }
          },
          "groupAllowFrom": ["tg:123456789"],
          "allowFrom": ["tg:123456789"]
        }
      }
    }
  }
}
```

:::tip Use Topics for Parallel Sessions If you use a Telegram Supergroup with Topics enabled,
OpenClaw treats each topic as a separate session. This allows a single agent to handle multiple
parallel tasks (e.g. "Dev", "Research") without needing multiple agent definitions. :::

#### Telegram top-level fields

| Field            | Values  | Description                                                                                                   |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `enabled`        | boolean | Enable/disable Telegram channel                                                                               |
| `streaming`      | string  | Streaming mode (e.g., `"partial"`)                                                                            |
| `groupAllowFrom` | array   | Default user IDs allowed to interact in groups (applies to all accounts)                                      |
| `allowFrom`      | array   | Default user IDs allowed to interact (set when using `groupPolicy: "allowlist"` to avoid validation warnings) |

When using `groupPolicy: "allowlist"` at the account level, you should set both `groupAllowFrom` and
`allowFrom` at the top-level `channels.telegram` object to avoid validation warnings.

#### Telegram account fields

| Field                       | Values                        | Description                                                                                           |
| --------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `botToken`                  | string                        | Telegram bot token (use `${ENV_VAR}`)                                                                 |
| `dmPolicy`                  | `pairing`, `open`, `closed`   | Who can DM the bot                                                                                    |
| `groupPolicy`               | `allowlist`, `open`, `closed` | Which groups the bot responds in                                                                      |
| `groups`                    | object                        | Group-specific settings (keyed by group ID)                                                           |
| `groupAllowFrom`            | array                         | User IDs allowed to interact in groups                                                                |
| `allowFrom`                 | array                         | User IDs allowed to interact (set when using `groupPolicy: "allowlist"` to avoid validation warnings) |
| `groups[id].requireMention` | boolean                       | Whether the bot must be @mentioned in the group                                                       |

---

## `bindings`

Maps agents to channels. Determines which agent responds to messages from which channel account.

```json
{
  "bindings": [
    {
      "agentId": "coo",
      "match": {
        "channel": "telegram",
        "accountId": "default"
      }
    },
    {
      "agentId": "pa",
      "match": {
        "channel": "telegram",
        "accountId": "maya"
      }
    }
  ]
}
```

| Field             | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| `agentId`         | The agent that handles messages from this channel                            |
| `match.channel`   | Channel type (e.g. `telegram`)                                               |
| `match.accountId` | Account ID within the channel (matches key in `channels.<channel>.accounts`) |

---

## `gateway`

Configures the OpenClaw gateway service.

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": ["http://localhost:18789", "https://your-domain.example.com"],
      "allowInsecureAuth": true
    },
    "auth": {
      "mode": "token"
    },
    "tls": {
      "enabled": true,
      "autoGenerate": true
    }
  }
}
```

| Field                         | Description                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `port`                        | Gateway port (default: `18789`)                                                                     |
| `mode`                        | `local` for local/LAN operation                                                                     |
| `bind`                        | `lan` to bind to all LAN interfaces                                                                 |
| `controlUi.allowedOrigins`    | CORS allowed origins for the gateway UI — **must include your MosBot dashboard URL**                |
| `controlUi.allowInsecureAuth` | Allow operator-scoped connections without device auth. Required when device auth is not configured. |
| `auth.mode`                   | `token` for bearer token authentication                                                             |
| `tls.enabled`                 | Enable TLS                                                                                          |
| `tls.autoGenerate`            | Auto-generate a self-signed certificate                                                             |

:::info MosBot Integration

MosBot API connects to the gateway via WebSocket. For this to work:

1. Add your MosBot dashboard URL to `controlUi.allowedOrigins`
2. Either configure device auth credentials in MosBot API's `.env`, or set
   `controlUi.allowInsecureAuth: true`

See [Key Settings for MosBot](./mosbot-required-config) for details. :::

---

## `memory`

Configures the agent memory backend.

```json
{
  "memory": {
    "backend": "qmd",
    "citations": "auto",
    "qmd": {
      "includeDefaultMemory": true,
      "paths": [
        {
          "path": "../shared/docs",
          "name": "shared-docs",
          "pattern": "**/*.md"
        }
      ],
      "update": {
        "interval": "5m",
        "debounceMs": 15000
      },
      "limits": {
        "maxResults": 6,
        "timeoutMs": 4000
      }
    }
  }
}
```

| Field                      | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `backend`                  | Memory backend type: `qmd` (query-based markdown) |
| `citations`                | `auto` — automatically include memory citations   |
| `qmd.includeDefaultMemory` | Include the agent's default memory files          |
| `qmd.paths`                | Additional paths to include in memory search      |
| `qmd.update.interval`      | How often to refresh the memory index             |
| `qmd.update.debounceMs`    | Debounce delay for memory updates                 |
| `qmd.limits.maxResults`    | Maximum memory results per query                  |
| `qmd.limits.timeoutMs`     | Memory query timeout                              |

### Memory paths

Each entry in `qmd.paths` adds a directory to the memory search:

| Field     | Description                            |
| --------- | -------------------------------------- |
| `path`    | Path relative to the agent's workspace |
| `name`    | Identifier for this memory source      |
| `pattern` | Glob pattern for files to include      |

---

## `plugins`

Enables optional plugins.

```json
{
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

Enable the Telegram plugin to activate Telegram channel support.
