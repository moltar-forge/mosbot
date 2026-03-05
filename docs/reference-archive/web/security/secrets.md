# Secret and Configuration Management

MosBot Dashboard is a static React app (Vite). It has no server-side secrets — all
configuration is injected at **build time** via `VITE_*` environment variables.

## Where configuration lives

| Location | Purpose |
| -------- | ------- |
| `.env` (local) | Local development overrides. Never committed. |
| `VITE_*` build args | Injected by CI/CD at build time (e.g. `VITE_API_URL`). |
| GitHub Actions secrets | Store `VITE_API_URL` and any deployment credentials. |
| Docker build args | Passed via `docker build --build-arg VITE_API_URL=...` |

## Required variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `VITE_API_URL` | **Yes** | Full URL of MosBot API including version prefix (e.g. `https://api.example.com/api/v1`) |
| `VITE_API_TIMEOUT` | No | Request timeout in ms (default: 10000) |
| `VITE_APP_NAME` | No | App display name (default: `MosBot`) |

## What NOT to commit

- `.env` files (any variant)
- Any file containing API keys, tokens, or passwords

These patterns are covered by `.gitignore`.

## Security note on `VITE_*` variables

All `VITE_*` variables are **embedded in the built JavaScript bundle** and are visible to anyone
who downloads the app. Do not store secrets in `VITE_*` variables — only public configuration
(like the API base URL) belongs here.

For the full API secret management guide, see `mosbot-api/docs/security/secrets.md`.
