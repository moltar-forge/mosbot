# MosBot OS

Self-hosted operating system for AI agent work, built on [OpenClaw](https://github.com/anthropics/openclaw). MosBot OS provides a human-operable control plane to monitor agents, manage tasks, browse workspaces, and orchestrate agent activity from a single dashboard.

## Architecture

```
┌──────────────────────────┐
│  Dashboard (React SPA)   │  web/
└────────────┬─────────────┘
             │ REST API
┌────────────▼─────────────┐
│  MosBot API (Express)    │  api/
│  + PostgreSQL            │
└────────────┬─────────────┘
             │ HTTP + WebSocket
┌────────────▼─────────────┐
│  OpenClaw Runtime        │  external
│  + Workspace Sidecar     │  workspace-server/
└──────────────────────────┘
```

Key features: Agent Monitor, Task Board (kanban), Workspaces, Skills, Standups, Scheduler, Usage/Cost Tracking, Model Fleet management.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, Tailwind CSS 3, Zustand |
| Backend | Express 4, PostgreSQL 15 |
| Testing | Jest 30 (api), Vitest 3 (web), markdownlint (docs) |
| Linting | ESLint, Prettier |
| Containers | Docker, Docker Compose, nginx |
| CI/CD | GitHub Actions, Coveralls, GHCR |
| Runtime | Node.js >= 25.0.0 |

## Prerequisites

- [Node.js](https://nodejs.org/) >= 25.0.0
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- npm (included with Node.js)

## Quickstart

### Full-stack harness (recommended for first run)

```bash
git clone https://github.com/ByMosDev/mosbot-os.git
cd mosbot
npm install
make harness.setup   # Interactive first-time setup — generates docker/.env
make harness.up      # Start all services
```

`harness.setup` runs `docker/docker-setup.sh`, which handles OpenClaw onboarding and generates all required tokens.

### Quick compose (if docker/.env already configured)

```bash
npm install
npm run compose:up
```

### Default ports

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:5173 |
| API | http://localhost:3000 |
| OpenClaw Gateway | http://localhost:18789 |
| Workspace Server | http://localhost:18780 |
| PostgreSQL | localhost:5432 |
| Docs (standalone) | http://localhost:3001 |

## Development

Run `make help` for the full list of targets. Highlights:

### Repo-wide

```bash
make repo.lint       # Lint all packages
make repo.test       # Test all packages
make repo.build      # Build web + docs
make repo.format     # Format docs + workspace-server
```

### Individual packages

```bash
make api.dev         # Start API dev server
make web.dev         # Start web dev server
make docs.dev        # Start docs dev server
make workspace.dev   # Start workspace server
```

Or use npm workspaces directly:

```bash
npm run -w ./api dev
npm run -w ./web dev
npm run -w ./docs start
npm run -w ./workspace-server start
```

The API requires PostgreSQL and OpenClaw — the simplest approach is `make harness.up` then run individual dev servers against those backing services.

### Harness management

```bash
make harness.setup   # First-time setup (interactive)
make harness.up      # Start full dev harness
make harness.down    # Stop harness
make harness.reset   # Reset harness state (destructive)
make harness.logs    # Follow harness logs
make harness.ps      # Show harness status
```

## Common commands

| Command | Description |
|---------|-------------|
| `npm run lint` | Lint all packages |
| `npm run test` | Test all packages |
| `npm run build` | Build web + docs |
| `npm run format` | Format docs + workspace-server |
| `npm run compose:up` | Start Docker Compose stack |
| `npm run compose:down` | Stop Docker Compose stack |

## Repository structure

```
mosbot/
├── api/                  Node/Express backend API
├── web/                  React/Vite dashboard
├── docs/                 Docusaurus documentation site
├── workspace-server/     Workspace file access sidecar
├── docker/               Docker Compose harness for local dev
├── .github/workflows/    CI/CD pipeline (6 workflows)
├── Makefile              Development task runner
├── AGENTS.md             Agent and contributor engineering guide
├── CONTRIBUTING.md       Contribution guide
└── LICENSE               MIT License
```

## Links

- [AGENTS.md](AGENTS.md) — Engineering conventions and project reference
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to contribute
- [api/README.md](api/README.md) — API package details
- [web/README.md](web/README.md) — Dashboard package details
- [docs/README.md](docs/README.md) — Documentation site details
- [workspace-server/README.md](workspace-server/README.md) — Workspace sidecar details

## License

[MIT](LICENSE)
