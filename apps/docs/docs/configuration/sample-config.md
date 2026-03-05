---
id: sample-config
title: Sample Configuration
sidebar_label: Sample Config
sidebar_position: 2
---

This is a complete, annotated `openclaw.json` configuration for a multi-agent MosBot OS setup. It
demonstrates a team of 5 agents with Telegram integration, Ollama local models, and OpenRouter cloud
models.

Use this as a starting point and adapt it to your needs.

:::tip For a complete reference of every field, see the [openclaw.json Reference](./openclaw-json).
:::

---

## Complete sample

```json
{
  "meta": {
    "lastTouchedVersion": "2026.3.1",
    "lastTouchedAt": "2026-02-28T14:00:00.000Z"
  },
```

The `meta` section is managed automatically by OpenClaw. You don't need to edit it.

```json
  "env": {
    "BRAVE_API_KEY": "${BRAVE_API_KEY}",
    "MOSBOT_CF_ACCESS_CLIENT_ID": "${MOSBOT_CF_ACCESS_CLIENT_ID}",
    "MOSBOT_CF_ACCESS_CLIENT_SECRET": "${MOSBOT_CF_ACCESS_CLIENT_SECRET}",
    "MOSBOT_EMAIL_COO": "${MOSBOT_EMAIL_COO}",
    "MOSBOT_PASSWORD_COO": "${MOSBOT_PASSWORD_COO}",
    "MOSBOT_EMAIL_CTO": "${MOSBOT_EMAIL_CTO}",
    "MOSBOT_PASSWORD_CTO": "${MOSBOT_PASSWORD_CTO}"
  },
```

The `env` section declares environment variables that OpenClaw needs. Use `${VAR_NAME}` to reference
variables from the container environment — this keeps secrets out of the config file. Set these in
your Kubernetes secret or Docker environment.

```json
  "logging": {
    "level": "info",
    "consoleStyle": "json",
    "redactSensitive": "tools"
  },
```

Logging at `info` level with JSON output (good for log aggregation). `redactSensitive: "tools"`
redacts sensitive data from tool call logs.

```json
  "secrets": {
    "providers": {
      "default": {
        "source": "env"
      }
    }
  },
```

Use environment variables as the secret source. This is the standard configuration.

---

## Models section

```json
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
          },
          {
            "id": "qwen2.5:14b",
            "name": "qwen2.5:14b",
            "api": "openai-completions",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 131072,
            "maxTokens": 32768
          }
        ]
      }
    }
  },
```

This defines a local Ollama provider running in Kubernetes. The `baseUrl` points to the Ollama
service in the `agents` namespace. Cost is 0 for local models. OpenRouter models (like
`openrouter/anthropic/claude-sonnet-4.6`) are built-in and don't need to be declared here.

---

## Agents section

```json
  "agents": {
    "defaults": {
      "model": {
        "primary": "openrouter/moonshotai/kimi-k2.5",
        "fallbacks": [
          "openrouter/google/gemini-2.5-flash",
          "openrouter/deepseek/deepseek-chat",
          "openrouter/anthropic/claude-sonnet-4.6"
        ]
      },
```

The default primary model for all agents is Kimi K2.5 (cost-effective, capable). Fallbacks are tried
in order if the primary fails or is unavailable.

```json
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
        },
        "openrouter/google/gemini-2.5-flash": {
          "alias": "Gemini 2.5 Flash",
          "params": {
            "maxTokens": 2048,
            "temperature": 0.4,
            "contextWindow": 128000,
            "cacheControlTtl": "1h"
          }
        }
      },
```

Per-model parameter overrides. These apply globally whenever a model is used.
`cacheControlTtl: "1h"` enables prompt caching for cost savings. Lower temperature (0.3–0.4) for
more focused outputs; higher (0.7) for more creative tasks.

```json
      "userTimezone": "Asia/Singapore",
      "envelopeTimezone": "user",
      "envelopeTimestamp": "on",
      "envelopeElapsed": "on",
```

Timestamps in messages use the user's timezone (Asia/Singapore). `envelopeElapsed: "on"` shows how
long each response took — useful for monitoring.

```json
      "compaction": {
        "mode": "safeguard",
        "reserveTokensFloor": 40000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 22000,
          "prompt": "Session context is nearing compaction. Use the write tool to append important decisions, actions, and learnings to memory/YYYY-MM-DD.md. If nothing durable to store, reply NO_REPLY.",
          "systemPrompt": "You are a memory extraction assistant. Before session compaction, you must preserve important context by writing to the daily memory file using the write tool."
        }
      },
```

When the context window approaches its limit, OpenClaw triggers a memory flush. The agent writes
important context to its daily memory file before the session is compacted. This preserves
continuity across long sessions.

```json
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8,
        "model": "openrouter/moonshotai/kimi-k2.5"
      }
    },
```

Limit concurrent sessions to 4 per agent. Subagents (spawned by an agent to delegate work) can run
up to 8 concurrently and use Kimi K2.5 by default.

### Agent definitions

```json
    "list": [
      {
        "id": "coo",
        "default": true,
        "workspace": "/home/node/.openclaw/workspace-coo",
```

The `coo` agent is the default agent — it handles messages that aren't explicitly routed to another
agent. The workspace path is where this agent's files, memory, and skills live.

```json
        "model": {
          "primary": "openrouter/moonshotai/kimi-k2.5",
          "fallbacks": [
            "openrouter/deepseek/deepseek-chat",
            "openrouter/google/gemini-2.5-flash"
          ]
        },
```

Agent-specific model overrides. This COO agent uses Kimi K2.5 as primary with two fallbacks.

