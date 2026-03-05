---
id: secrets
title: Secrets Management
sidebar_label: Secrets
sidebar_position: 3
---

# Secrets Management

MosBot OS handles several types of secrets. This guide covers how to manage them safely.

## MosBot API secrets

### Environment variables

All MosBot API secrets are provided via environment variables in `.env`. Never commit `.env` to
version control.

The `.gitignore` in `mosbot-api` excludes `.env` by default. Verify this is the case before
committing.

### Critical secrets

| Secret                     | How to generate                                                            | Notes                                                              |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `JWT_SECRET`               | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` | Must be ≥ 48 chars. Changing this invalidates all active sessions. |
| `DB_PASSWORD`              | Use a password manager                                                     | Strong, unique password                                            |
| `BOOTSTRAP_OWNER_PASSWORD` | Choose a strong password                                                   | Remove from `.env` after first login                               |

### What to do if a secret is accidentally committed

1. **Immediately rotate the secret** — generate a new value and update it everywhere
2. **Revoke the old secret** — for API keys, revoke via the provider's dashboard
3. **Remove from git history** — use `git filter-branch` or BFG Repo Cleaner
4. **Audit access logs** — check if the secret was used by anyone else

## openclaw.json secrets

### Never put secrets directly in openclaw.json

Use environment variable references:

```json
{
  "env": {
    "TELEGRAM_BOT_TOKEN": "${TELEGRAM_BOT_TOKEN}",
    "BRAVE_API_KEY": "${BRAVE_API_KEY}"
  }
}
```

The `${VAR_NAME}` syntax tells OpenClaw to read the value from the container's environment at
runtime.

### The `__OPENCLAW_REDACTED__` placeholder

When OpenClaw reads a config that contains sensitive values, it may replace them with
`__OPENCLAW_REDACTED__` in API responses and logs. This is expected — the actual value is still used
at runtime.

If you see `__OPENCLAW_REDACTED__` in the config editor in the dashboard, this is normal. Don't
replace it with the actual value.

## Kubernetes secrets

In Kubernetes, store all secrets in `Secret` resources:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mosbot-secrets
  namespace: mosbot
type: Opaque
stringData:
  JWT_SECRET: 'your-jwt-secret'
  DB_PASSWORD: 'your-db-password'
  CORS_ORIGIN: 'https://your-dashboard.example.com'
```

Reference secrets in deployments:

```yaml
env:
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: mosbot-secrets
        key: JWT_SECRET
```

Never put secret values directly in deployment YAML files that are committed to version control.

## Dashboard environment variables

`VITE_*` environment variables in the dashboard are **embedded into the built JavaScript bundle**
and are therefore public. Never put secrets in dashboard environment variables.

The only dashboard environment variable is `VITE_API_URL` — the URL of the MosBot API. This is not a
secret.

## OpenClaw workspace tokens

The workspace service and gateway use bearer tokens for authentication. These tokens should be:

- Generated with `openssl rand -base64 32`
- Stored in Kubernetes secrets (not in `openclaw.json`)
- Rotated periodically

See [Workspace Service](../openclaw/workspace-service) and [Gateway](../openclaw/gateway) for
configuration details.
