---
id: integration
title: Connecting MosBot API to OpenClaw
sidebar_label: Integration
sidebar_position: 3
---

# Connecting MosBot API to OpenClaw

Once OpenClaw is running, connect MosBot API by adding the integration variables to your `.env`
file.

## Minimal integration (workspace only)

To enable workspace browsing, skills management, and agent configuration:

```bash
# mosbot-api/.env
OPENCLAW_WORKSPACE_URL=http://localhost:18780
OPENCLAW_WORKSPACE_TOKEN=your-workspace-token
```

This enables:

- Workspace file browser in the dashboard
- Skills page
- Agents page (reads agent list from workspace)
- Configuration editing

## Full integration (workspace + gateway)

To also enable agent monitoring, live session data, and standups:

```bash
# mosbot-api/.env
OPENCLAW_WORKSPACE_URL=http://localhost:18780
OPENCLAW_WORKSPACE_TOKEN=your-workspace-token
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
```

## Applying the configuration

After updating `.env`, restart the API:

```bash
docker compose restart api
```

## Verifying the integration

### Check workspace connectivity

```bash
# Get a MosBot JWT first
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}' \
  | jq -r '.token')

# Check workspace status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/openclaw/workspace/status
```

### List agents

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/openclaw/agents
```

You should see a JSON array of agent objects from your `openclaw.json` configuration.

### List workspace files

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/v1/openclaw/workspace/files?path=/workspace&recursive=true"
```

Use explicit allowlisted roots (`/workspace`, `/workspace-<agent>`, `/docs`, `/projects`,
`/skills`). `path=/` is denied by workspace-service policy (`PATH_NOT_ALLOWED`).

## Connecting to OpenClaw in different environments

### OpenClaw runs locally (same machine as MosBot)

Use `localhost` for both services:

```bash
OPENCLAW_WORKSPACE_URL=http://localhost:18780
OPENCLAW_GATEWAY_URL=http://localhost:18789
```

### OpenClaw runs in Kubernetes

Port-forward both services to your local machine:

```bash
# Terminal 1: Workspace service
kubectl port-forward -n <namespace> svc/openclaw-workspace 18780:18780

# Terminal 2: Gateway
kubectl port-forward -n <namespace> svc/openclaw 18789:18789
```

Then use `localhost` in `.env`. See [Local Development](./local-development) for the full guide.

### OpenClaw runs in Docker, MosBot API also in Docker

Use `host.docker.internal` to reach services on the host from inside a container:

```bash
OPENCLAW_WORKSPACE_URL=http://host.docker.internal:18780
OPENCLAW_GATEWAY_URL=http://host.docker.internal:18789
```

### OpenClaw runs on a remote server

Use the server's hostname or IP address:

```bash
OPENCLAW_WORKSPACE_URL=http://openclaw.example.com:18780
OPENCLAW_GATEWAY_URL=http://openclaw.example.com:18789
```

:::warning Prefer a VPN or private network when connecting to OpenClaw over the internet. If you
must expose ports publicly, ensure TLS is enabled and tokens are strong. :::

## Troubleshooting

| Symptom                                   | Likely cause                  | Fix                                                                  |
| ----------------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| Dashboard shows "OpenClaw not configured" | Missing env vars              | Add `OPENCLAW_WORKSPACE_URL` and/or `OPENCLAW_GATEWAY_URL` to `.env` |
| 503 on workspace endpoints                | Workspace service unreachable | Check `OPENCLAW_WORKSPACE_URL` and that the service is running       |
| 401 on workspace endpoints                | Wrong token                   | Verify `OPENCLAW_WORKSPACE_TOKEN` matches OpenClaw's config          |
| Only seeing one agent                     | Workspace service unreachable | API falls back to default agent; check workspace connectivity        |

See [Troubleshooting](./troubleshooting) for more.
