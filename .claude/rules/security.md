# Security & Secrets

No paths frontmatter — these rules apply globally at all times.

## Do

- Load all config via `import.meta.env` (Vite) — `VITE_*` prefix for all env vars.
- Commit `.env.example` with placeholder values only (e.g. `VITE_API_URL=http://localhost:3000`).
- Validate and normalize all file paths before using — block `..` sequences.

## Don't

- Don't put secrets in `VITE_*` env vars — they are bundled into the client and publicly visible.
- Don't commit `.env`, `.env.local`, or any file containing real values.
- Don't log tokens, passwords, or PII in the browser console.
- Don't expose auth tokens in URLs or query parameters.
- Don't hardcode API URLs or credentials in source — always read from `import.meta.env`.

## .env files

| File | Committed? | Purpose |
| ---- | ---------- | ------- |
| `.env.example` | Yes | Placeholder template for contributors |
| `.env` | No | Local values (git-ignored) |
| `.env.local` | No | Local overrides (git-ignored) |

## Dependencies

- Run `npm audit` before opening a PR that adds or upgrades dependencies.
- Do not add dependencies with known high/critical CVEs without documented justification.