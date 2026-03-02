---
id: examples
title: Example Skills
sidebar_label: Examples
sidebar_position: 5
---

This page shows the structure and patterns for building skills. For a collection of ready-to-use
skills you can copy directly into your installation, see
[Skill Reference](./reference/memory-flush).

---

## Skill folder structure

Every skill lives in its own snake_case folder inside the relevant skills directory:

```text
skills/
└── <skill_name>/          ← snake_case folder name
    ├── SKILL.md           ← Required: skill definition and instructions
    ├── references/        ← Optional: reference files the agent can read
    └── scripts/           ← Optional: helper scripts
```

**Shared skill** (available to all agents):

```text
skills/
└── summarize/
    └── SKILL.md
```

**Agent-specific skill** (available only to that agent):

```text
workspace-cto/
└── skills/
    └── architecture_review/
        ├── SKILL.md
        └── references/
            └── adr_template.md
```

---

## SKILL.md structure

```markdown
---
name: <skill-name>
description: <short description shown in the dashboard>
---

# Skill Title

Brief description of what this skill does and when to use it.

## Input

What the agent should expect as input.

## Output format

How the output should be structured.

## Guidelines

- Specific rules or constraints
- Quality standards
- Edge cases to handle
```

The `name` and `description` frontmatter fields are used for display in the MosBot Dashboard. The
`description` field is also crucial for natural language skill matching — include trigger keywords
and phrases that users might use when requesting this skill. The body is the instruction set the
agent follows when the skill is invoked.

---

## Common patterns

### Shared general-purpose skill

```text
skills/summarize/SKILL.md
```

Shared skills are for tasks any agent might need — summarizing, researching, writing reports, etc.
The folder name becomes the command: `/summarize`.

### Agent-specific skill

```text
workspace-pm/skills/task_writing/SKILL.md
```

Agent-specific skills are for tasks tied to a particular agent's role. The PM agent's
`/task_writing` skill is only available when chatting with that agent.

### Skill with references

```text
workspace-cto/skills/architecture_review/
├── SKILL.md
└── references/
    ├── adr_template.md
    └── decision_matrix.xlsx
```

Use the `references/` folder for templates, checklists, or context the agent should consult when
running the skill.

---

## Adding a skill to your installation

1. **Create the folder** (snake_case):

   ```bash
   mkdir -p skills/summarize
   ```

2. **Create `SKILL.md`**:

   ```bash
   cat > skills/summarize/SKILL.md << 'EOF'
   ---
   name: summarize
   description: Summarize documents, conversations, or content into key points. Use when asked to summarize, create a summary, provide a brief overview, or extract key takeaways.
   ---

   # Summarize

   Read the provided content and produce a concise summary.
   ...
   EOF
   ```

3. **Add optional references**:

   ```bash
   mkdir -p skills/summarize/references
   cp my-template.md skills/summarize/references/
   ```

The skill is immediately available to agents once the file is in place.

---

## Ready-to-use skills

The **[Skill Reference](./reference/memory-flush)** section contains copy-ready `SKILL.md` files for
common tasks. Each reference page includes:

- The skill's purpose, type (shared or agent-specific), and location
- A copy button for the full `SKILL.md` content
- Usage examples and options

Browse the reference skills in the sidebar under **Skill Reference**.
