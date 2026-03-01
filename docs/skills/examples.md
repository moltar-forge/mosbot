---
id: examples
title: Example Skills
sidebar_label: Examples
sidebar_position: 5
---

# Example Skills

A collection of ready-to-use skills you can add to your MosBot OS installation. All examples follow
the snake_case folder structure.

## Skill Folder Structure

Each skill lives in its own folder with a `SKILL.md` file:

```
skills/
└── <skill_name>/          ← snake_case folder name
    ├── SKILL.md           ← Required: Skill definition
    ├── references/        ← Optional: Reference files
    └── scripts/           ← Optional: Helper scripts
```

---

## General purpose (shared skills)

### summarize

**Location**: `skills/summarize/SKILL.md`

Summarize any document or conversation.

<details>
<summary>📋 Click to view SKILL.md content (copy-ready)</summary>

```markdown
---
name: summarize
description: Summarize a document or conversation into key points
---

# Summarize

Read the provided content and produce a concise summary.

## Output format

1. **TL;DR** — one sentence capturing the essence
2. **Key points** — 3–5 bullet points
3. **Action items** — any decisions or next steps (omit if none)

## Guidelines

- Aim for 20% of the original length
- Preserve important numbers, dates, and names
- Use plain language — avoid jargon
```

</details>

---

### daily_brief

**Location**: `skills/daily_brief/SKILL.md`

Generate a daily activity briefing.

<details>
<summary>📋 Click to view SKILL.md content (copy-ready)</summary>

```markdown
---
name: daily-brief
description: Generate a daily briefing from recent activity and tasks
---

# Daily Brief

Generate a concise daily briefing covering yesterday's activity and today's priorities.

## Structure

### Yesterday

- Completed tasks
- In-progress work
- Blockers encountered

### Today

- Planned tasks and priorities
- Deadlines or meetings

### Flags

- Items needing attention or a decision

## Guidelines

- 3–5 bullet points per section
- Highlight blockers prominently
- Write "Nothing to report" for empty sections
- Keep the tone professional and direct
```

</details>

---

### research

**Location**: `skills/research/SKILL.md`

Research a topic and produce a structured report.

<details>
<summary>📋 Click to view SKILL.md content (copy-ready)</summary>

```markdown
---
name: research
description: Research a topic and produce a structured report with sources
---

# Research

Research the provided topic thoroughly and produce a structured report.

## Output format

### Overview

2–3 sentence introduction to the topic.

### Key findings

5–7 bullet points covering the most important information.

### Analysis

Your assessment of the findings and their implications.

### Sources

List the sources consulted (URLs, documents, or knowledge references).

## Guidelines

- Prioritize recent and authoritative sources
- Distinguish between facts and opinions
- Note any conflicting information or uncertainty
- Keep the report actionable — focus on what matters
```

</details>

---

## Agent-specific skill examples

### architecture_review (CTO agent)

**Location**: `workspace-cto/skills/architecture_review/SKILL.md`

<details>
<summary>📋 Click to view SKILL.md content (copy-ready)</summary>

```markdown
---
name: architecture-review
description: Review a system architecture proposal and provide technical recommendations
---

# Architecture Review

Review the provided architecture proposal and give structured technical feedback.

## Review criteria

Evaluate against these dimensions:

1. **Scalability** — will it handle 10x growth?
2. **Reliability** — single points of failure, redundancy
3. **Security** — authentication, authorization, data protection
4. **Maintainability** — complexity, team capability, operational burden
5. **Cost** — infrastructure and operational costs

## Output format

### Summary

One paragraph assessment.

### Strengths

What the design gets right (2–4 points).

### Concerns

Issues that need to be addressed, ranked by severity:

- 🔴 **Critical** — must fix before proceeding
- 🟡 **Important** — should fix before production
- 🟢 **Minor** — nice to have

### Recommendations

Specific, actionable changes with rationale.

### Open questions

Questions that need answers before the design can be finalized.
```

</details>

---

### campaign_brief (CMO agent)

**Location**: `workspace-cmo/skills/campaign_brief/SKILL.md`

<details>
<summary>📋 Click to view SKILL.md content (copy-ready)</summary>

```markdown
---
name: campaign-brief
description: Create a marketing campaign brief from a product or feature description
---

# Campaign Brief

Create a structured marketing campaign brief based on the provided information.

## Output format

### Campaign overview

- **Objective**: what we want to achieve
- **Target audience**: who we're reaching
- **Key message**: the single most important thing to communicate
- **Tone**: how we want to sound

### Channels

Recommended channels and rationale (e.g. social, email, content, paid).

### Content ideas

5–7 specific content ideas with format and channel.

### Success metrics

How we'll measure if the campaign worked.

### Timeline

Suggested phases and milestones.

## Guidelines

- Focus on the customer's perspective, not the product's features
- Lead with benefits, not specifications
- Keep the key message to one sentence
```

</details>

---

## Heartbeat skill

Skills can also be used to define agent behavior for scheduled heartbeats. The heartbeat prompt in
`openclaw.json` can reference a `HEARTBEAT.md` file in the agent's workspace.

**Location**: `workspace-coo/HEARTBEAT.md` (note: not in skills folder, placed directly in
workspace)

<details>
<summary>📋 Click to view HEARTBEAT.md content (copy-ready)</summary>

```markdown
<!-- workspace-coo/HEARTBEAT.md -->

# Heartbeat Context

You are MosBot, the COO agent. This is your regular heartbeat check-in.

## Current priorities

1. Review open tasks and update statuses
2. Check for any blocked items that need escalation
3. Review recent agent activity for anything requiring attention

## Standing instructions

- If tasks are blocked, create a note in the task and notify the relevant agent
- If nothing needs attention, reply HEARTBEAT_OK
- Keep responses brief — this is a check-in, not a full session
```

</details>

---

## Quick Copy: Complete Skill Folder

To create a skill from these examples:

1. **Create the folder** (snake_case):

   ```bash
   mkdir -p skills/summarize
   ```

2. **Create SKILL.md** with the content above:

   ```bash
   cat > skills/summarize/SKILL.md << 'EOF'
   ---
   name: summarize
   description: Summarize a document or conversation into key points
   ---

   # Summarize
   ...
   EOF
   ```

3. **Add optional references**:
   ```bash
   mkdir -p skills/summarize/references
   cp my-template.txt skills/summarize/references/
   ```
