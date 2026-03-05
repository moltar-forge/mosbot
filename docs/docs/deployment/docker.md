---
id: docker
title: Docker Deployment
sidebar_label: Docker
sidebar_position: 1
---

The canonical Docker entrypoint is the repo root `docker-compose.yml`.

## Development

```bash
npm install
npm run compose:up
```

Development uses:

- API in nodemon mode (`api`)
- Web in Vite dev mode (`web`)
- Workspace sidecar (`workspace-server`)
- PostgreSQL (`postgres`)

## Production-oriented image builds

Build package images directly:

```bash
docker build -t mosbot-api:local ./api
docker build -t mosbot-web:local ./web
docker build -t mosbot-workspace-server:local ./workspace-server
```

## Common commands

```bash
npm run compose:up       # start stack
npm run compose:down     # stop stack
npm run -w ./api migrate # run db migrations
```

## Environment configuration

Set runtime values in root `.env` (consumed by `docker-compose.yml`).

Minimum required values:

```bash
DB_PASSWORD=strong-password
JWT_SECRET=long-random-string
CORS_ORIGIN=https://your-dashboard-url.example.com
NODE_ENV=production
```
