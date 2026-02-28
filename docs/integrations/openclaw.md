# OpenClaw integration

OpenClaw is the source-of-truth runtime and workspace system behind MosBot OS.

The dashboard does not typically talk to OpenClaw directly; it goes via MosBot API.

## Health / status semantics

The dashboard surfaces a lightweight “is OpenClaw reachable?” signal for operators.

Typical implementation pattern:

- Dashboard calls MosBot API “workspace status” endpoint
- MosBot API proxies the OpenClaw workspace service status
- Dashboard maps response to a simple `isConnected` boolean (and optional richer states like “working”)

The product intent is:

- **Graceful degradation**: if OpenClaw is offline, the dashboard should still render and clearly show offline state
- **Low overhead**: status checks should be cheap and periodic
