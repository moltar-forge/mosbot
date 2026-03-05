---
id: local-development
title: Local Development with OpenClaw
sidebar_label: Local Development
sidebar_position: 6
---

# Local Development with OpenClaw

This guide covers running MosBot API locally while connecting to OpenClaw services deployed in
Kubernetes, using `kubectl port-forward`.

## When you need this

- You're developing MosBot locally but OpenClaw runs in a Kubernetes cluster
- You want to test agent monitoring, workspace browsing, or skills management
- You need to verify OpenClaw integration without a full local OpenClaw setup

## Prerequisites

- OpenClaw deployed in a Kubernetes cluster
- `kubectl` configured to access the cluster (`kubectl get pods` works)
- MosBot API running locally (via `npm run dev` or Docker)

## Step 1: Get the tokens

Retrieve the OpenClaw service tokens from your Kubernetes secrets. Adjust the namespace and secret
names to match your deployment:

```bash
# Workspace service token
kubectl get secret -n openclaw-personal openclaw-secrets \
  -o jsonpath='{.data.WORKSPACE_SERVICE_TOKEN}' | base64 -d && echo

# Gateway token (if used)
kubectl get secret -n openclaw-personal openclaw-secrets \
  -o jsonpath='{.data.OPENCLAW_GATEWAY_TOKEN}' | base64 -d && echo
```

## Step 2: Port-forward the services

Open two terminal windows and run one port-forward in each:

```bash
# Terminal 1: Workspace service
kubectl port-forward -n openclaw-personal svc/openclaw-workspace 18780:18780

# Terminal 2: Gateway service (if used)
kubectl port-forward -n openclaw-personal svc/openclaw 18789:18789
```

Keep both terminals open while developing. If a port-forward drops, restart it.

## Step 3: Configure `.env`

### If running MosBot API natively (on your host)

```bash
OPENCLAW_WORKSPACE_URL=http://localhost:18780
OPENCLAW_WORKSPACE_TOKEN=<workspace-token-from-step-1>
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=<gateway-token-from-step-1>
```

### If running MosBot API in Docker

Use `host.docker.internal` to reach the port-forwarded services from inside the container:

```bash
OPENCLAW_WORKSPACE_URL=http://host.docker.internal:18780
OPENCLAW_WORKSPACE_TOKEN=<workspace-token-from-step-1>
OPENCLAW_GATEWAY_URL=http://host.docker.internal:18789
OPENCLAW_GATEWAY_TOKEN=<gateway-token-from-step-1>
```

## Step 4: Restart the API

```bash
# Native
npm run dev

# Docker
docker compose restart api
```

## Step 5: Verify

### Check agent discovery

```bash
curl http://localhost:3000/api/v1/openclaw/agents
```

You should see a JSON array of agents from your `openclaw.json`.

### Check workspace service directly

```bash
curl -H "Authorization: Bearer <workspace-token>" http://localhost:18780/status
```

### Check workspace via MosBot API

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}' \
  | jq -r '.token')

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/openclaw/workspace/status
```

## Troubleshooting

| Symptom                   | Cause                                                    | Fix                                                                 |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| 503 errors                | Port-forward stopped or service restarted                | Restart the port-forward in the terminal                            |
| Connection refused        | Wrong namespace/service name or port-forward not running | Check service names: `kubectl get svc -n <namespace>`               |
| 401 Unauthorized          | Token mismatch                                           | Re-fetch the token from Kubernetes secrets                          |
| Only seeing default agent | API can't reach workspace service                        | Verify `OPENCLAW_WORKSPACE_URL` and that the port-forward is active |

## Tips

- Use a terminal multiplexer (tmux, iTerm2 split panes) to keep port-forwards visible
- Port-forwards drop when the pod restarts — check if the pod restarted if you see sudden 503 errors
- The workspace service and gateway are separate services — you can run just one if you only need
  workspace or gateway features
