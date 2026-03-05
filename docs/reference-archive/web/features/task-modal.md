# Task Detail Modal

The task modal is the “control panel” for a task: fields, collaboration, and audit history in one place.

## Core task fields

Tasks commonly include:

- **Title** (short, scannable)
- **Description** (Markdown-friendly; should contain enough context to execute)
- **Status**, **Type**, **Priority**
  - Types commonly include: `task`, `bug`, `feature`, `improvement`, `research`, `epic`
- **Assignee** (selected from active users)
- **Due date**
- **Tags** (normalized: trimmed, lowercased, deduped)
- **Epic/parent task** (for organizing subtasks under an epic)
- **Preferred model** (optional): choose the AI model used when the system executes the task; leave unset to use the system default

## Tabs (lazy loaded)

The modal is organized into tabs that load on demand:

- **Comments**: the primary collaboration surface (decisions, progress notes, outcomes)
- **History**: audit trail of changes (“what changed and when”)
- **Activity**: system activity entries associated with the task

## Shareable deep links

Tasks can be opened directly via a URL so work can be handed off without losing context.

## History event types (comments)

History entries distinguish comment-related events:

- `COMMENT_CREATED` → “Comment added”
- `COMMENT_UPDATED` → “Comment edited”
- `COMMENT_DELETED` → “Comment deleted”

The product intent is that operators can scan the audit trail and quickly spot collaboration activity.

