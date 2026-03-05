---
id: skill-structure
title: Skill File Structure
sidebar_label: Skill Structure
sidebar_position: 4
---

A skill is a plain text file (no extension required) with YAML frontmatter followed by Markdown
content.

## File format

```text
---
name: <skill-name>
description: <short description>
---

# Skill Title

Skill instructions in Markdown...
```

## Frontmatter fields

| Field         | Required    | Description                                                                        |
| ------------- | ----------- | ---------------------------------------------------------------------------------- |
| `name`        | Recommended | The skill's display name. Shown in the dashboard.                                  |
| `description` | Recommended | A short description of what the skill does. Shown in the dashboard and skill list. |

The frontmatter is stripped from the content before it's shown in the dashboard's rendered view.
It's used only for metadata display.

### Example frontmatter

```yaml
---
name: code-review
description: Review code changes and provide structured feedback
---
```

## Markdown body

The body of the skill file is the instruction set for the agent. Write it as you would write
instructions for a capable human — be clear, specific, and structured.

### Recommended structure

```markdown
# Skill Name

Brief description of what this skill does and when to use it.

## Input

What the agent should expect as input (if applicable).

## Output format

How the output should be structured.

## Guidelines

- Specific rules or constraints
- Quality standards
- Edge cases to handle

## Examples

Optional: show an example of good output.
```

## Tips for writing effective skills

### Be specific about output format

Agents follow instructions literally. If you want bullet points, say "use bullet points." If you
want a specific structure, describe it explicitly.

```markdown
## Output format

Respond with a JSON object: { "summary": "one-sentence summary", "key_points": ["point 1", "point
2", ...], "action_items": ["action 1", ...] }
```

### Define the scope

Tell the agent what to include and what to exclude:

```markdown
## Scope

- Focus only on the code changes provided
- Do not suggest architectural changes unless they are critical
- Limit feedback to the top 5 most important issues
```

### Handle edge cases

Anticipate what might go wrong and give the agent guidance:

```markdown
## Edge cases

- If no content is provided, ask the user what they want summarized
- If the content is too long (>10,000 words), summarize section by section
- If the content is in a language other than English, respond in that language
```

### Use Markdown formatting

The skill body is rendered as Markdown in the dashboard. Use headings, lists, and code blocks to
make skills readable and maintainable.

## Complete example

```markdown
---
name: daily-brief
description: Generate a daily briefing from recent activity and tasks
---

# Daily Brief

Generate a concise daily briefing summarizing what happened yesterday and what's planned for today.

## Input

Read from:

- Recent task updates (completed, in-progress, blocked)
- Agent activity logs from the past 24 hours
- Any notes or context provided in the message

## Output format

Structure the briefing as follows:

### Yesterday

- What was completed
- What was worked on but not completed
- Any blockers encountered

### Today

- Planned tasks and priorities
- Any meetings or deadlines

### Flags

- Anything that needs attention or a decision

## Guidelines

- Keep each section to 3–5 bullet points
- Use plain, direct language
- Highlight blockers prominently
- If there's nothing to report in a section, write "Nothing to report"

## Tone

Professional and concise. This is a briefing, not a narrative.
```
