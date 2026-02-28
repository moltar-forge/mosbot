# Cloudflare Access runbook (MosBot)

This document describes the Cloudflare Access configuration commonly used for MosBot:

- **Dashboard** (frontend)
- **API** (backend)

## Goal

Make cross-origin dashboard → API requests work **with cookies**, while keeping authentication and CSRF protections sane.

## Cloudflare Access application settings

Apply these cookie settings to **both** the dashboard and API Access applications:

- **Cookie domain**: use a shared parent domain (example: `.example.com`)
- **SameSite**: `Lax` (recommended when both live under the same parent domain)
- **HTTPOnly**: enabled
- **Secure**: enabled
- **Binding cookie**: enabled (if you use it)

## CORS (API Access app)

Configure CORS on the **API** side to allow the dashboard origin:

- **Allowed origins**: `https://<dashboard-domain>`
- **Allowed methods**: `GET, POST, PUT, DELETE, PATCH, OPTIONS` (as needed)
- **Allowed headers**: include the headers your client sends (commonly `Content-Type`, `Authorization`, etc.)
- **Allow credentials**: `true`

## Dashboard requirements

The dashboard API client must send requests with credentials (cookies).

## API requirements

MosBot API must be configured to:

- Allow credentials
- Set a specific allowed origin (do not use `*` with credentials)

## Troubleshooting checklist

- **CORS errors**: verify Access CORS settings + API CORS middleware
- **Cookie not sent**: verify cookie domain + SameSite + credentials enabled
- **Unexpected redirects**: confirm both apps share compatible Access policy/groups
