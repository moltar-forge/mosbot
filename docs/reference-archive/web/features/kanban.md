# Kanban

The **Kanban Board** is the primary place to run work in MosBot OS.

## Status pipeline

Tasks flow through these columns:

- `PLANNING`
- `TO DO`
- `IN PROGRESS`
- `DONE`

Archived work (`ARCHIVE`) is intentionally handled on a separate page (see `features/archived.md`).

## What Kanban is optimized for

- **Drag-and-drop workflow control**: moving a card changes task status
- **Fast scanning + search**: filter to find the current “needle”
- **Quick task creation**: capture work as soon as it exists (details can be refined later)

## Opening a task

Clicking a task opens the **Task Detail Modal** (see `features/task-modal.md`).

## Data freshness (refresh behavior)

The dashboard uses a combination of:

- Manual refresh
- Periodic background refresh
- Refresh on tab visibility return
- Refresh after mutations (create/update/delete/move)

Exact timing is an implementation detail; the product intent is: **operators should not need to reload the page to see current state**.

