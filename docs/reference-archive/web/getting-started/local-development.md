# Local development

## Prerequisites

- Node.js **20.x**
- npm
- A running MosBot API instance (local or remote)

## Install

```bash
npm install
```

## Configure

Create a local env file:

```bash
cp .env.example .env
```

Then set at least:

- `VITE_API_URL` (example: `http://localhost:3000/api/v1`)

See `getting-started/configuration.md` for details.

## Run (dev)

```bash
npm run dev
```

Vite will print the local URL (commonly `http://localhost:5173`).

## Build / preview

```bash
npm run build
npm run preview
```
