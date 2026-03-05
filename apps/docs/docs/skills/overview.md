---
id: overview
title: Skills Overview
sidebar_label: Overview
sidebar_position: 1
---

Skills are reusable instruction files that agents can invoke as commands. They define how an agent
should perform a specific task — from transcribing audio to writing code reviews to generating
reports.

## What is a skill?

A skill is a Markdown file with YAML frontmatter that describes:

1. **What the skill does** (metadata in frontmatter)
2. **How to do it** (instructions in the Markdown body)

When an agent receives a command that matches a skill, it reads the skill file and follows the
instructions.

### Example skill

```markdown
---
name: summarize
description: Summarize a document or conversation into key points
---

# Summarize

Read the provided content carefully and produce a concise summary.

## Output format

- Start with a one-sentence TL;DR
- Follow with 3–5 bullet points covering the key points
- End with any action items or decisions made

## Guidelines

- Be concise — aim for 20% of the original length
- Preserve important numbers, dates, and names
- Use plain language
```

## How agents use skills

In OpenClaw, skills can be invoked in two ways:

### 1. Native Commands

Skills can be invoked as native commands using the `/` prefix. When an agent receives a message like
`/summarize`, it:

1. Looks up the `summarize` skill file
2. Reads the instructions
3. Executes the task according to those instructions

### 2. Natural Language

Skills can also be invoked via natural language when the frontmatter `description` includes trigger
keyword examples. For example, if a skill's description mentions keywords like "summarize", "create
a summary", or "brief overview", the agent can match natural language requests like "Can you
summarize this document?" to the appropriate skill.

:::tip Writing Effective Descriptions To enable natural language invocation, include common trigger
keywords and phrases in your skill's frontmatter `description`. See
[Creating Skills](./creating-skills#frontmatter-description-and-trigger-keywords) for best
practices. :::

Skills can be invoked by users via chat (e.g. Telegram) or by other agents in multi-agent workflows.

## Skills in the MosBot Dashboard

The **Skills** page in the dashboard provides a visual browser for all skills across your OpenClaw
installation. You can:

- Browse shared and agent-specific skills
- View skill content with rendered Markdown
- Create and edit skills directly in the browser
- Search skills by name or description

## Types of skills

MosBot OS supports two types of skills:

| Type                      | Location                  | Available to    |
| ------------------------- | ------------------------- | --------------- |
| **Shared skills**         | `/skills/`                | All agents      |
| **Agent-specific skills** | `/workspace-<id>/skills/` | That agent only |

See [Shared vs Agent-Specific Skills](./shared-vs-agent) for details.

## Recommended Skills for MosBot OS Integration

To enable OpenClaw agents to work effectively with MosBot OS, we highly recommend implementing the
following skills:

### Essential Task Management Skills

**For Project Manager agents:**

- **[task_writing](./reference/task-writing.md)** — Create well-structured, actionable tasks from
  descriptions, meetings, or PRD requirements. Essential for breaking down work into manageable
  tasks that can be tracked in MosBot OS.
- **[create_prd](./reference/create-prd.md)** — Generate comprehensive Product Requirements
  Documents that serve as the foundation for task creation and agent orchestration.

**For specialized agents (Developers, Designers, QA, etc.):**

- **[task_pickup](./reference/task-pickup.md)** — Help agents select the next task based on
  priority, dependencies, skills, and workload. Enables effective task orchestration and workload
  management across agents.

### Recommended Utility Skills

- **[memory_flush](./reference/memory-flush.md)** — Clear the agent's working memory and context for
  a clean slate. Highly recommended to prevent context pollution between unrelated tasks and
  maintain clean agent state when switching between different projects or conversations.
- **[audio_transcribe](./reference/audio-transcribe.md)** — Transcribe audio files (voice messages,
  recordings) into text. Essential for processing voice inputs from communication channels like
  Telegram and converting them into actionable text that agents can work with.

### Why These Skills Matter

These recommended skills enable:

- **Task Orchestration**: Agents can create, assign, and pick up tasks seamlessly within the MosBot
  OS ecosystem
- **Context Management**: Agents can maintain clean working memory, preventing confusion from
  accumulated context
- **Multi-Modal Input**: Agents can process voice messages and convert them to text for further
  processing
- **Workflow Integration**: Skills bridge the gap between OpenClaw agents and MosBot OS task
  management features

See the [Skill Reference](./reference/skills-reference-overview) for detailed documentation on these
and other available skills.

## Next steps

- [Shared vs Agent-Specific Skills](./shared-vs-agent)
- [Creating Skills](./creating-skills)
- [Skill File Structure](./skill-structure)
- [Example Skills](./examples)
- [Skill Reference](./reference/skills-reference-overview) — Browse recommended and available skills
