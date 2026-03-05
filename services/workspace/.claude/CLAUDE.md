# MosBot Workspace Service

Lightweight HTTP service that exposes OpenClaw workspace files over REST API. This service runs as a sidecar container alongside OpenClaw and provides file access for MosBot OS.

## Tech stack

- **Node.js (>=18)** + **Express** — HTTP server and routing
- **Jest + Supertest** — testing framework and HTTP assertions
- **Prettier** — code formatting (enforced via Husky pre-commit hook)

## Commands

```bash
npm install          # install dependencies
npm start            # start the service
npm run test:run     # run tests once
npm run test:coverage # run tests with coverage report
npm run format       # format all files
npm run format:check # check formatting without changing files
```

## Repo shape

```
server.js            — backwards-compatible entrypoint (delegates to src/)
src/
  app.js             — Express app factory (routes, middleware, helpers)
  index.js            — process entrypoint (env validation, server start)
__tests__/           — Jest test suite (API + helpers)
```

## Non-negotiables

1. **Authentication is required** — `WORKSPACE_SERVICE_TOKEN` must be set; service refuses to start without it (except in dev mode with `WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true`).
2. **Path safety must be preserved** — all user-provided paths must be validated through `assertWithinRoot` to prevent path traversal.
3. **No token logging** — never log or return bearer tokens in responses or logs, even on error.
4. **Maintain 100% test coverage** — all changes must include corresponding tests.
5. **Security-first approach** — this service handles file system operations and must be treated as a privileged internal API.

## Docs

- API usage: `README.md`
- Security model: `SECURITY.md`
- Development: `CONTRIBUTING.md`
- Operating principles: `AGENTS.md`
