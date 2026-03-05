---
id: common-issues
title: Common Issues
sidebar_label: Common Issues
sidebar_position: 1
---

# Common Issues

## API startup failures

### "JWT_SECRET environment variable is not set"

**Cause**: `JWT_SECRET` is missing from `.env`.

**Fix**: Generate and set `JWT_SECRET`:

```bash
# Generate a secure secret
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Add to .env
JWT_SECRET=your-generated-secret
```

---

### "CORS_ORIGIN cannot be '\*'"

**Cause**: `CORS_ORIGIN` is set to `*` or not set.

**Fix**: Set `CORS_ORIGIN` to the exact dashboard URL:

```bash
CORS_ORIGIN=http://localhost:5173
# or for production:
CORS_ORIGIN=https://your-dashboard.example.com
```

---

### API fails to connect to database

**Cause**: Database is not running or connection settings are wrong.

**Fix**:

1. Check the database is running: `docker compose ps`
2. Verify `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `.env`
3. Check API logs: `docker compose logs api`

---

## Dashboard issues

### "Failed to connect to API"

**Cause**: The dashboard can't reach the API.

**Fix**:

1. Verify the API is running: `curl http://localhost:3000/health`
2. Check `VITE_API_URL` in `mosbot-dashboard/.env` matches the running API URL
3. Check for CORS errors in the browser console

---

### Dashboard shows blank page

**Cause**: Build error or missing environment variable.

**Fix**:

1. Check browser console for errors
2. Verify `VITE_API_URL` is set in `mosbot-dashboard/.env`
3. Restart the dashboard: `docker compose restart dashboard`

---

### Login fails with "Invalid credentials"

**Cause**: Wrong email/password, or the bootstrap account wasn't created.

**Fix**:

1. Verify `BOOTSTRAP_OWNER_EMAIL` and `BOOTSTRAP_OWNER_PASSWORD` are set in `.env`
2. Check API logs for bootstrap account creation: `docker compose logs api | grep bootstrap`
3. If the bootstrap account was never created, set the variables and restart:
   `docker compose restart api`

---

## No owner account created

**Cause**: `BOOTSTRAP_OWNER_EMAIL` or `BOOTSTRAP_OWNER_PASSWORD` was not set before the first
startup.

**Fix**:

1. Set both variables in `.env`
2. Restart the API: `docker compose restart api`
3. Check logs to confirm the account was created: `docker compose logs api | grep bootstrap`

---

## OpenClaw integration issues

See [OpenClaw Troubleshooting](../openclaw/troubleshooting) for a full list of OpenClaw-specific
issues.

### Dashboard shows "OpenClaw not configured"

**Fix**: Add `OPENCLAW_WORKSPACE_URL` and/or `OPENCLAW_GATEWAY_URL` to `.env` and restart the API.

### 503 on OpenClaw endpoints

**Fix**: Check that the OpenClaw services are running and accessible. Verify the URLs in `.env`.

---

## Database issues

### Migrations fail on startup

**Cause**: Database schema is out of sync or migration file is corrupted.

**Fix**:

1. Check API logs: `docker compose logs api | grep migration`
2. Run migrations manually: `docker compose exec api npm run migrate`
3. If the database is corrupted (dev only): `make db-reset` (destructive)

---

### "relation does not exist" errors

**Cause**: Migrations haven't run yet.

**Fix**: Restart the API — migrations run automatically on startup. Or run manually:
`docker compose exec api npm run migrate`

---

## Performance issues

### API is slow to respond

**Cause**: Database queries are slow, or the API is under heavy load.

**Fix**:

1. Check database connection count
2. Review `ARCHIVE_AFTER_DAYS` — archiving old tasks reduces table size
3. Check if the archiver is running: `docker compose logs api | grep archiver`

---

## Getting help

If you can't resolve an issue:

1. Check the [FAQ](./faq)
2. Review API logs: `docker compose logs api --tail=100`
3. Check the [GitHub issues](https://github.com/bymosbot/mosbot-api/issues) for known problems
