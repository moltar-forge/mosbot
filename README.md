# MosBot Workspace Service

[![CI](https://github.com/bymosbot/mosbot-workspace-service/actions/workflows/ci.yml/badge.svg)](https://github.com/bymosbot/mosbot-workspace-service/actions/workflows/ci.yml)
[![Coverage](https://coveralls.io/repos/github/bymosbot/mosbot-workspace-service/badge.svg?branch=main)](https://coveralls.io/github/bymosbot/mosbot-workspace-service)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Lightweight HTTP service that exposes OpenClaw workspace files over REST API. This service runs as a sidecar container alongside OpenClaw and provides file access for MosBot OS.

## Features

- REST API for workspace file operations (list, read, write, delete)
- Bearer token authentication (**required by default**)
- Symlink remapping for cross-container paths
- Path traversal protection
- Health check endpoint
- Multi-platform Docker images (amd64, arm64)

## Security

> **This service can read, write, and delete files under the mounted OpenClaw root. Treat it as a privileged internal API.**

- **Authentication is required** — `WORKSPACE_SERVICE_TOKEN` must be set. The service will refuse to start without it.
- **Never expose port 8080 to the public internet** — use a VPN, private network, or Kubernetes `ClusterIP` service.
- Always use a strong, randomly generated bearer token (`openssl rand -hex 32`).
- The service runs as a non-root user inside the container.
- Path traversal protection is built-in and cannot be bypassed via the API.
- For normal MosBot usage, mount the OpenClaw root read-write so Projects/Skills/Docs and config edits can succeed.

See [SECURITY.md](SECURITY.md) for the full threat model and vulnerability reporting process.

## Quick Start

### Docker Compose

```yaml
services:
  mosbot-workspace:
    image: ghcr.io/bymosbot/mosbot-workspace-service:latest
    environment:
      WORKSPACE_SERVICE_TOKEN: your-secure-token # required
      CONFIG_ROOT: /openclaw-config
      MAIN_WORKSPACE_DIR: workspace
    volumes:
      - /path/to/.openclaw:/openclaw-config
    ports:
      - "8080:8080"
```

### Docker Run

```bash
docker run -d \
  --name mosbot-workspace \
  -e WORKSPACE_SERVICE_TOKEN=your-secure-token \
  -e CONFIG_ROOT=/openclaw-config \
  -e MAIN_WORKSPACE_DIR=workspace \
  -v /path/to/.openclaw:/openclaw-config \
  -p 8080:8080 \
  ghcr.io/bymosbot/mosbot-workspace-service:latest
```

For full MosBot integration (agent discovery via `openclaw.json` + Projects/Skills/Docs CRUD), use
a read-write mount for `CONFIG_ROOT`.

## Environment Variables

| Variable                            | Default                | Description                                                                                         |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`                              | `8080`                 | HTTP server port                                                                                    |
| `CONFIG_ROOT`                       | `/openclaw-config`     | Absolute OpenClaw root mount containing config, shared dirs, and agent workspaces                   |
| `MAIN_WORKSPACE_DIR`                | `workspace`            | Main workspace directory name under `CONFIG_ROOT` (single folder name only; no `/`, `\`, `.`, `..`) |
| `WORKSPACE_SERVICE_TOKEN`           | —                      | **Required.** Bearer token for authentication. The service will not start without this.             |
| `SYMLINK_REMAP_PREFIXES`            | `/home/node/.openclaw` | Comma-separated list of symlink prefixes to remap (for cross-container symlinks)                    |
| `WORKSPACE_SERVICE_ALLOW_ANONYMOUS` | —                      | Set to `true` to disable auth requirement. **For local development only. Never use in production.** |

Removed and no longer honored: `WORKSPACE_FS_ROOT`, `CONFIG_FS_ROOT`, `WORKSPACE_ROOT`,
`WORKSPACE_SUBDIR`, `WORKSPACE_PATH`, `AUTH_TOKEN`.

## Filesystem and Virtual Path Contract

Given `CONFIG_ROOT=/openclaw-config` and `MAIN_WORKSPACE_DIR=workspace`:

- Main workspace filesystem root: `/openclaw-config/workspace`
- Sub-agent workspaces: `/openclaw-config/workspace-<agent>`
- Shared directories: `/openclaw-config/projects`, `/openclaw-config/skills`, `/openclaw-config/docs`

Routing rules:

- Main workspace canonical paths: `/workspace` and `/workspace/**` (mapped to `CONFIG_ROOT/MAIN_WORKSPACE_DIR`)
- Config-root allowlist:
  `/openclaw.json`, `/agents.json`, `/projects/**`, `/skills/**`, `/docs/**`,
  `/workspace-<agent>/**`, and legacy archive paths such as `/_archived_workspace_main/**`
- All other absolute paths are denied with `403` and code `PATH_NOT_ALLOWED`
- Virtual root `/` is not allowlisted and is denied with `403 PATH_NOT_ALLOWED`

Canonical main workspace virtual path is `/workspace`.

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
GET /files?path=/workspace&recursive=false
Authorization: Bearer <token>
```

List files and directories. Use `recursive=true` for recursive listing.
`path=/` (or omitted `path`) is denied with `403 PATH_NOT_ALLOWED`.

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

### Ensure Shared Docs Symlinks

```bash
POST /symlinks/ensure
Authorization: Bearer <token>
```

Ensures shared docs projection under `CONFIG_ROOT`:

- real shared directory: `CONFIG_ROOT/docs`
- workspace symlinks:
  - `CONFIG_ROOT/<MAIN_WORKSPACE_DIR>/docs`
  - `CONFIG_ROOT/workspace-*/docs` (for existing workspace directories)

Behavior:

- idempotent when symlinks already point to `CONFIG_ROOT/docs`
- returns `409` with conflict details when a destination exists and is not the expected symlink
- never overwrites conflicting files/directories

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
