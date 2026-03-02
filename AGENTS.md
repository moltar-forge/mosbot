---
description: Entry point and operating rules for AI agents in this repo
---

# AGENTS.md — working in this repository

This file is the **universal entrypoint for AI agents** operating in this repo.

## What this repo is

**MosBot Workspace Service** is a small Node.js/Express sidecar that exposes a mounted OpenClaw workspace over HTTP. It is intentionally security-sensitive: it can read, write, and delete files on the mounted volume.

## Tech stack

- **Node.js (>=18)** + **Express**
- **Jest + Supertest** for testing (**100% coverage enforced**)
- **Prettier** + Husky + lint-staged for formatting
- **gitleaks** CI workflow for secret scanning

## Common commands

```bash
npm install
npm start
npm run test:run
npm run test:coverage
npm run format
npm run format:check
```

## Repo shape

```text
server.js        — backwards-compatible entrypoint (delegates to src/)
src/
  app.js         — Express app factory (routes, middleware, helpers)
  index.js       — process entrypoint (env validation, server start)
__tests__/       — Jest test suite (API + helpers)
```

## Cursor rules

This repo includes Cursor rules under `.cursor/rules/`.

- Start with `.cursor/rules/overview.mdc` (always applied).
- Apply the other rules **when relevant to the change you’re making** (they are not always-on).

Rule selection guidance:

- If you touch **auth, env vars, filesystem paths, symlinks, Docker, or logging**: apply `security.mdc` (and usually `openclaw-integration.mdc`).
- If you change **routing, status/health semantics, file API behavior, or helper functions**: apply `architecture.mdc`.
- If you change **tests, formatting, dependencies, CI, or project conventions**: apply `contributing.mdc`.

## Non-negotiable principles

1. **Do not weaken path safety**: every user-provided path must be resolved through the existing safe path logic; do not bypass `assertWithinRoot`.
2. **Auth is required by default**: the service must refuse to start unless `WORKSPACE_SERVICE_TOKEN` is set, except when explicitly opting into local dev anonymous mode.
3. **Never leak secrets**: do not log or return bearer tokens in responses (even on error).
4. **Keep the app testable**: preserve the split between `createApp()` (`src/app.js`) and server startup (`src/index.js`).
5. **Maintain 100% coverage**: add/update tests for any behavior change.

## Where to read first

- `README.md` — usage, env vars, endpoints
- `SECURITY.md` — threat model and reporting
- `CONTRIBUTING.md` — local dev, tests, formatting
- `src/app.js` and `src/index.js` — actual behavior and constraints
