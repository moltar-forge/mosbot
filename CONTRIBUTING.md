# Contributing

## Repository layout

- `api/` backend service
- `web/` dashboard frontend
- `docs/` canonical documentation
- `workspace-server/` workspace sidecar service

## Development workflow

1. Install dependencies once from repo root: `npm install`
2. Start stack: `npm run compose:up`
3. Run quality gates before opening PR:
   - `npm run lint`
   - `npm run test`

## Pull requests

- Keep changes scoped by package when possible.
- Update documentation in `docs/` for behavior/config changes.
- Do not commit secrets or local env files.
