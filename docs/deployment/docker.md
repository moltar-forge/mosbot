---
id: docker
title: Docker Deployment
sidebar_label: Docker
sidebar_position: 1
---

The recommended way to run MosBot OS is via Docker Compose. This guide covers both development and
production Docker deployments.

## Development (recommended for getting started)

The development setup uses a Vite dev server for the dashboard with hot-reload. File changes in
`mosbot-dashboard/` are reflected instantly in the browser.

**Primary method (recommended):**

```bash
cd mosbot-api
make up
```

This is the recommended way to start the full stack for local development.

**Alternative:**

If you prefer using Docker Compose directly:

```bash
cd mosbot-api
docker compose up -d
```

Services started:

| Service    | URL                                            | Description                  |
| ---------- | ---------------------------------------------- | ---------------------------- |
| API        | [http://localhost:3000](http://localhost:3000) | MosBot API                   |
| Dashboard  | [http://localhost:5173](http://localhost:5173) | Vite dev server (hot-reload) |
| PostgreSQL | localhost:5432                                 | Database                     |

## Production

The production setup builds the dashboard as an optimized nginx bundle.

**Primary method:**

```bash
cd mosbot-api
make up-prod
```

**Alternative:**

```bash
cd mosbot-api
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

This builds the dashboard image before starting. The dashboard is served by nginx instead of the
Vite dev server.

## Pre-built images

Pre-built images are available on GitHub Container Registry:

```bash
# Pull the latest API image
docker pull ghcr.io/bymosbot/mosbot-api:latest

# Run with environment file
docker run -p 3000:3000 --env-file .env ghcr.io/bymosbot/mosbot-api:latest
```

Available tags:

| Tag           | Description              |
| ------------- | ------------------------ |
| `latest`      | Latest build from `main` |
| `main`        | Latest build from `main` |
| `sha-<short>` | Specific commit          |
| `v1.2.3`      | Specific release         |

## Docker Compose commands

**Primary method (run from `mosbot-api/` directory):**

```bash
make up          # start full stack (dev mode)
make up-prod     # start full stack (production build)
make down        # stop all containers
make logs        # view logs
make migrate     # run database migrations
make db-reset    # reset database (dev only — destructive)
```

**Alternative (using docker compose directly):**

```bash
cd mosbot-api
docker compose up -d           # start
docker compose down            # stop
docker compose logs -f api     # follow API logs
docker compose ps              # check status
docker compose restart api     # restart API only
```

## Environment configuration

All configuration is via `.env` in the `mosbot-api` directory. See
[Configuration Reference](../getting-started/configuration) for all available variables.

Minimum required for production:

```bash
DB_PASSWORD=strong-password
JWT_SECRET=long-random-string
CORS_ORIGIN=https://your-dashboard-url.example.com
NODE_ENV=production
```

## Database persistence

The PostgreSQL database is stored in a Docker volume named `mosbot_postgres_data`. This persists
across container restarts.

To back up the database:

```bash
docker compose exec db pg_dump -U mosbot mosbot > backup.sql
```

To restore:

```bash
docker compose exec -T db psql -U mosbot mosbot < backup.sql
```

## Updating

To update to the latest version:

```bash
docker compose pull
docker compose up -d
```

Migrations run automatically on API startup.
