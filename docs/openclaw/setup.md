---
id: setup
title: Setting Up OpenClaw
sidebar_label: Setup
sidebar_position: 2
---

# Setting Up OpenClaw

OpenClaw is the AI agent runtime that MosBot OS connects to. This guide covers the basics of getting
OpenClaw running so you can connect MosBot to it.

:::info OpenClaw Documentation

OpenClaw has its own documentation. This guide covers only what you need to know to integrate it
with MosBot OS. :::

## OpenClaw deployment options

OpenClaw can run in several ways:

### Option A: Docker (local)

The simplest way to get started. OpenClaw runs as a Docker container on your local machine alongside
MosBot.

Refer to the OpenClaw documentation for the Docker Compose setup. Once running, the services will be
available at:

- Workspace service: `http://localhost:8080`
- Gateway: `http://localhost:18789`

### Option B: Kubernetes

OpenClaw runs as a pod in a Kubernetes cluster. This is the recommended setup for persistent,
always-on agent operation.

See [Kubernetes Deployment](./kubernetes) for the full guide.

### Option C: VPS / remote server

OpenClaw runs on a remote server. Expose ports 8080 and 18789 via firewall rules or a reverse proxy.

:::warning Security Note

When exposing OpenClaw ports over the internet, use a VPN or private network. At minimum, use strong
bearer tokens and TLS. Never expose these ports without authentication. :::

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

MosBot API authenticates to OpenClaw services using bearer tokens. You need to generate and
configure these tokens in both OpenClaw and MosBot.

### Workspace service token

Generate a secure random token:

```bash
openssl rand -base64 32
```

Configure this token in:

1. OpenClaw's workspace service configuration (as `WORKSPACE_SERVICE_TOKEN`)
2. MosBot API's `.env` (as `OPENCLAW_WORKSPACE_TOKEN`)

### Gateway token

The gateway token is configured in `openclaw.json` under `gateway.auth`. Retrieve it from your
OpenClaw configuration or generate one following OpenClaw's documentation.

Configure this token in MosBot API's `.env` as `OPENCLAW_GATEWAY_TOKEN`.

## Verifying OpenClaw is running

Once OpenClaw is running, verify the services are accessible:

```bash
# Workspace service health check
curl -H "Authorization: Bearer <your-workspace-token>" \
  http://localhost:8080/status

# Gateway health check (basic)
curl http://localhost:18789/health
```

## Next steps

Once OpenClaw is running and you have your tokens, proceed to
[Connecting MosBot API](./integration).
