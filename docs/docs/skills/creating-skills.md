---
id: creating-skills
title: Creating Skills
sidebar_label: Creating Skills
sidebar_position: 3
---

# Creating Skills

There are two ways to create and manage skills in MosBot OS: (1) directly creating a skill folder in
the filesystem, or (2) asking an agent to create the skill for you.

---

## Method 1: Directly Create a Skill Folder

Create a skill by adding a folder to the skills directory. The folder name must be in **snake_case**
(lowercase with underscores).

### Location

- **Shared skills**: `/skills/<skill_name>/`
- **Agent-specific skills**: `/workspace-<agent-id>/skills/<skill_name>/`

### Folder Structure

A skill folder contains at minimum a `SKILL.md` file. You can also include optional `references/`
and `scripts/` directories:

```
skills/
└── <skill_name>/
    ├── SKILL.md           # Required: Skill definition and instructions
    ├── references/        # Optional: Reference files for the skill
    │   ├── example.txt
    │   └── template.md
    └── scripts/           # Optional: Executable scripts
        └── helper.sh
```

### Sample Structure

**Shared skill example** (`/skills/code_review/`):

```
skills/
└── code_review/
    ├── SKILL.md
    ├── references/
    │   ├── review_checklist.md
    │   └── security_patterns.md
    └── scripts/
        └── run_linter.sh
```

**Agent-specific skill example** (`/workspace-cto/skills/architecture_decision/`):

```
workspace-cto/
└── skills/
    └── architecture_decision/
        ├── SKILL.md
        └── references/
            ├── adr_template.md
            └── decision_matrix.xlsx
```

### SKILL.md Format

The `SKILL.md` file contains YAML frontmatter followed by Markdown instructions:

```markdown
---
name: <skill-name>
description: <short description>
---

# Skill Title

Skill instructions in Markdown...

## Input

What the agent should expect as input.

## Output format

How the output should be structured.

## Guidelines

- Specific rules or constraints
- Quality standards
- Edge cases to handle
```

### Frontmatter Description and Trigger Keywords

The `description` field in the frontmatter is crucial for enabling natural language skill
invocation. When writing the description:

**Include trigger keywords and phrases** that users or agents might use when requesting this skill.
This allows the agent to match natural language requests to the appropriate skill, not just exact
command matches.

**Good examples:**

```yaml
---
name: summarize
description:
  Summarize documents, conversations, or content into key points. Use when asked to summarize,
  create a summary, provide a brief overview, or extract key takeaways.
---
---
name: code_review
description:
  Review code for quality, security, and best practices. Triggered by requests to review code, check
  code quality, audit code, or perform code analysis.
---
---
name: task_writing
description:
  Create well-structured tasks from descriptions or requirements. Use when asked to create tasks,
  break down work, generate task lists, or convert requirements into actionable tasks.
---
```

**Why this matters:**

- **Natural language matching**: Users can say "Can you summarize this?" instead of needing to know
  the exact `/summarize` command
- **Better discoverability**: Agents can suggest relevant skills based on user intent
- **Flexible interaction**: Supports both technical users (who prefer commands) and non-technical
  users (who prefer natural language)

:::tip Best Practice Think about how users might naturally ask for this skill and include those
phrases in your description. Include both the skill name and common synonyms or alternative
phrasings. :::

---

## Method 2: Ask an Agent to Create the Skill

You can ask any MosBot agent to create a skill for you. This is useful when you want to collaborate
on skill design or when you need the agent's expertise.

### Sample Prompt

```markdown
Please create a new shared skill called "daily_standup" that helps agents generate concise daily
standup reports. The skill should:

1. Accept input about what the agent worked on yesterday
2. Ask what they're working on today
3. Ask about any blockers or impediments
4. Output a formatted standup report in this structure:

   ### Yesterday
   - Completed: ...
   - In Progress: ...

   ### Today
   - Plan: ...

   ### Blockers
   - (or "None" if no blockers)

Include a references/ folder with a template.md showing example standup reports.
```

### How It Works

1. Send the prompt to an agent via chat (Telegram, etc.)
2. The agent will create the skill folder structure in the appropriate location
3. The agent writes the `SKILL.md` file with proper frontmatter
4. If requested, the agent creates supporting files in `references/` or `scripts/`
5. The skill becomes immediately available to all agents (if shared) or that specific agent

### Tips for Agent-Created Skills

- Be specific about the skill's purpose and desired behavior
- Define the output format clearly
- Request reference materials if the skill needs templates or examples
- Ask the agent to follow naming conventions (snake_case for folder names)

---

## Skill Naming Conventions

| Convention       | Rule                                    | Example                        |
| ---------------- | --------------------------------------- | ------------------------------ |
| **Folder name**  | snake_case (lowercase with underscores) | `code_review`, `daily_standup` |
| **Skill name**   | snake_case (lowercase with underscores) | `code_review`, `daily_standup` |
| **Display name** | Title case in frontmatter               | `Code Review`, `Daily Standup` |

- Use descriptive, action-oriented names
- Keep names concise (1-3 words)
- Avoid special characters except hyphens and underscores

---

## Testing a Skill

After creating a skill, test it by invoking it:

1. Open a chat with an agent
2. Type `/<skill-name>` followed by any required input
3. Verify the agent follows the instructions correctly

Example:

```markdown
/code_review Please review this function for security issues: function authenticate(user, pass) {
return db.query("SELECT \* FROM users WHERE username='" + user + "'"); }
```

---

## Editing and Deleting Skills

### Edit a Skill

1. **Via Dashboard**: Navigate to **Skills**, find the skill, click **Edit**
2. **Via Filesystem**: Modify the `SKILL.md` file directly
3. **Via Agent**: Ask an agent to "Update the `<skill-name>` skill to include ..."

### Delete a Skill

1. **Via Dashboard**: Navigate to **Skills**, find the skill, click **Delete** (trash icon)
2. **Via Filesystem**: Delete the skill folder

:::caution Deleting a skill is permanent. Agents that reference the skill will no longer be able to
invoke it. :::
