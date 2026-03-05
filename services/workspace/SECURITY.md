# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Threat Model

`mosbot-workspace-service` is a **sidecar service** that exposes workspace files over HTTP. It is designed to run inside a private Kubernetes pod network or Docker Compose network, **not** on the public internet.

Key risks to be aware of:

- **File write/delete access**: The `POST /files`, `PUT /files`, and `DELETE /files` endpoints can modify or remove files on the mounted workspace volume. Always use a strong `WORKSPACE_SERVICE_TOKEN` and restrict network access.
- **Path traversal**: Built-in path traversal protection rejects requests that escape `CONFIG_ROOT` or `CONFIG_ROOT/<MAIN_WORKSPACE_DIR>`. Do not disable or weaken this check.
- **Symlink following**: The service follows symlinks to support cross-container paths. Ensure the workspace volume only contains trusted content.
- **Token exposure**: Never log or expose `WORKSPACE_SERVICE_TOKEN` in application logs, metrics, or error responses.

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public GitHub issue**.

Please report it privately via one of these channels:

1. **GitHub Security Advisories** (preferred): [https://github.com/bymosbot/mosbot-workspace-service/security/advisories/new](https://github.com/bymosbot/mosbot-workspace-service/security/advisories/new)
2. **Email**: <security@mosbot.dev>

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations

We aim to acknowledge reports within **48 hours** and provide a resolution timeline within **7 days**.

## Security Best Practices

- Always set `WORKSPACE_SERVICE_TOKEN` to a strong random value (e.g. `openssl rand -hex 32`)
- Mount workspace volumes as read-only (`:ro`) when write access is not required
- Never expose port 18780 directly to the public internet — use a VPN, internal network, or Kubernetes `ClusterIP` service
- Run the container as a non-root user (the default `node` user is used in the official Docker image)
- Keep the image up to date to receive security patches
