# MosBot Monorepo

MosBot is organized as a single repository with four top-level packages:

- `api/` — MosBot backend API
- `web/` — dashboard frontend
- `docs/` — Docusaurus documentation site
- `workspace-server/` — OpenClaw workspace sidecar service

## Quickstart

```bash
npm install
npm run compose:up
```

- API: `http://localhost:3000`
- Web: `http://localhost:5173`
- Docs: run `npm run dev:docs`

## Common commands

```bash
npm run lint
npm run test
npm run build
npm run compose:down
```

See package-level READMEs for service-specific details.