```json
        "heartbeat": {
          "every": "30m",
          "activeHours": {
            "start": "08:00",
            "end": "06:00"
          },
          "model": "google/gemini-2.5-flash-lite",
          "session": "isolated",
          "target": "last",
          "prompt": "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.",
          "ackMaxChars": 200
        },
```

The heartbeat runs every 30 minutes during active hours (8am to 6am next day — essentially always on
except for a 2-hour window). It uses a cheap, fast model (Gemini Flash Lite) to check in. The
`HEARTBEAT.md` file in the workspace defines what to check. If nothing needs attention, the agent
replies `HEARTBEAT_OK` and no notification is sent.

```json
        "identity": {
          "name": "MosBot",
          "theme": "Research - Delegation - Execution - Orchestration",
          "emoji": "🤖"
        },
        "subagents": {
          "allowAgents": ["cto", "cpo", "cmo"]
        }
      },
```

The COO agent can delegate work to the CTO, CPO, and CMO agents as subagents.

```json
      {
        "id": "cto",
        "workspace": "/home/node/.openclaw/workspace-cto",
        "model": {
          "primary": "openrouter/anthropic/claude-sonnet-4.6",
          "fallbacks": [
            "openrouter/anthropic/claude-opus-4.6",
            "openrouter/moonshotai/kimi-k2.5"
          ]
        },
        "identity": {
          "name": "Elon",
          "theme": "Tech Architect",
          "emoji": "💼"
        }
      },
```

The CTO agent uses Claude Sonnet as primary (better for technical/code tasks) with Claude Opus as
the first fallback for complex reasoning tasks.

---

## Tools section

```json
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
  },
```

- `sessions.visibility: "agent"` — agents can see their own session history
- `agentToAgent.enabled: true` — agents can invoke each other (required for subagent delegation)
- `elevated.enabled: true` — enables privileged tools
- `exec.host: "gateway"` — exec commands run on the gateway host

---

## Channels section

```json
  "channels": {
    "telegram": {
      "enabled": true,
      "streaming": "partial",
      "groupAllowFrom": [
        "tg:123456789"
      ],
      "allowFrom": [
        "tg:123456789"
      ],
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
          "groupAllowFrom": [
            "tg:123456789"
          ],
          "allowFrom": [
            "tg:123456789"
          ]
        },
        "maya": {
          "botToken": "${TELEGRAM_BOT_TOKEN_MAYA}",
          "dmPolicy": "pairing",
          "groupPolicy": "allowlist",
          "groupAllowFrom": [
            "tg:123456789"
          ],
          "allowFrom": [
            "tg:123456789"
          ]
        }
      }
    }
  },
```

Two Telegram bots are configured:

- `default` — the main MosBot bot, responds in specific groups without requiring a mention
- `maya` — a separate bot for the PA agent, DMs only with pairing

`dmPolicy: "pairing"` means users must be paired (authorized) before they can DM the bot.
`groupAllowFrom` restricts which Telegram user IDs can interact in groups. When using
`groupPolicy: "allowlist"`, you should set both `groupAllowFrom` and `allowFrom` at the top-level
`channels.telegram` object and also at each account level with the same user IDs to avoid validation
warnings.

---

## Bindings section

```json
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
  ],
```

Bindings route messages to agents:

- Messages to the `default` Telegram bot → handled by the `coo` agent
- Messages to the `maya` Telegram bot → handled by the `pa` agent

---

## Gateway section

```json
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": [
        "http://localhost:18789",
        "https://openclaw.example.com",
        "https://mosbot.example.com"
      ],
      "allowInsecureAuth": true
    },
    "auth": {
      "mode": "token"
    },
    "tls": {
      "enabled": true,
      "autoGenerate": true
    }
  },
```

The gateway runs on port 18789 with TLS (auto-generated self-signed cert). Add your MosBot API and
dashboard URLs to `allowedOrigins` so the gateway's ControlUI can be accessed from those origins.

---

## Memory section

```json
  "memory": {
    "backend": "qmd",
    "citations": "auto",
    "qmd": {
      "includeDefaultMemory": true,
      "paths": [
        {
          "path": "../docs",
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
  },
```

QMD (query-based markdown) memory backend. Agents can query their memory files and shared docs. The
`../docs` path makes shared documentation available to all agents as memory. Memory is refreshed
every 5 minutes with a 15-second debounce.

---

## Plugins section

```json
  "plugins": {
    "entries": {
      "telegram": {
        "enabled": true
      }
    }
  }
}
```

Enable the Telegram plugin to activate Telegram channel support. Required if you have Telegram
channels configured.

---

## Minimal configuration

If you're just getting started, here's a minimal configuration with a single agent and no channels:

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
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "auth": {
      "mode": "token"
    },
    "tls": {
      "enabled": false
    }
  }
}
```

## Recommended Setup Strategy

For your initial setup, we recommend starting with a **single-agent system** rather than immediately
configuring multiple specialized agents.

### Why start with one agent?

1. **Simpler configuration**: You only need to manage one workspace, one identity, and one set of
   tools.
2. **Parallel execution**: You can still run multiple independent tasks in parallel by using
   **Telegram Topics**.
3. **Lower overhead**: Less context switching and easier debugging while you learn the system.

### How to use Telegram Topics for parallel sessions

Instead of creating separate agents for "Coding", "Research", and "General" tasks, you can use a
single agent and separate your work into Telegram Topics (if using a Supergroup):

1. Create a Telegram Supergroup and enable **Topics**.
2. Create topics like "Dev", "Research", "General".
3. Add your single agent to the group.
4. Chat in the "Dev" topic for coding tasks, and "Research" for research tasks.

OpenClaw treats each topic as a separate conversation context. This effectively gives you multiple
"instances" of the same agent working in parallel, without the complexity of managing multiple agent
definitions.
