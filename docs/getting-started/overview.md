---
id: overview
title: What is MosBot OS?
sidebar_label: Overview
sidebar_position: 1
---

# What is MosBot OS?

**MosBot OS** is a self-hosted operating system for AI agent work. It gives you a human-operable
control plane on top of [OpenClaw](https://openclaw.dev) — the AI agent runtime — so you can manage
tasks, monitor agents, browse workspaces, and orchestrate agent activity from a single interface.

## The three-layer model

MosBot OS is composed of three layers that work together:

```
┌─────────────────────────────────────────────┐
│         MosBot Dashboard (UI Layer)         │
│  React SPA — task management, agents page,  │
│  workspace visualization, agent monitoring  │
└─────────────────┬───────────────────────────┘
                  │ REST API (HTTP/JSON)
┌─────────────────▼───────────────────────────┐
│        MosBot API (Backend Layer)           │
│  Node.js/Express + PostgreSQL               │
│  Transforms and serves OpenClaw data        │
└─────────────────┬───────────────────────────┘
                  │ HTTP + WebSocket
┌─────────────────▼───────────────────────────┐
│      OpenClaw (Source of Truth)             │
│  AI Agent Runtime — manages agents,         │
│  workspaces, sessions, and cron jobs        │
└─────────────────────────────────────────────┘
```

### MosBot Dashboard

The UI layer. A React single-page application that provides:

- **Agent Monitor** — view active sessions, costs, and usage analytics
- **Task Board** — drag-and-drop kanban with priorities, tags, and dependencies
- **Agents** — live visualization of AI agents with real-time session status
- **Workspaces** — browse and edit agent workspace files
- **Skills** — manage shared and agent-specific skills
- **Standups** — daily AI-generated standup summaries
- **Scheduler** — schedule and monitor recurring agent tasks
- **Users** — role-based access control

### MosBot API

The backend and integration layer. A Node.js/Express service that:

- Owns user accounts, tasks, activity logs, and standups in PostgreSQL
- Proxies and transforms data from OpenClaw
- Issues and verifies JWT authentication tokens
- Degrades gracefully when OpenClaw is not configured

### OpenClaw

The AI agent runtime. The source of truth for:

- Agent definitions and configurations
- Agent workspaces (files, memory, skills)
- Live sessions and conversation history
- Cron jobs and scheduled tasks
- Channel integrations (Telegram, etc.)

:::tip OpenClaw is required for full functionality

MosBot OS is designed to work with OpenClaw. While the API and Dashboard can start without it (task
management, users, and activity logs will work), the core value — agent monitoring, workspace
browsing, agents page, and skills — requires OpenClaw. Install OpenClaw first for the complete
experience. :::

## What MosBot OS is for

MosBot OS is designed for people who run AI agents as part of their daily work — whether that's
research, product work, software development, or business operations. It provides:

- **Visibility**: see what your agents are doing, what they've done, and how much it costs
- **Control**: manage tasks and delegate work to agents through a structured interface
- **Auditability**: activity logs and task history provide an operational narrative
- **Self-hosted**: you control the infrastructure, data, and access

## Next steps

- [Prerequisites](./prerequisites) — what you need before you start
- [Quickstart](./quickstart) — get the full stack running in under 10 minutes
- [Configuration](./configuration) — environment variable reference
