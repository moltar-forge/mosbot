---
paths:
  - "src/**/*.jsx"
  - "src/**/*.js"
---

# Architecture

## Folder boundaries

| Folder | Owns |
| ------ | ---- |
| `src/pages/` | One file per route; page-level layout and data orchestration only |
| `src/components/` | Reusable UI components; no direct API calls |
| `src/stores/` | Zustand stores — one per domain; all shared state and API calls live here |
| `src/api/client.js` | Shared Axios instance — the only place HTTP config lives |
| `src/config/` | Static configuration (org chart topology, agent workspace mappings) |
| `src/constants/` | Shared enums (model names, statuses, priorities) |
| `src/utils/` | Pure utility functions; no side effects, no store access |

## State management

- One Zustand store per domain (e.g. `taskStore`, `agentStore`, `authStore`).
- Stores own their API calls — components call store actions, not `api.client` directly.
- Components read from stores via selectors; avoid subscribing to the entire store.
- UI-only state (open/close, hover) may live in local `useState` — don't over-centralize.

## Data fetching

- Fetch on user interaction (tab click, button press), not eagerly on mount/open.
- Always set loading state before a request and clear it in both success and error paths.
- Handle errors explicitly — surface them to the user, don't swallow them silently.

## Routing

- Routes are defined in `src/App.jsx`.
- Use `ProtectedRoute` for any route requiring authentication.
- Page components handle layout; delegate data logic to stores.

## External integrations

- All API base URLs come from `import.meta.env` — never hardcoded.
- The MosBot API is the only backend — all requests go through `src/api/client.js`.
- Features that depend on optional services degrade gracefully when unavailable.

## Documentation

- Update `docs/` when adding a new page, env var, or integration.
- New env vars must be added to `.env.example` with a placeholder.
- Do not include internal hostnames or deployment-specific URLs in docs.