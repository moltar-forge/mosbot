# MosBot API integration

The dashboard is a UI layer. It talks to **MosBot API**, which in turn integrates with OpenClaw services/workspaces.

## Responsibilities split

- **Dashboard**: UX, visualization, optimistic interaction where safe
- **MosBot API**: authentication + authorization, normalization, proxying OpenClaw, enforcing invariants
- **OpenClaw**: source of truth for agent/workspace configuration and runtime

## Configuration

The dashboard uses `VITE_API_URL` as the API base URL. See `getting-started/configuration.md`.

## CORS and credentials

In typical production setups (e.g. Cloudflare Access):

- The browser must be allowed to send cookies: `withCredentials: true`
- MosBot API must allow credentials and set an explicit allowed origin (not `*`)

See `operations/cloudflare-access.md`.
