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
| Workspace service | 8080  | **MosBot OS** (sidecar) |
| Gateway           | 18789 | **OpenClaw** (built-in) |

The **gateway** (port 18789) is built into OpenClaw — no extra setup required.

The **workspace service** (port 8080) is a lightweight HTTP sidecar provided by MosBot OS. It runs
alongside OpenClaw and exposes the OpenClaw workspace filesystem over HTTP. You need to deploy it
next to your OpenClaw instance, sharing the same workspace directory or volume.

## Deploying the workspace service sidecar

### Option A: Docker (local)

Add the MosBot workspace service to the same Docker Compose file as OpenClaw. It must share the same
workspace volume:

```yaml
services:
  openclaw:
    image: openclaw/openclaw:latest
    volumes:
      - openclaw-workspace:/home/user/.openclaw/workspace
    ports:
      - '18789:18789'

  mosbot-workspace:
    image: ghcr.io/bymosbot/mosbot-workspace-service:latest
    environment:
      WORKSPACE_SERVICE_TOKEN: your-secure-token
      WORKSPACE_ROOT: /workspace
    volumes:
      - openclaw-workspace:/workspace:ro
    ports:
      - '8080:8080'

volumes:
  openclaw-workspace:
```

Once running, the services are available at:

- Workspace service: `http://localhost:8080`
- Gateway: `http://localhost:18789`

### Option B: Kubernetes

The workspace service runs as a sidecar container in the OpenClaw pod, sharing the same PVC.

See [Kubernetes Deployment](./kubernetes) for the full guide with manifests.

### Option C: VPS / remote server

Run the workspace service container on the same server as OpenClaw, mounting the same workspace
directory:

```bash
docker run -d \
  --name mosbot-workspace \
  -e WORKSPACE_SERVICE_TOKEN=your-secure-token \
  -e WORKSPACE_ROOT=/workspace \
  -v /path/to/openclaw/workspace:/workspace:ro \
  -p 8080:8080 \
  ghcr.io/bymosbot/mosbot-workspace-service:latest
```

:::warning Security Note

Do not expose port 8080 to the public internet. Use a VPN or private network, and always use a
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
  http://localhost:8080/status

# Gateway health check
curl http://localhost:18789/health
```

## Next steps

Once both services are running and you have your tokens, proceed to
[Connecting MosBot API](./integration).
