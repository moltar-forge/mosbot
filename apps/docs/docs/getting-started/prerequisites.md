---
id: prerequisites
title: Prerequisites
sidebar_label: Prerequisites
sidebar_position: 2
---

# Prerequisites

Before setting up MosBot OS, make sure you have the following installed and available.

## Required

### Docker and Docker Compose v2

The recommended way to run MosBot OS is via Docker Compose. You need:

- **Docker Desktop** (macOS/Windows) or **Docker Engine** (Linux) — version 24+
- **Docker Compose v2** — included with Docker Desktop; on Linux install the `docker-compose-plugin`

Verify your installation:

```bash
docker --version
# Docker version 24.x.x

docker compose version
# Docker Compose version v2.x.x
```

[Install Docker →](https://docs.docker.com/get-docker/)

### Git

To clone the repositories:

```bash
git --version
# git version 2.x.x
```

[Install Git →](https://git-scm.com/downloads)

## For local development (without Docker)

If you want to run MosBot API or Dashboard outside of Docker:

### Node.js 20+

```bash
node --version
# v20.x.x or higher
```

[Install Node.js →](https://nodejs.org/)

## OpenClaw (strongly recommended)

MosBot OS is designed to work with OpenClaw. While MosBot can technically run without it, the core
features — agent monitoring, workspace browsing, agents page, and skills — require OpenClaw.

### OpenClaw instance

You need a running OpenClaw instance. OpenClaw can run:

- **Locally** — directly on your machine or in Docker
- **In Kubernetes** — deployed to a cluster
- **On a VPS** — on a remote server

See the [OpenClaw Integration](../openclaw/overview) section for setup guidance.

### kubectl (Kubernetes deployments only)

Required if OpenClaw runs in a Kubernetes cluster and you need to port-forward services for local
development.

```bash
kubectl version --client
```

[Install kubectl →](https://kubernetes.io/docs/tasks/tools/)

## System requirements

| Component | Minimum                      | Recommended    |
| --------- | ---------------------------- | -------------- |
| RAM       | 2 GB                         | 4 GB+          |
| Disk      | 5 GB free                    | 20 GB+         |
| OS        | Linux, macOS, Windows (WSL2) | Linux or macOS |

## Next steps

Once you have the prerequisites, proceed to the [Quickstart](./quickstart) guide.
