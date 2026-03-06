# AGENTS

Engineering reference for AI agents and contributors working in the MosBot monorepo.

## Project structure

This monorepo uses npm workspaces with four deployable packages.

### api/ — Backend API (v0.1.2)

Node.js/Express REST API backed by PostgreSQL. CommonJS modules.

- Entry point: `src/index.js`
- `src/routes/` — Route handlers (auth, tasks, users, activity, standups, models, openclaw, admin/)
- `src/services/` — Business logic (camelCase with `Service` suffix)
- `src/db/` — Database pool, migration runner
- `src/db/migrations/` — Numbered SQL migrations (`NNN_description.sql`)
- `src/jobs/` — Background jobs
- `src/utils/` — Shared utilities
- `src/config.js` — Central config from environment variables
- `src/__tests__/` — Tests
- Test runner: Jest 30 + supertest
- Lint: ESLint 9 flat config (`eslint.config.js`)

### web/ — Dashboard (v0.1.4)

React 18 SPA with Vite, Tailwind CSS, Zustand. ES modules (`"type": "module"`).

- Entry point: `src/main.jsx`
- `src/pages/` — Route-level page components (PascalCase)
- `src/components/` — Reusable UI components (PascalCase)
- `src/stores/` — Zustand stores (camelCase with `Store` suffix)
- `src/api/` — API client layer
- `src/config/` — App configuration
- `src/constants/` — Shared constants
- `src/utils/` — Shared utilities
- `src/test/` — Test setup/helpers
- Test runner: Vitest 3 + @testing-library/react + jsdom
- Lint: ESLint 8 legacy config (`.eslintrc.cjs`)

### docs/ — Documentation site

Docusaurus 3 site. Content in `docs/` subdirectories organized by topic.

- Lint: ESLint for JS, markdownlint for .md files
- Test: markdownlint + remark-validate-links for link checking
- Format: Prettier with `proseWrap: "always"` for markdown

### workspace-server/ — Workspace sidecar (v0.1.0)

Lightweight Express HTTP service for OpenClaw workspace file access. CommonJS modules.

- Entry point: `server.js`
- Source in `src/`, tests in `__tests__/`
- Test runner: Jest 29 + supertest
- Format: Prettier only (no ESLint), double quotes, printWidth 90

## Engineering conventions

- Treat `docs/` as the canonical documentation source.
- Keep package versions and changelogs independent.
- Run checks from root (`npm run lint`, `npm run test`) before merge.
- Prefer path-scoped workflows and package-scoped changes.
- Use `npm run -w ./PACKAGE` syntax for package-specific commands.
- Never commit `.env` files or secrets — the repo has gitleaks scanning.

### Module systems

- `api/` and `workspace-server/` use CommonJS (`require`/`module.exports`)
- `web/` and `docs/` use ES modules (`import`/`export`)

### Code style

Prettier is the authoritative formatter. Root `.prettierrc.json` config:

- Single quotes, semicolons, trailing commas, 100-char print width
- workspace-server override: double quotes, 90-char print width
- docs override: `proseWrap: "always"` for markdown

ESLint rules:

- `no-console`: warn (allows `console.warn` and `console.error`)
- `no-unused-vars`: error in api (ignore `_` prefix), warn in web
- `react/prop-types`: off in web
- Prefix unused variables/args with `_`

### Naming conventions

| What | Convention | Example |
|------|-----------|---------|
| React components | PascalCase files | `KanbanBoard.jsx`, `TaskCard.jsx` |
| Zustand stores | camelCase + `Store` suffix | `taskStore.js`, `authStore.js` |
| API routes | lowercase single-word | `auth.js`, `tasks.js`, `standups.js` |
| API services | camelCase + `Service` suffix | `standupService.js`, `cronJobsService.js` |
| Migrations | zero-padded prefix + snake_case | `005_session_usage.sql` |
| Tests | `__tests__/` dirs or co-located `.test.{js,jsx}` | `auth.test.js` |

## CI/CD pipeline

