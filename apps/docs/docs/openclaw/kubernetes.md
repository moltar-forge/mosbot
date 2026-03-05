---
id: kubernetes
title: OpenClaw on Kubernetes
sidebar_label: Kubernetes
sidebar_position: 7
---

# OpenClaw on Kubernetes

This guide covers deploying OpenClaw in Kubernetes and connecting it to MosBot OS.

## OpenClaw pod architecture

In Kubernetes, OpenClaw typically runs as a pod with two containers:

1. **OpenClaw main container** — the agent runtime
2. **Workspace service sidecar** — HTTP service exposing the workspace PVC

Both containers share the same workspace PVC, giving the workspace service direct filesystem access.

```
┌─────────────────────────────────────┐
│           OpenClaw Pod              │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │  OpenClaw   │  │  Workspace   │  │
│  │   Runtime   │  │   Service    │  │
│  │             │  │  (port 18780) │  │
│  └──────┬──────┘  └──────┬───────┘  │
│         │                │          │
│         └────────┬───────┘          │
│                  │                  │
│         ┌────────▼───────┐          │
│         │  Workspace PVC │          │
│         └────────────────┘          │
└─────────────────────────────────────┘
```

## Services

OpenClaw exposes two Kubernetes services:

| Service              | Port  | Type      | Purpose                   |
| -------------------- | ----- | --------- | ------------------------- |
| `openclaw-workspace` | 18780 | ClusterIP | Workspace file access     |
| `openclaw`           | 18789 | ClusterIP | Gateway (runtime control) |

Both services should be **ClusterIP** (not LoadBalancer or NodePort) — they should not be publicly
accessible.

## Connecting MosBot API (in-cluster)

If MosBot API runs in the same cluster as OpenClaw, use the Kubernetes service DNS names:

```bash
# mosbot-api secret / configmap
OPENCLAW_WORKSPACE_URL=http://openclaw-workspace.<namespace>.svc.cluster.local:18780
OPENCLAW_WORKSPACE_TOKEN=<workspace-token>
OPENCLAW_GATEWAY_URL=http://openclaw.<namespace>.svc.cluster.local:18789
OPENCLAW_GATEWAY_TOKEN=<gateway-token>
```

Replace `<namespace>` with the namespace where OpenClaw is deployed (e.g. `openclaw-personal`).

## Connecting MosBot API (external / different cluster)

If MosBot API runs outside the cluster, you have two options:

### Option A: Port-forward (development only)

```bash
kubectl port-forward -n <namespace> svc/openclaw-workspace 18780:18780
kubectl port-forward -n <namespace> svc/openclaw 18789:18789
```

Then use `localhost` (or `host.docker.internal` if MosBot runs in Docker). See
[Local Development](./local-development).

### Option B: Ingress / LoadBalancer (production)

Expose the services via an ingress controller or LoadBalancer, with TLS and authentication. This is
only recommended if MosBot API cannot run in the same cluster.

## Secrets management

Store OpenClaw tokens as Kubernetes secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: openclaw-secrets
  namespace: openclaw-personal
type: Opaque
stringData:
  WORKSPACE_SERVICE_TOKEN: 'your-workspace-token'
  OPENCLAW_GATEWAY_TOKEN: 'your-gateway-token'
```

Reference these secrets in your MosBot API deployment:

```yaml
env:
  - name: OPENCLAW_WORKSPACE_TOKEN
    valueFrom:
      secretKeyRef:
        name: openclaw-secrets
        key: WORKSPACE_SERVICE_TOKEN
  - name: OPENCLAW_GATEWAY_TOKEN
    valueFrom:
      secretKeyRef:
        name: openclaw-secrets
        key: OPENCLAW_GATEWAY_TOKEN
```

## MosBot API Kubernetes manifests

The `mosbot-api` repository includes Kubernetes manifests under `k8s/` (Kustomize layout):

```
k8s/
├── base/
│   ├── kustomization.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── secret.template.yaml  ← copy to secret.yaml, fill in values
│   └── ...
└── overlays/
    └── production/
```

### Deploy

```bash
# Copy and fill in the secret template
cp k8s/base/secret.template.yaml k8s/base/secret.yaml
# Edit secret.yaml with your values

# Apply
kubectl apply -k k8s/base
```

## Verifying the deployment

```bash
# Check pods are running
kubectl get pods -n <mosbot-namespace>

# Check API health
kubectl port-forward -n <mosbot-namespace> svc/mosbot-api 3000:3000
curl http://localhost:3000/health

# Check OpenClaw connectivity
curl -H "Authorization: Bearer <mosbot-jwt>" \
  http://localhost:3000/api/v1/openclaw/agents
```

## Resource recommendations

Follow the [burstable resource strategy](https://homelab-gitops.example.com) for container
resources:

```yaml
resources:
  requests:
    cpu: '25m'
    memory: '64Mi'
  limits:
    cpu: '500m'
    memory: '512Mi'
```
