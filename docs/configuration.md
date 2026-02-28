# Configuration Reference

MosBot Dashboard is configured entirely via `VITE_*` environment variables at build time.

## Variables

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `VITE_API_URL` | **Yes** | `http://localhost:3000/api/v1` | Full URL of MosBot API including version prefix |
| `VITE_API_TIMEOUT` | No | `10000` | API request timeout in milliseconds |
| `VITE_APP_NAME` | No | `MosBot` | App display name shown in the UI |

## Setting variables

### Local development

```bash
cp .env.example .env
# Edit .env
npm run dev
```

### Docker build

Pass as build args:

```bash
docker build \
  --build-arg VITE_API_URL=https://api.example.com/api/v1 
  -t mosbot-dashboard:latest .
```

Or via Docker Compose:

```yaml
build:
  args:
    VITE_API_URL: https://api.example.com/api/v1
```

### CI/CD

Set `VITE_API_URL` as a GitHub Actions secret and pass it as an env var during the build step.

## Security note

All `VITE_*` variables are **embedded in the built JavaScript bundle** and visible to anyone who loads the app. Never put secrets, tokens, or passwords in `VITE_*` variables.