Six GitHub Actions workflows in `.github/workflows/`:

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| CI | `ci.yml` | PR, push to main | Lint, test, coverage for all packages |
| Docker Build | `docker-build.yml` | PR (path-filtered) | Build Docker images without push |
| Release | `release.yml` | Tag push (`api-v*`, `web-v*`, `workspace-server-v*`) | Dispatch to release-docker |
| Docker Release | `release-docker.yml` | Called by release.yml | Multi-platform build, push to GHCR, draft release |
| Deploy Docs | `deploy-docs.yml` | Push to main (docs/**) | Build and deploy docs to GitHub Pages |
| Secret Scan | `secret-scan.yml` | PR, push to main | Gitleaks secret detection |

### CI job breakdown

The CI workflow runs these jobs in parallel:

1. **API** — lint → migrate (test Postgres) → test with coverage
2. **Web** — lint → test with coverage → build
3. **Docs** — lint JS → lint markdown → validate links → format check → build
4. **Workspace** — format check → test with coverage

All jobs upload coverage to Coveralls with parallel finalization.

### What must pass before merge

All CI jobs, Docker build (if relevant paths changed), and secret scan.

## Testing

| Package | Runner | Single run | Watch | Coverage |
|---------|--------|-----------|-------|----------|
| api | Jest 30 | `make api.test-run` | `make api.test` | `npm run -w ./api test:coverage` |
| web | Vitest 3 | `make web.test-run` | `make web.test` | `npm run -w ./web test:coverage` |
| docs | markdownlint + remark | `make docs.test` | N/A | N/A |
| workspace-server | Jest 29 | `make workspace.test-run` | `make workspace.test` | `make workspace.coverage` |

Run all: `npm run test` or `make repo.test`

Notes:

- API tests need PostgreSQL. CI uses a Postgres 15 service container. Locally, use the harness Postgres.
- Web tests use jsdom via Vitest — no browser required.
- Docs tests validate markdown lint rules and internal link integrity.

### Test file placement

- **api**: `src/__tests__/` directory or co-located `.test.js` files alongside source
- **web**: co-located `.test.jsx` files alongside components/pages, `src/test/` for shared setup
- **workspace-server**: `__tests__/` directory at package root

## Database

### Migration system

- Migrations live in `api/src/db/migrations/`
- Naming: `NNN_description.sql` (zero-padded 3-digit sequence number)
- Optional post-migration hooks: `NNN_description.post.js`
- Runner uses PostgreSQL advisory locks to prevent concurrent execution
- Tracked in `schema_migrations` table
- Auto-runs on API startup; manual: `make api.migrate`
- Each migration runs in a transaction and rolls back on failure

### Adding a new migration

1. Create `api/src/db/migrations/NNN_description.sql` with the next sequence number
2. Optionally create a `.post.js` hook for data seeding/transformation
3. Run `make api.migrate` to apply
4. Test with fresh DB: `make api.db-reset` (destructive)

### Database details

- PostgreSQL 15 (Alpine image in Docker)
- Default database/user: `mosbot`
- Connection pool: `api/src/db/pool.js`
- Config vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

## Docker and deployment

### Dockerfile structure

All three packages (api, web, workspace-server) use multi-stage builds:

- `base` — Alpine Node 25 with dumb-init
- `dependencies` / `dev-dependencies` — Separated dependency installation
- `development` — Hot-reload target (used by Docker Compose harness)
- `production` — Minimal image with health checks

Production targets:

| Package | Runs | Port |
|---------|------|------|
| api | `node src/index.js` | 3000 |
| web | nginx serving Vite build | 80 |
| workspace-server | `node server.js` | 18780 |

### Docker Compose harness

`docker/docker-compose.yml` — development-only stack, NOT for production.

Six services: openclaw-gateway, openclaw-cli, workspace, api, dashboard, postgres. All use `development` Docker target with source bind-mounts for hot reload.

### Container registry

GHCR (`ghcr.io`). Multi-platform images: `linux/amd64` and `linux/arm64`.

## Release process

Each package is versioned independently. Releases are tag-triggered:

| Tag pattern | Package |
|------------|---------|
| `api-v*.*.*` | api |
| `web-v*.*.*` | web |
| `workspace-server-v*.*.*` | workspace-server |

Steps:

1. Update version in the relevant `package.json`
2. Commit and push to main
3. Tag and push: `git tag api-v0.1.3 && git push origin api-v0.1.3`
4. Release workflow builds, pushes Docker image to GHCR, creates draft GitHub Release

## Where to put new code

| What you are adding | Where to put it |
|---------------------|----------------|
| New API endpoint | `api/src/routes/` + `api/src/services/` |
| New database table/column | `api/src/db/migrations/NNN_description.sql` |
| New React page | `web/src/pages/PageName.jsx` + route in `web/src/App.jsx` |
| New React component | `web/src/components/ComponentName.jsx` |
| New Zustand store | `web/src/stores/featureStore.js` |
| New documentation page | `docs/docs/CATEGORY/page-name.md` |
| API route test | `api/src/routes/__tests__/` or co-located |
| React component test | Co-located `.test.jsx` alongside the component |
| Background job | `api/src/jobs/` |
| Docker config | `docker/` |
| CI/CD workflow | `.github/workflows/` |

## Key environment variables

Configured in `docker/.env` (generated by `docker/docker-setup.sh`):

| Variable | Purpose | Default |
|----------|---------|---------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection | `mosbot` / `5432` |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Authentication | — / `7d` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD` | First-run owner account | `mosbot@gmail.com` |
| `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN` | OpenClaw gateway | `http://openclaw-gateway:18789` |
| `OPENCLAW_WORKSPACE_URL`, `OPENCLAW_WORKSPACE_TOKEN` | Workspace sidecar | `http://workspace:18780` |
| `VITE_API_URL`, `VITE_APP_NAME` | Dashboard build-time config | `http://localhost:3000/api/v1` / `MosBot` |
| `TIMEZONE` | Server timezone | `UTC` |
