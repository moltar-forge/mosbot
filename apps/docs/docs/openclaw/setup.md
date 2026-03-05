---
id: setup
title: Setting Up OpenClaw
sidebar_label: Setup
sidebar_position: 2
---

OpenClaw is the AI agent runtime that MosBot OS connects to. This guide covers what you need to run
alongside OpenClaw to enable the full MosBot OS integration.

:::info OpenClaw Documentation

OpenClaw has its own documentation. This guide covers only what you need to know to integrate it
with MosBot OS. :::

## What MosBot needs alongside OpenClaw

MosBot API connects to two services:

| Service           | Port  | Provided by             |
| ----------------- | ----- | ----------------------- |
| Workspace service | 18780 | **MosBot OS** (sidecar) |
| Gateway           | 18789 | **OpenClaw** (built-in) |

The **gateway** (port 18789) is built into OpenClaw — no extra setup required.

The **workspace service** (port 18780) is a lightweight HTTP sidecar provided by MosBot OS. It runs
alongside OpenClaw and exposes the OpenClaw workspace filesystem over HTTP. You need to deploy it
next to your OpenClaw instance, sharing the same workspace directory or volume.

## Deploying the workspace service sidecar

### Option A: Docker (local)

Add the MosBot workspace service to the same Docker Compose file as OpenClaw. It must share the same
OpenClaw home directory volume:

```yaml
services:
  openclaw:
    image: openclaw/openclaw:latest
    volumes:
      - ~/.openclaw:/home/node/.openclaw
    ports:
      - '18789:18789'

  mosbot-workspace:
    image: ghcr.io/bymosbot/mosbot-workspace-service:latest
    environment:
      WORKSPACE_SERVICE_TOKEN: your-secure-token
      CONFIG_ROOT: /openclaw-config
      MAIN_WORKSPACE_DIR: workspace
    volumes:
      - ~/.openclaw:/openclaw-config
    ports:
      - '18780:18780'
```

:::info Path contract

- `CONFIG_ROOT` is the single mounted OpenClaw root (typically `~/.openclaw`).
- `MAIN_WORKSPACE_DIR` selects the main workspace subdirectory inside that root (default:
  `workspace`).
- Main workspace virtual path is `/workspace`.
- Sub-agent workspaces resolve from `/workspace-<agent>` to `~/.openclaw/workspace-<agent>`.
- Shared dirs `/projects`, `/skills`, `/docs` resolve to `~/.openclaw/{projects,skills,docs}`.
- Use a read-write mount for normal MosBot usage (Projects/Skills/Docs and config edits).

:::

Once running, the services are available at:

- Workspace service: `http://localhost:18780`
- Gateway: `http://localhost:18789`

### Option B: Kubernetes

The workspace service runs as a sidecar container in the OpenClaw pod, sharing the same PVC.

See [Kubernetes Deployment](./kubernetes) for the full guide with manifests.

### Option C: VPS / remote server

Run the workspace service container on the same server as OpenClaw, mounting the same workspace home
directory:

```bash
docker run -d \
  --name mosbot-workspace \
  -e WORKSPACE_SERVICE_TOKEN=your-secure-token \
  -e CONFIG_ROOT=/openclaw-config \
  -e MAIN_WORKSPACE_DIR=workspace \
  -v /path/to/openclaw/config:/openclaw-config \
  -p 18780:18780 \
  ghcr.io/bymosbot/mosbot-workspace-service:latest
```

## Migration from old workspace env model

- Old: `WORKSPACE_FS_ROOT` + `CONFIG_FS_ROOT`
- New: `CONFIG_ROOT` + `MAIN_WORKSPACE_DIR`
- Old variables are no longer honored.

:::warning Security Note

Do not expose port 18780 to the public internet. Use a VPN or private network, and always use a
strong bearer token. Port 18789 (gateway) should also be kept private. :::

## OpenClaw configuration file

OpenClaw is configured via `openclaw.json`. This file defines:

- Agent identities and model assignments
- Channel integrations (Telegram, etc.)
- Memory backend settings
- Tool and plugin configuration
- Gateway settings

See the [Configuration Reference](../configuration/openclaw-json) for a complete guide to
`openclaw.json`.

## Generating tokens

MosBot API authenticates to both services using bearer tokens. You need to generate and configure
these tokens.

### Workspace service token

Generate a secure random token:

```bash
openssl rand -base64 32
```

Configure this token in:

1. The workspace service container (as `WORKSPACE_SERVICE_TOKEN`)
2. MosBot API's `.env` (as `OPENCLAW_WORKSPACE_TOKEN`)

### Gateway token

The gateway token is configured in `openclaw.json` under `gateway.auth`. Retrieve it from your
OpenClaw configuration or generate one following OpenClaw's documentation.

Configure this token in MosBot API's `.env` as `OPENCLAW_GATEWAY_TOKEN`.

## Verifying both services are running

```bash
# Workspace service health check
curl -H "Authorization: Bearer <your-workspace-token>" \
  http://localhost:18780/status

# Gateway health check
curl http://localhost:18789/health
```

## Next steps

Once both services are running and you have your tokens, proceed to
[Connecting MosBot API](./integration).
