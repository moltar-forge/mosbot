# MosBot Workspace Service

Lightweight HTTP service that exposes OpenClaw workspace files over REST API. This service runs as a sidecar container alongside OpenClaw and provides file access for MosBot OS.

## Features

- REST API for workspace file operations (list, read, write, delete)
- Bearer token authentication (**required by default**)
- Symlink remapping for cross-container paths
- Path traversal protection
- Health check endpoint
- Multi-platform Docker images (amd64, arm64)

## Security

> **This service can read, write, and delete files on the mounted workspace volume. Treat it as a privileged internal API.**

- **Authentication is required** — `WORKSPACE_SERVICE_TOKEN` must be set. The service will refuse to start without it.
- **Never expose port 8080 to the public internet** — use a VPN, private network, or Kubernetes `ClusterIP` service.
- Always use a strong, randomly generated bearer token (`openssl rand -hex 32`).
- The service runs as a non-root user inside the container.
- Path traversal protection is built-in and cannot be bypassed via the API.
- Mount workspace volumes as read-only (`:ro`) when write access is not required.

See [SECURITY.md](SECURITY.md) for the full threat model and vulnerability reporting process.

## Quick Start

### Docker Compose

```yaml
services:
  mosbot-workspace:
    image: ghcr.io/bymosbot/mosbot-workspace-service:latest
    environment:
      WORKSPACE_SERVICE_TOKEN: your-secure-token # required
      WORKSPACE_ROOT: /workspace
    volumes:
      - openclaw-workspace:/workspace:ro
    ports:
      - "8080:8080"
```

### Docker Run

```bash
docker run -d \
  --name mosbot-workspace \
  -e WORKSPACE_SERVICE_TOKEN=your-secure-token \
  -e WORKSPACE_ROOT=/workspace \
  -v /path/to/openclaw/workspace:/workspace:ro \
  -p 8080:8080 \
  ghcr.io/bymosbot/mosbot-workspace-service:latest
```

## Environment Variables

| Variable                            | Default                | Description                                                                                         |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`                              | `8080`                 | HTTP server port                                                                                    |
| `WORKSPACE_ROOT`                    | `/workspace`           | Root directory where workspace is mounted                                                           |
| `WORKSPACE_SUBDIR`                  | `workspace`            | Subdirectory within `WORKSPACE_ROOT` to expose (prevents browsing the entire filesystem)            |
| `WORKSPACE_SERVICE_TOKEN`           | —                      | **Required.** Bearer token for authentication. The service will not start without this.             |
| `SYMLINK_REMAP_PREFIXES`            | `/home/node/.openclaw` | Comma-separated list of symlink prefixes to remap (for cross-container symlinks)                    |
| `WORKSPACE_SERVICE_ALLOW_ANONYMOUS` | —                      | Set to `true` to disable auth requirement. **For local development only. Never use in production.** |

> **Deprecated aliases** (still accepted for backward compatibility):
>
> - `WORKSPACE_PATH` → use `WORKSPACE_ROOT` instead
> - `AUTH_TOKEN` → use `WORKSPACE_SERVICE_TOKEN` instead

## API Endpoints

### Health Check

```bash
GET /health
```

Returns service status and configuration. Does not require authentication.

### Workspace Status

```bash
GET /status
Authorization: Bearer <token>
```

Returns workspace accessibility status.

### List Files

```bash
GET /files?path=/&recursive=false
Authorization: Bearer <token>
```

List files and directories. Use `recursive=true` for recursive listing.

### Get File Content

```bash
GET /files/content?path=/path/to/file&encoding=utf8
Authorization: Bearer <token>
```

Read file content.

### Create File

```bash
POST /files
Authorization: Bearer <token>
Content-Type: application/json

{
  "path": "/path/to/file",
  "content": "file content",
  "encoding": "utf8"
}
```

### Update File

```bash
PUT /files
Authorization: Bearer <token>
Content-Type: application/json

{
  "path": "/path/to/file",
  "content": "updated content",
  "encoding": "utf8"
}
```

### Delete File/Directory

```bash
DELETE /files?path=/path/to/file
Authorization: Bearer <token>
```

## Development

### Local Development

```bash
npm install
cp .env.example .env
# Edit .env and set WORKSPACE_SERVICE_TOKEN
npm start
```

Alternatively, export variables directly in your shell:

```bash
export WORKSPACE_SERVICE_TOKEN=dev-token-change-me
npm start
```

For local development without a token (not for production):

```bash
# In .env:
WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true
# Or via shell:
export WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true
npm start
```

### Run Tests

```bash
npm run test:run       # run once
npm run test:coverage  # run with 100% coverage enforcement
```

### Format Code

```bash
npm run format         # auto-fix
npm run format:check   # check only (used in CI)
```

### Build Docker Image

```bash
docker build -t mosbot-workspace-service:latest .
```

## License

[MIT](LICENSE)

## Related Projects

- [MosBot API](https://github.com/bymosbot/mosbot-api) — Backend API that consumes this service
- [MosBot Dashboard](https://github.com/bymosbot/mosbot-dashboard) — Frontend UI
- [MosBot OS Documentation](https://github.com/bymosbot/mosbot-api/tree/main/docs) — Full system documentation
