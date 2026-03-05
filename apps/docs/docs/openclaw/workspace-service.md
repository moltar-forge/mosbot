---
id: workspace-service
title: Workspace Service
sidebar_label: Workspace Service
sidebar_position: 4
---

The workspace service is a lightweight HTTP REST sidecar **provided by MosBot OS** — it is not part
of the standard OpenClaw distribution. It runs alongside OpenClaw, shares the same workspace
directory or volume, and exposes the workspace filesystem over HTTP so MosBot API can read and write
workspace files, manage configuration, and list agents.

:::info Deployment

You need to run the workspace service container (`ghcr.io/bymosbot/mosbot-workspace-service:latest`)
next to your OpenClaw instance. The image supports both `linux/amd64` and `linux/arm64` platforms.

See [Setting Up OpenClaw](./setup) for Docker and Kubernetes deployment examples. :::

## Recommended mount configuration

For full MosBot functionality (agent discovery + Projects/Skills/Docs file edits), use:

- `CONFIG_ROOT=/openclaw-config`
- `MAIN_WORKSPACE_DIR=workspace`
- A single read-write mount for OpenClaw root (for example `~/.openclaw:/openclaw-config`)

`openclaw.json`, `agents.json`, shared folders (`projects`, `skills`, `docs`), and sub-agent
workspaces (`workspace-<agent>`) are resolved from `CONFIG_ROOT`. Main workspace virtual path
`/workspace` resolves to `CONFIG_ROOT/MAIN_WORKSPACE_DIR`.

## What the workspace service provides

- **File access**: read, create, update, and delete files in agent workspaces
- **Directory listing**: list files and directories recursively
- **Configuration access**: read and write `openclaw.json` and `agents.json`
- **Agent discovery**: list agents defined in `openclaw.json`
- **Typed docs-link management**: inspect/create/delete managed docs links per agent workspace

## Architecture

```text
MosBot API
    │
    │ HTTP (Bearer token auth)
    ▼
OpenClaw Workspace Service (port 18780)
    │
    │ Filesystem access
    ▼
Workspace PVC / directories
(`CONFIG_ROOT`: openclaw.json, agents.json, projects/, skills/, docs/, workspace-<agent>/...
 `CONFIG_ROOT/MAIN_WORKSPACE_DIR`: main workspace for virtual path `/workspace`)
```

In Kubernetes, the workspace service runs as a sidecar container in the OpenClaw pod and shares the
same PVC (Persistent Volume Claim). This means it has direct filesystem access to all workspace
directories.

## Authentication

The workspace service uses bearer token authentication. The token is shared between the workspace
service configuration and MosBot API's `OPENCLAW_WORKSPACE_TOKEN` environment variable.

### Generating a token

```bash
WORKSPACE_TOKEN="$(openssl rand -base64 32)"
echo "Save this token: ${WORKSPACE_TOKEN}"
```

Configure the same token in:

1. OpenClaw's workspace service (as `WORKSPACE_SERVICE_TOKEN` in its environment)
2. MosBot API's `.env` (as `OPENCLAW_WORKSPACE_TOKEN`)

## Security model

The workspace service is designed to be an **internal service** — not exposed to the public
internet:

- **Network isolation**: in Kubernetes, deploy as a ClusterIP service (no public ingress)
- **Bearer token auth**: all requests require a valid token
- **Path validation**: the service normalizes paths and rejects directory traversal attempts (e.g.
  `..`)
- **RBAC**: MosBot API enforces its own role-based access control before proxying requests to the
  workspace service

## Workspace directory structure

A typical OpenClaw layout:

```text
/openclaw-config            ← CONFIG_ROOT
├── openclaw.json           ← OpenClaw configuration
├── agents.json             ← Optional agent hierarchy metadata
├── workspace               ← main workspace (MAIN_WORKSPACE_DIR, virtual path "/workspace")
│   ├── memory/
│   └── HEARTBEAT.md
├── workspace-coo/          ← sub-agent workspace (virtual path "/workspace-coo")
│   ├── memory/             ← agent memory files
│   ├── skills/             ← agent-specific skills
│   └── HEARTBEAT.md        ← heartbeat context file
├── workspace-cto/          ← sub-agent workspace (virtual path "/workspace-cto")
│   ├── memory/
│   └── skills/
├── projects/               ← shared project files (virtual path "/projects")
├── skills/                 ← shared skills (virtual path "/skills")
└── docs/                   ← shared docs (virtual path "/docs")
```

