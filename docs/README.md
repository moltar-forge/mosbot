# MosBot Dashboard docs

These docs describe the **MosBot Dashboard** (the UI/control plane) and how it fits into **MosBot OS**.

- If you're a **human/operator**, start with: `mosbot-os/overview.md`
- If you're a **developer**, start with: `getting-started/local-development.md`

> **Looking for full MosBot OS docs?** The [mosbot-api repository](https://github.com/bymosbot/mosbot-api) is the canonical documentation home for the full system. A dedicated `mosbot-docs` repo is planned — when it exists, all docs will be consolidated there.

## What this docs folder is (and isn't)

- This repo's `docs/` is **project documentation** for the dashboard (product, ops, integrations, runbooks).
- It is **not** the same thing as the **MosBot OS "Docs" workspace** shown inside the dashboard UI (the `/workspace/docs` folder in OpenClaw workspaces).
- Engineering conventions for code changes live in `.cursor/rules/` (Cursor rules), not here.

## Index

### MosBot OS

- `mosbot-os/overview.md` — MosBot OS mental model + dashboard navigation map

### Getting started

- `getting-started/local-development.md` — run locally
- `getting-started/configuration.md` — environment variables and runtime config

### Features (product behavior)

- `features/kanban.md`
- `features/task-modal.md`
- `features/task-manager.md`
- `features/org-chart.md`
- `features/workspaces.md`
- `features/docs.md`
- `features/activity-log.md`
- `features/archived.md`
- `features/settings-users.md`

### Security

- `security/permissions.md` — roles + permissions matrix (dashboard UX)

### Integrations

- `integrations/mosbot-api.md` — how the dashboard talks to MosBot API
- `integrations/openclaw.md` — OpenClaw assumptions and health/status semantics

### Operations / deployment

- `operations/cloudflare-access.md` — Cloudflare Access configuration runbook
- `deployment/static-hosting.md` — S3/CloudFront deployment (CI + manual)

### Reference

- `reference/workspaces-quick-reference.md`
