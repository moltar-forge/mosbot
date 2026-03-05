---
id: production
title: Production Checklist
sidebar_label: Production Checklist
sidebar_position: 3
---

# Production Checklist

Before exposing MosBot OS to the internet or using it with real data, complete this checklist.

## Security

- [ ] **`JWT_SECRET`** is a long random string (≥ 48 hex chars)

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

- [ ] **`DB_PASSWORD`** is strong and unique (not the default)

- [ ] **`CORS_ORIGIN`** is set to the exact dashboard URL — not `*`

  ```bash
  CORS_ORIGIN=https://your-dashboard.example.com
  ```

- [ ] **`NODE_ENV=production`** is set

- [ ] **`BOOTSTRAP_OWNER_PASSWORD`** has been removed from `.env` after first login

- [ ] Running behind a **reverse proxy with TLS** (nginx, Caddy, Cloudflare, etc.)

- [ ] The database is **not publicly accessible** — only accessible from the API

- [ ] OpenClaw services are **not publicly accessible** — only accessible from MosBot API

## Authentication

- [ ] Default owner password has been changed

- [ ] Only necessary users have been created

- [ ] Agent accounts use the `agent` role (not `owner` or `admin`)

## Backups

- [ ] **Database backups** are configured and tested

  ```bash
  # Manual backup
  docker compose exec db pg_dump -U mosbot mosbot > backup-$(date +%Y%m%d).sql
  ```

- [ ] Backup restoration has been tested

- [ ] OpenClaw workspace files are backed up (if using persistent storage)

## Monitoring

- [ ] Health check endpoint is monitored: `GET /health`

- [ ] Container logs are collected (e.g. via a log aggregator)

- [ ] Alerts are configured for API downtime

## Performance

- [ ] `ARCHIVE_AFTER_DAYS` is set appropriately (default: 7 days)

- [ ] `ACTIVITY_LOG_RETENTION_DAYS` is set appropriately (default: 7 days)

- [ ] `SUBAGENT_RETENTION_DAYS` is set appropriately (default: 30 days)

## OpenClaw (if using)

- [ ] Workspace service is ClusterIP only (no public ingress)

- [ ] Gateway is ClusterIP only (no public ingress) or protected behind auth

- [ ] TLS is enabled on the gateway

- [ ] Workspace and gateway tokens are strong and stored in secrets (not in `openclaw.json`)

- [ ] `openclaw.json` does not contain any plaintext secrets (use `${ENV_VAR}` references)

## Dashboard

- [ ] `VITE_API_URL` points to the correct API URL

- [ ] Dashboard is served over HTTPS

- [ ] No secrets are in dashboard environment variables (`VITE_*` vars are public)

## Final verification

```bash
# API health check
curl https://api-mosbot.example.com/health
# → {"status":"ok","timestamp":"..."}

# Login test
curl -X POST https://api-mosbot.example.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}'
# → {"token":"...","user":{...}}
```