## Virtual path contract (allowlisted)

Workspace service virtual paths are strict and allowlisted:

- Main workspace: `/workspace`, `/workspace/**`
- Config-root files: `/openclaw.json`, `/agents.json`
- Shared dirs: `/projects/**`, `/skills/**`, `/docs/**`
- Agent workspaces: `/workspace-<agent>/**`
- Legacy archive path: `/_archived_workspace_main/**`

All other absolute virtual paths are denied with `403` and code `PATH_NOT_ALLOWED`. `/` is
intentionally denied.

## Typed docs-link endpoints (workspace service direct)

The legacy bulk endpoint `POST /symlinks/ensure` was removed. Docs-link management now uses typed
per-agent endpoints:

- `GET /links/:type/:agentId`
- `PUT /links/:type/:agentId`
- `DELETE /links/:type/:agentId`

Current contract:

- `type` supports `docs` only
- `agentId=main` maps to `MAIN_WORKSPACE_DIR`
- Other `agentId` values map to `workspace-<agentId>`
- Invalid `type` returns `400 LINK_TYPE_UNSUPPORTED`
- Invalid `agentId` returns `400 INVALID_AGENT_ID`
- Link conflicts return `409 LINK_CONFLICT`

MosBot API reconciles docs links server-side (startup + agent create/update) and only writes when
missing. Dashboard page loads do not trigger link writes.

## API endpoints (via MosBot API)

MosBot API proxies workspace requests through its own authenticated endpoints:

| Endpoint                                       | Description                              |
| ---------------------------------------------- | ---------------------------------------- |
| `GET /api/v1/openclaw/workspace/status`        | Check workspace service connectivity     |
| `GET /api/v1/openclaw/workspace/files`         | List files (params: `path`, `recursive`) |
| `GET /api/v1/openclaw/workspace/files/content` | Read a file (param: `path`)              |
| `POST /api/v1/openclaw/workspace/files`        | Create a new file                        |
| `PUT /api/v1/openclaw/workspace/files`         | Update an existing file                  |
| `DELETE /api/v1/openclaw/workspace/files`      | Delete a file                            |
| `GET /api/v1/openclaw/config`                  | Read `openclaw.json`                     |
| `PUT /api/v1/openclaw/config`                  | Update `openclaw.json`                   |
| `GET /api/v1/openclaw/agents`                  | List agents from `openclaw.json`         |

Docs-link reconcile is internal in MosBot API for this phase; there is no public MosBot API endpoint
for direct link writes.

## Verifying the workspace service

```bash
# Direct check (bypassing MosBot API)
curl -H "Authorization: Bearer <workspace-token>" \
  http://localhost:18780/status

# Via MosBot API (requires MosBot JWT)
curl -H "Authorization: Bearer <mosbot-jwt>" \
  http://localhost:3000/api/v1/openclaw/workspace/status
```

## Troubleshooting

**503 on workspace endpoints** The workspace service is unreachable. Check:

- `OPENCLAW_WORKSPACE_URL` is correct
- The workspace service is running
- Network connectivity between MosBot API and the workspace service

**401 Unauthorized** The token doesn't match. Verify `OPENCLAW_WORKSPACE_TOKEN` in MosBot API's
`.env` matches the token configured in the workspace service.

**Workspace loads but models/agents fail** `CONFIG_ROOT` is not mounted correctly. Verify
`/files/content?path=/openclaw.json` succeeds on the workspace service.

**Config edits fail but file browsing works** `CONFIG_ROOT` is mounted read-only or points to the
wrong directory.

**Path traversal errors** The path contains `..` or other traversal sequences. Use absolute paths
from the workspace root (e.g. `/workspace-coo/memory/2026-03-01.md`).
