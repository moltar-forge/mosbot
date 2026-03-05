---
id: gateway
title: Gateway
sidebar_label: Gateway
sidebar_position: 5
---

# OpenClaw Gateway

The OpenClaw gateway is the runtime control service. It provides HTTP and WebSocket endpoints for
querying live agent sessions, retrieving usage data, and invoking tools. MosBot API connects to the
gateway to power the Agent Monitor and standup features.

## What the gateway enables in MosBot

- **Agent Monitor**: live session status, costs, and token usage per agent
- **Session history**: view conversation history and session details
- **Standups**: AI-generated daily summaries of agent activity
- **Real-time status**: whether agents are active, idle, or offline

## Gateway configuration in `openclaw.json`

The gateway is configured under the `gateway` section of `openclaw.json`:

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      "allowedOrigins": ["http://localhost:18789", "https://your-domain.example.com"],
      "allowInsecureAuth": true
    },
    "auth": {
      "mode": "token"
    },
    "tls": {
      "enabled": true,
      "autoGenerate": true
    }
  }
}
```

### Key settings

| Setting                    | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `port`                     | Port the gateway listens on (default: `18789`) |
| `mode`                     | `local` for local/LAN use                      |
| `bind`                     | `lan` to bind to all LAN interfaces            |
| `auth.mode`                | `token` for bearer token authentication        |
| `tls.enabled`              | Enable TLS (recommended)                       |
| `tls.autoGenerate`         | Auto-generate a self-signed certificate        |
| `controlUi.allowedOrigins` | Allowed CORS origins for the gateway UI        |

## Connecting MosBot API to the gateway

Add these variables to `mosbot-api/.env`:

```bash
OPENCLAW_GATEWAY_URL=http://localhost:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
OPENCLAW_GATEWAY_TIMEOUT_MS=15000
```

:::note TLS and self-signed certificates If the gateway uses TLS with a self-signed certificate, you
may need to configure Node.js to accept it. In development, you can set
`NODE_TLS_REJECT_UNAUTHORIZED=0` in your `.env` (never in production). For production, use a
properly signed certificate or a reverse proxy that handles TLS termination. :::

## Device authentication (optional)

For full session access with `operator.read` and `operator.write` scopes, MosBot API can
authenticate as a paired device. This is required for some advanced session operations.

Device credentials are generated through the OpenClaw device pairing flow and configured in `.env`:

```bash
OPENCLAW_DEVICE_ID=your-device-id
OPENCLAW_DEVICE_PUBLIC_KEY=your-ed25519-public-key-base64url
OPENCLAW_DEVICE_PRIVATE_KEY=your-ed25519-private-key-base64url
OPENCLAW_DEVICE_TOKEN=your-device-token
```

Refer to OpenClaw's documentation for the device pairing procedure.

## Verifying gateway connectivity

```bash
# Basic health check
curl http://localhost:18789/health

# Via MosBot API (requires MosBot JWT)
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}' \
  | jq -r '.token')

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/openclaw/sessions
```

## Troubleshooting

**Agent Monitor shows no data** The gateway is not connected. Check:

- `OPENCLAW_GATEWAY_URL` is set and correct
- The gateway is running and accessible
- `OPENCLAW_GATEWAY_TOKEN` is correct

**Connection timeout** The gateway is unreachable or slow. Increase `OPENCLAW_GATEWAY_TIMEOUT_MS` or
check network connectivity.

**TLS errors** If using TLS with a self-signed cert in development, set
`NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env`. For production, use a properly signed certificate.
