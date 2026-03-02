---
id: shared-vs-agent
title: Shared vs Agent-Specific Skills
sidebar_label: Shared vs Agent-Specific
sidebar_position: 2
---

MosBot OS supports two categories of skills, each stored in a different location in the OpenClaw
workspace filesystem.

## Shared skills

**Location**: `/skills/`

Shared skills are available to **all agents**. They live in the root `/skills/` directory of the
OpenClaw workspace.

Use shared skills for:

- Tasks that any agent might need to perform
- Common workflows used across multiple agents
- Organization-wide standards and templates

```text
/skills/
├── summarize           ← any agent can use /summarize
├── write_report
├── code_review
└── daily_brief
```

## Agent-specific skills

**Location**: `/workspace-<agent-id>/skills/`

Agent-specific skills are available only to the agent whose workspace they live in. They live inside
an agent's workspace directory.

Use agent-specific skills for:

- Tasks specific to that agent's role
- Skills that reference agent-specific context or tools
- Specialized workflows for a particular agent

```text
/workspace-cto/skills/
├── architecture_review ← only the CTO agent can use this
├── code_audit
└── tech_debt_analysis

/workspace-cmo/skills/
├── campaign_brief      ← only the CMO agent can use this
└── market_analysis
```

## How the Skills page organizes them

In the MosBot Dashboard's Skills page, skills are grouped into two sections:

1. **Shared Skills** — all files from `/skills/`
2. **Agent-Only Skills** — grouped by agent, showing each agent's skills from
   `/workspace-<id>/skills/`

## Choosing between shared and agent-specific

| Use shared skills when...                    | Use agent-specific skills when...                    |
| -------------------------------------------- | ---------------------------------------------------- |
| Multiple agents need the same skill          | The skill is tailored to one agent's role            |
| The skill is general-purpose                 | The skill references agent-specific tools or context |
| You want a consistent workflow across agents | You want to customize behavior per agent             |

## Skill naming

Skill names are derived from the folder name. A folder named `code_review` becomes the
`/code_review` command.

Keep skill folder names:

- snake_case (lowercase with underscores)
- Short and descriptive
- Unique within their scope (shared or per-agent)

:::tip If a shared skill and an agent-specific skill have the same name, the agent-specific skill
takes precedence for that agent. :::
