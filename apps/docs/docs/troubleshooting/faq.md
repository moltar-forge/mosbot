---
id: faq
title: FAQ
sidebar_label: FAQ
sidebar_position: 2
---

# Frequently Asked Questions

## General

### What is MosBot OS?

MosBot OS is a self-hosted operating system for AI agent work. It provides a human-operable control
plane on top of OpenClaw (the AI agent runtime), giving you task management, agent monitoring,
workspace browsing, and more in a single interface.

### Do I need OpenClaw to use MosBot OS?

Technically no — MosBot OS can run without OpenClaw, and basic features like task management, user
management, and activity logs will function. However, **OpenClaw is strongly recommended** because
the core value of MosBot OS — agent monitoring, workspace browsing, agents page, and skills management
— requires OpenClaw. Install OpenClaw first for the complete experience.

### Is MosBot OS production-ready?

MosBot OS is currently used for personal use and is vibe-coded with minimal formal code reviews. It
works well for personal and small-team use cases but may have rough edges. Use it with appropriate
expectations.

### What AI models does MosBot OS support?

MosBot OS itself doesn't call AI models — that's OpenClaw's job. OpenClaw supports:

- **OpenRouter** — access to 200+ models (Claude, GPT, Gemini, etc.)
- **Anthropic** — Claude models directly
- **OpenAI** — GPT models directly
- **Ollama** — local models (Llama, Qwen, etc.)

---

## Setup

### How long does setup take?

With Docker Compose, the full stack can be running in under 10 minutes. See the
[Quickstart](../getting-started/quickstart).

### Can I run MosBot OS without Docker?

Yes. You can run MosBot API and Dashboard directly with Node.js. You'll need a PostgreSQL database
running separately. See the local development guides in each repo.

### What ports does MosBot OS use?

| Service            | Default port           |
| ------------------ | ---------------------- |
| MosBot API         | 3000                   |
| MosBot Dashboard   | 5173 (dev) / 80 (prod) |
| PostgreSQL         | 5432                   |
| OpenClaw Workspace | 18780                  |
| OpenClaw Gateway   | 18789                  |

### Can I use a custom domain?

Yes. Set `CORS_ORIGIN` in `.env` to your dashboard's domain and configure your reverse proxy (nginx,
Caddy, Cloudflare, etc.) to point to the API and dashboard.

---

## OpenClaw

### What is OpenClaw?

OpenClaw is an AI agent runtime. It manages agents, workspaces, sessions, channels (like Telegram),
and cron jobs. MosBot OS connects to OpenClaw to expose this data through a human-friendly
interface.

### Where do I get OpenClaw?

OpenClaw has its own repository and documentation. Refer to the OpenClaw documentation for
installation instructions.

### Can I use MosBot OS with a remote OpenClaw instance?

Yes. Set `OPENCLAW_WORKSPACE_URL` and `OPENCLAW_GATEWAY_URL` to the remote OpenClaw service URLs.
Use a VPN or private network for security.

---

## Skills

### What are skills?

Skills are instruction files that agents can invoke as commands. They define how an agent should
perform a specific task. See [Skills Overview](../skills/overview).

### How do I create a skill?

Use the Skills page in the dashboard, or write a file directly to the OpenClaw workspace. See
[Creating Skills](../skills/creating-skills).

### What's the difference between shared and agent-specific skills?

Shared skills (in `/skills/`) are available to all agents. Agent-specific skills (in
`/workspace-<id>/skills/`) are only available to that agent. See
[Shared vs Agent-Specific Skills](../skills/shared-vs-agent).

---

## Configuration

### Where is `openclaw.json`?

`openclaw.json` lives in the root of the OpenClaw workspace filesystem. You can view and edit it in
the MosBot Dashboard under the workspace browser, or directly in the OpenClaw ControlUI.

### How do I add a new agent?

Add an entry to the `agents.list` array in `openclaw.json`. See the
[openclaw.json Reference](../configuration/openclaw-json#agentslist).

### How do I set up Telegram?

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and get the bot token
2. Add the token to your environment: `TELEGRAM_BOT_TOKEN=your-token`
3. Configure the channel in `openclaw.json` under `channels.telegram`
4. Enable the Telegram plugin under `plugins.entries.telegram`
5. Add a binding to route messages to the right agent

See the [Sample Configuration](../configuration/sample-config) for a complete Telegram setup
example.

---

## Standups

### How do I set up daily standups?

1. Create agent user accounts in MosBot (Settings → Users) with the `agent` role and correct
   `agent_id`
2. Configure a cron job in OpenClaw to trigger the standup daily
3. See [Standups](../features/standups) for the full guide

### Can I run a standup manually?

Yes. Go to the Standups page in the dashboard and click **Run Standup**.

---

## Known issues

### Create new agent is not working

This is a known bug. Use OpenClaw's ControlUI to create new agents instead.

### Config update may not be reliable

The `openclaw.json` config update endpoint may not be fully reliable due to how OpenClaw handles
configuration reloads. Prefer using OpenClaw's ControlUI for configuration changes.
