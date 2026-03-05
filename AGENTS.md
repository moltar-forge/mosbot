# AGENTS

This repository is a monorepo with four deployable packages:

- `api` (Node/Express backend)
- `web` (React/Vite dashboard)
- `docs` (Docusaurus docs)
- `workspace-server` (Node/Express sidecar)

## Engineering rules

- Treat `docs/` as the canonical documentation source.
- Keep package versions and changelogs independent.
- Run checks from root (`npm run lint`, `npm run test`) before merge.
- Prefer path-scoped workflows and package-scoped changes.
