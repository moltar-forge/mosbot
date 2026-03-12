---
id: projects
title: Projects
sidebar_label: Projects
sidebar_position: 5
---

The **Projects** page lets you register shared project roots and assign agents to one or more
projects.

This creates a consistent, project-scoped workspace contract without removing each agent's private
workspace.

## What a project is

A project is a registry entry with:

- `slug` (unique id)
- display `name`
- `root_path` (under `/projects/<slug>`)
- `contract_path` (default: `/projects/<slug>/agent-contract.md`)

## Multi-project agent assignment

Agents can be assigned to multiple projects.

For each assignment, MosBot ensures this symlink:

```text
/workspace-<agentId>/projects/<project-slug> -> ../../projects/<project-slug>
```

This means agents can access project files via a stable local path:

- `projects/<project-slug>/...`

## Main workspace links

MosBot also ensures the main workspace has links to all active project roots:

```text
/workspace/projects/<project-slug> -> ../../projects/<project-slug>
```

## Create, assign, delete flow

### Create project

1. Open **Projects** page
2. Enter Name + Slug
3. Click **Create**

MosBot creates the project record and scaffolds:

- `/projects/<slug>/.keep`
- `/projects/<slug>/agent-contract.md` (default template)

### Assign agent

1. Choose an agent in the project card
2. Click **Assign**

MosBot records assignment and creates/repairs the project symlink in that agent workspace.

### Delete project

1. Click **Delete** on a project card
2. Confirm

MosBot removes:

- project record
- assignment rows
- best-effort project links for assigned agents + main workspace

## Re-bootstrap integration

If agent onboarding drifted, use **Re-bootstrap** from the Agents page.

Re-bootstrap re-seeds toolkit/bootstrap files and keeps project links aligned with current
assignments.

## Notes

- Project assignment is metadata + symlink management; it does **not** yet enforce write path
  guardrails.
- Guardrails are planned as a follow-up phase.
