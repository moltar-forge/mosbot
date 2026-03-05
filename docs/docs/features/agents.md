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

The agents page operates in two modes:

### Automatic mode (default)

When you define agents in the `agents.list` of your `openclaw.json`, they appear on the agents page
automatically as a flat list. No extra configuration needed — this is the simplest way to get
started, even with a single agent.

Each agent card shows:

- Agent name and emoji (from `identity` fields)
- Role description (from `identity.theme`)
- Current status badge
- Model information

### Custom hierarchy mode

For more complex setups, create an `agents.json` file in your workspace to define a hierarchical
structure with reporting relationships and departments. This is optional and intended for power users
who want to organize agents into teams.

## Status badges

Each agent node displays a status badge:

| Badge          | Meaning                                       |
| -------------- | --------------------------------------------- |
| **Active**     | Agent has a live running session               |
| **You**        | Represents a human user                        |
| **Scaffolded** | Agent is defined but not yet fully configured  |
| **Deprecated** | Agent has been retired                         |

The status is updated in real-time based on data from the OpenClaw Gateway.

## Adding agents

Agents appear on the agents page automatically based on the `agents.list` in `openclaw.json`. To add
a new agent:

1. Add the agent definition to `openclaw.json` (see
   [Configuration Reference](../configuration/openclaw-json#agentslist))
2. The agent will appear on the agents page on the next refresh

Alternatively, admins can use the **Add Agent** button in the dashboard to create agents through the
UI.

## Custom hierarchy with agents.json

For custom hierarchy, create an `agents.json` file in the workspace with:

- **`leadership`** — agents with `id`, `title` (optional), `displayName`, `label`, `status`, and
  `reportsTo` fields to define reporting relationships
- **`departments`** — organizational groups with `id`, `name`, `leadId`, and `subagents`
- **`subagents`** — team members within departments

The `reportsTo` field creates the tree hierarchy. Agents without `reportsTo` appear at the top
level.

## Single agent view

When only one agent is configured, the agents page shows a clean, focused view with a single
prominent agent card — no hierarchy lines or department grids. As you add more agents, the view
automatically expands.
