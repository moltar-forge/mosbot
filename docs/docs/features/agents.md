---
id: agents
title: Agents
sidebar_label: Agents
sidebar_position: 3
---

The **Agents** page is a live visualization of your AI agent team. It shows which agents are
configured, what each one is responsible for, and their current status.

:::info Requires OpenClaw Workspace Service The Agents page reads agent definitions from
`openclaw.json` via the workspace service. See [OpenClaw Integration](../openclaw/overview). :::

## How it works

The Agents page combines two sources:

- **OpenClaw runtime config** (`openclaw.json`) for agent runtime definitions
- **MosBot DB metadata** for display names, hierarchy (`reportsTo`), and status metadata

MosBot also synthesizes an implicit `main` agent when it is not explicitly present in
`agents.list`, so the dashboard always has a stable primary node.

Each agent card shows:

- Agent name and emoji (runtime `identity` + DB metadata fallback)
- Role description (typically from `identity.theme`)
- Current status badge
- Model information
- Assigned project badges (when project assignment is configured)

## Status badges

Each agent node displays a status badge:

| Badge          | Meaning                                       |
| -------------- | --------------------------------------------- |
| **Active**     | Agent has a live running session               |
| **You**        | Represents a human user                        |
| **Scaffolded** | Agent is defined but not yet fully configured  |
| **Deprecated** | Agent has been retired                         |

The status is updated in real-time based on data from the OpenClaw Gateway.

## Managing agents

Only **owner** and **admin** roles can manage agent lifecycle actions from the Agents page.

### Add Agent

`Add Agent` creates a runtime agent entry and seeds first-run workspace assets. For each new agent,
MosBot provisions:

- `<workspace>/tools/mosbot-auth`
- `<workspace>/tools/mosbot-task`
- `<workspace>/tools/INTEGRATION.md`
- `<workspace>/TOOLS.md`
- `<workspace>/BOOTSTRAP.md`
- `<workspace>/mosbot.env` (only when a new API key is created)

## Re-bootstrap action

Each editable agent card includes a **Re-bootstrap** action (circular arrows icon).

Use this when onboarding drifted or when an agent was created outside MosBot. Re-bootstrap re-seeds
workspace toolkit/bootstrap files and triggers bootstrap execution for that agent.

## Custom hierarchy with agents.json

Create flow behavior:

1. Validates the agent payload and checks `openclaw.json` to avoid duplicate IDs.
2. Ensures the agent DB row exists so API-key bootstrap can reference it.
3. Seeds toolkit files into the resolved workspace (`tools/*`, `TOOLS.md`).
4. Enforces single-active-key policy:
   - reuses the existing active key when present
   - creates a new key only when none exists
   - writes `mosbot.env` only when a new key is created
5. Writes a profile-aware `BOOTSTRAP.md`.
6. Applies runtime config (`config.apply`) to add the agent to OpenClaw.
7. Triggers first-run bootstrap execution (`sessions_send`, with `chat.send` fallback).

Failure handling:

- If provisioning fails before runtime config apply, MosBot cleans up newly created key/env
  artifacts.
- If the DB row was newly created in this request and bootstrap fails before apply, MosBot removes
  that row to avoid DB-only phantom agents in the UI.
- Backend does not delete `BOOTSTRAP.md`; the agent removes it after setup.

### Re-bootstrap Agent

`Re-bootstrap` re-seeds toolkit/bootstrap files for an existing agent and triggers bootstrap
execution again. Use this for drift recovery or externally created agents.

Notes:

- Re-bootstrap uses the agent's configured workspace path.
- Re-bootstrap validates workspace roots to agent-safe paths under `/workspace` or
  `/workspace-<agent>`.
- MosBot keeps **at most one active API key per agent**.
- Existing active keys are reused; MosBot does not rotate keys on each re-bootstrap.
- `mosbot.env` is written only when a new key is created.
- Re-bootstrap DB upsert backfills missing runtime metadata but preserves existing DB-managed
  hierarchy and lifecycle fields.
- Backend does not delete `BOOTSTRAP.md`; the agent removes it after completing setup.

### Agent hierarchy

Hierarchy is driven by agent metadata (`reportsTo`) stored in MosBot and shown as a tree when
available. If no hierarchy metadata exists, the page renders a flat list.

## Single agent view

When only one agent is configured, the agents page shows a clean, focused view with a single
prominent agent card — no hierarchy lines or department grids. As you add more agents, the view
automatically expands.
