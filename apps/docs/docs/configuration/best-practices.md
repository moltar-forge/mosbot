---
id: best-practices
title: Configuration Best Practices
sidebar_label: Best Practices
sidebar_position: 3
---

## Secrets management

### Never put secrets directly in openclaw.json

Use environment variable references instead:

```json
// ✅ Good
{
  "env": {
    "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}"
  }
}

// ❌ Bad
{
  "env": {
    "TELEGRAM_BOT_TOKEN": "1234567890:AABBccDDeeFFggHHiiJJkkLLmmNNooP-example"
  }
}
```

### Use Kubernetes secrets for production

In Kubernetes, store all secrets in a `Secret` resource and inject them as environment variables:

```yaml
env:
  - name: TELEGRAM_BOT_TOKEN
    valueFrom:
      secretKeyRef:
        name: openclaw-secrets
        key: TELEGRAM_BOT_TOKEN
```

### The `__OPENCLAW_REDACTED__` placeholder

When OpenClaw reads a config that contains sensitive values, it may replace them with
`__OPENCLAW_REDACTED__` in logs and API responses. This is expected behavior — the actual value is
still used at runtime.

---

## Model selection

### Use fallbacks

Always configure fallback models. API providers can have outages or rate limits:

```json
{
  "model": {
    "primary": "openrouter/anthropic/claude-sonnet-4.6",
    "fallbacks": ["openrouter/google/gemini-2.5-flash", "openrouter/moonshotai/kimi-k2.5"]
  }
}
```

### Match model to task

| Task type                             | Recommended model tier            |
| ------------------------------------- | --------------------------------- |
| Complex reasoning, code, architecture | Claude Sonnet/Opus, GPT-4         |
| General tasks, research, writing      | Kimi K2.5, Gemini Flash, DeepSeek |
| Heartbeats, simple checks             | Gemini Flash Lite, GPT-4o Mini    |
| Subagents, background tasks           | Cost-effective models             |

### Use prompt caching

Enable `cacheControlTtl` for models that support it to reduce costs on repeated context:

```json
{
  "openrouter/anthropic/claude-sonnet-4.6": {
    "params": {
      "cacheControlTtl": "1h"
    }
  }
}
```

---

## Agent design

### One agent per role

Design agents around distinct roles with clear responsibilities:

- **COO/Orchestrator** — coordination, delegation, high-level tasks
- **CTO/Tech** — code, architecture, technical decisions
- **CPO/Product** — product strategy, roadmap, user stories
- **CMO/Marketing** — content, campaigns, messaging
- **PA/Assistant** — scheduling, research, personal tasks

### Use heartbeats for proactive agents

Configure heartbeats for agents that should check in regularly:

```json
{
  "heartbeat": {
    "every": "30m",
    "activeHours": {
      "start": "08:00",
      "end": "22:00"
    },
    "model": "google/gemini-2.5-flash-lite",
    "prompt": "Read HEARTBEAT.md. If nothing needs attention, reply HEARTBEAT_OK."
  }
}
```

Use a cheap, fast model for heartbeats — they run frequently and should be cost-efficient.

### Define subagent permissions explicitly

Only allow agents to invoke other agents when needed:

```json
{
  "subagents": {
    "allowAgents": ["cto", "cpo"]
  }
}
```

---

## Memory configuration

### Use shared docs for organization-wide context

Add shared documentation to memory so all agents can access it:

```json
{
  "memory": {
    "qmd": {
      "paths": [
        {
          "path": "../shared/docs",
          "name": "shared-docs",
          "pattern": "**/*.md"
        }
      ]
    }
  }
}
```

### Configure memory flush for long sessions

Enable memory flush to preserve context across session compactions:

```json
{
  "compaction": {
    "memoryFlush": {
      "enabled": true,
      "softThresholdTokens": 22000,
      "prompt": "Write important context to memory/YYYY-MM-DD.md before compaction."
    }
  }
}
```

---

## Channel security

### Use pairing for DMs

Set `dmPolicy: "pairing"` to require authorization before users can DM agents:

```json
{
  "dmPolicy": "pairing"
}
```

### Restrict group access

Use `groupAllowFrom` to limit which users can interact with agents in groups:

```json
{
  "groupAllowFrom": ["tg:YOUR_TELEGRAM_USER_ID"]
}
```

Find your Telegram user ID by messaging `@userinfobot` on Telegram.

---

## Gateway security

### Enable TLS

Always enable TLS in production:

```json
{
  "gateway": {
    "tls": {
      "enabled": true,
      "autoGenerate": true
    }
  }
}
```

### Restrict allowed origins

Only add origins that actually need access to the gateway:

```json
{
  "controlUi": {
    "allowedOrigins": [
      "https://your-mosbot-dashboard.example.com",
      "https://your-openclaw-ui.example.com"
    ]
  }
}
```

---

## Performance

### Tune concurrency

Adjust `maxConcurrent` based on your infrastructure:

```json
{
  "maxConcurrent": 4,
  "subagents": {
    "maxConcurrent": 8
  }
}
```

Higher values allow more parallel work but consume more resources.

### Use `reserveTokensFloor` to prevent truncation

Set a generous `reserveTokensFloor` to ensure agents always have room to respond:

```json
{
  "compaction": {
    "reserveTokensFloor": 40000
  }
}
```
