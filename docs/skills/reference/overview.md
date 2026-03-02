---
id: skills-reference-overview
title: Skill Reference Overview
sidebar_label: Overview
sidebar_position: 0
---

This section provides detailed reference documentation for all available skills in MosBot OS. Skills
are organized by type (Shared vs Agent-Specific) and include usage instructions, examples, and
implementation details.

:::tip Recommended for MosBot OS Integration The skills documented here are **highly recommended**
for OpenClaw agents to work effectively with MosBot OS. They enable essential capabilities like task
creation and orchestration, context management, and multi-modal input processing (e.g., voice
transcription). See the
[Skills Overview](../overview.md#recommended-skills-for-mosbot-os-integration) for more details on
why these skills matter. :::

:::info All skills in this reference are currently under development and may change significantly.
:::

## Shared Skills

Shared skills are available to all agents and are stored in the global `/skills/` directory.

### [memory_flush](./memory-flush.md)

**Type**: Shared Skill  
**Scope**: All agents  
**Location**: `/skills/memory_flush/SKILL.md`

Clears the agent's working memory and context, providing a clean slate for the next task or
conversation.

---

### [reminder_create](./reminder-create.md)

**Type**: Shared Skill  
**Scope**: All agents  
**Location**: `/skills/reminder_create/SKILL.md`

Creates a scheduled reminder for the agent to perform a task at a specific time or interval.

---

### [audio_transcribe](./audio-transcribe.md)

**Type**: Shared Skill  
**Scope**: All agents  
**Location**: `/skills/audio_transcribe/SKILL.md`

Transcribes audio files (voice messages, recordings) into text for processing by the agent.

---

## Agent-Specific Skills

Agent-specific skills are available only to particular agent types and are stored in their
respective workspace directories.

### [create_prd](./create-prd.md)

**Type**: Agent-Specific Skill  
**Scope**: Product Manager agent  
**Location**: `/workspace-pm/skills/create_prd/SKILL.md`

Creates a comprehensive Product Requirements Document (PRD) based on a feature description, user
needs, and business goals.

---

### [task_writing](./task-writing.md)

**Type**: Agent-Specific Skill  
**Scope**: Project Manager agent  
**Location**: `/workspace-pm/skills/task_writing/SKILL.md`

Creates well-structured, actionable tasks from vague descriptions, meetings, or PRD requirements.

---

### [task_pickup](./task-pickup.md)

**Type**: Agent-Specific Skill  
**Scope**: All specialized agents (Developer, Designer, QA, etc.)  
**Location**: `/workspace-<agent-id>/skills/task_pickup/SKILL.md`

Helps agents select the next task to work on based on priority, dependencies, their skills, and
current workload.

---

## Quick Reference Table

| Skill                                     | Type           | Scope                  | Usage                                         |
| ----------------------------------------- | -------------- | ---------------------- | --------------------------------------------- |
| [memory_flush](./memory-flush.md)         | Shared         | All agents             | `/memory_flush`                               |
| [reminder_create](./reminder-create.md)   | Shared         | All agents             | `/reminder_create [description] [time]`       |
| [audio_transcribe](./audio-transcribe.md) | Shared         | All agents             | `/audio_transcribe [audio_url_or_attachment]` |
| [create_prd](./create-prd.md)             | Agent-Specific | Product Manager        | `/create_prd [feature-name]`                  |
| [task_writing](./task-writing.md)         | Agent-Specific | Project Manager        | `/task_writing [description or context]`      |
| [task_pickup](./task-pickup.md)           | Agent-Specific | All specialized agents | `/task_pickup`                                |

---

## Related Documentation

- [Skills Overview](../overview.md) - Introduction to skills in MosBot OS
- [Shared vs Agent Skills](../shared-vs-agent.md) - Understanding skill types
- [Creating Skills](../creating-skills.md) - Guide to creating new skills
- [Skill Structure](../skill-structure.md) - Technical structure of skills
- [Skill Examples](../examples.md) - Example skill implementations
