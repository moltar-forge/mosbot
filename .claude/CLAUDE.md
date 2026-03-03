# MosBot Dashboard

UI layer of MosBot OS — a self-hosted operating system for AI agent work. React 18 + Vite SPA providing task management, org chart visualization, workspace browsing, and agent monitoring. Consumes the MosBot API backend.

## Tech stack

- **React 18** — functional components with hooks only
- **Vite** — build tool and dev server
- **Tailwind CSS** — utility-first styling (dark theme)
- **Zustand** — lightweight state management (one store per domain)
- **Axios** — HTTP client via shared instance at `src/api/client.js`
- **React DnD** — drag-and-drop
- **Heroicons** — icons
- **Vitest** — unit tests

## Commands

```bash
make dev        # start Vite dev server (http://localhost:5173)
make lint       # ESLint
make test-run   # run tests once (CI)
make build      # production build

# Without Make:
npm run dev          # Vite dev server
npm run build        # production build (output: dist/)
npm run preview      # preview production build
npm run test:run     # run tests once
npm run lint         # ESLint
```

## Repo shape

```
src/
  App.jsx               — root component and routing
  main.jsx              — entry point
  api/
    client.js           — shared Axios instance (use this, never create new ones)
  components/           — reusable UI components
  pages/                — page-level components (one per route)
  stores/               — Zustand stores (one per domain)
  config/               — static config (org chart, agent workspaces)
  constants/            — shared enums (models, statuses, priorities)
  utils/
    helpers.js          — shared utilities (classNames, etc.)
    constants.js        — shared enums (statuses, priorities, columns)
  test/
    setup.js            — Vitest global setup
    mocks/              — shared mock modules
docs/                   — canonical documentation
```

## Non-negotiables

1. Use the shared `api` instance from `src/api/client.js` — never create new Axios clients.
2. Functional components only — no class components.
3. Zustand for all shared state — one store per domain under `src/stores/`.
4. Lazy-load tab data — don't fetch on modal open; fetch on tab click.
5. Always show loading and error states — no silent async operations.
6. `VITE_*` vars are public — never put secrets in environment variables.

## Docs

- Local setup: `docs/getting-started/local-development.md`
- Architecture: `docs/architecture.md`
- Configuration: `docs/getting-started/configuration.md`
- API integration: `docs/integrations/mosbot-api.md`
- OpenClaw integration: `docs/integrations/openclaw.md`
