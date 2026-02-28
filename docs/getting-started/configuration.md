# Configuration

This dashboard is a static React app (Vite). Runtime configuration is provided via Vite environment variables.

## Environment variables

### `VITE_API_URL`

Base URL of MosBot API (including API version prefix).

Examples:

- `http://localhost:3000/api/v1`
- `https://api-mosbot.example.com/api/v1`

### `VITE_API_TIMEOUT` (optional)

Request timeout (ms).

### Notes on authentication

In production, MosBot often runs behind Cloudflare Access. In that setup:

- The dashboard should send requests **with credentials** (cookies).
- MosBot API must allow **credentials + explicit origin** via CORS.

See `operations/cloudflare-access.md`.
