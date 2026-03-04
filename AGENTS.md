# AGENTS.md — working in this repository

This file is the **universal entrypoint for AI agents** operating in this repo.

## What this repo is

**MosBot Docs** is the official documentation site for
[MosBot OS](https://github.com/bymosbot/mosbot-api) — a self-hosted operating system for AI agent
work. It is a Docusaurus v3 static site hosted on GitHub Pages that covers setup, configuration,
features, deployment, and security for the full MosBot OS system.

## Tech stack

- **Docusaurus v3.9.2** — static site framework (React-based)
- **Markdown** — all docs are `.md` with YAML frontmatter (no MDX components)
- **Prettier** — formatting (single quotes, 2-space indent, `proseWrap: always`)
- **ESLint** — lints JS config files only
- **Gitleaks** — secret scanning in pre-commit hook and CI

## Common commands

```bash
npm start            # dev server (http://localhost:3001)
npm run build        # production build (output: build/)
npm run serve        # serve production build locally
npm run clear        # clear Docusaurus cache
npm run lint:check   # ESLint strict (CI mode, max-warnings 0)
npm run format:check # Prettier check (CI mode)
npm run lint         # ESLint with auto-fix
npm run format       # Prettier with auto-fix
```

## Repo shape

```text
docs/                    — all documentation source (.md files)
  index.md               — homepage
  getting-started/       — prerequisites, quickstart, configuration, first-login
  openclaw/              — OpenClaw integration guides
  configuration/         — openclaw.json reference and best practices
  skills/                — creating and managing agent skills
  features/              — dashboard feature guides (agent monitor, tasks, agents page…)
  deployment/            — Docker, Kubernetes, production
  security/              — authentication, roles, secrets
  troubleshooting/       — common issues, FAQ
src/css/custom.css       — Docusaurus theme customizations
static/img/              — logo, favicon, UI screenshots
docusaurus.config.js     — site config (title, theme, plugins, navbar, footer)
sidebars.js              — sidebar navigation structure
```

## Where to read first

- **Contributing guide**: `CONTRIBUTING.md`
- **Writing conventions**: `.claude/rules/writing.md`
- **Security rules**: `.claude/rules/security.md`
- **Docusaurus config conventions**: `.claude/rules/config.md`
- **Claude Code rules**: `.claude/CLAUDE.md`

## Key principles

1. **Never include real secrets** — all examples use placeholder values (`your-token-here`,
   `example.com`).
2. **Every new page must be added to `sidebars.js`** — it will not appear in navigation otherwise.
3. **`npm run build` must pass** — broken internal links fail the build; run it before opening a PR.
4. **Branch model**: `feature/*` for new content, `fix/*` for corrections. Never commit directly to
   `main`.
5. **Commit format**: Conventional Commits — `docs:`, `fix:`, `feat:`, `chore:`.
6. **No MDX** — docs are plain Markdown only; React components are not used inside doc pages.

## Writing conventions

- Write for **end users**, not developers — assume a first-time setup perspective.
- Use **second person** ("you") and **active voice**.
- Use Docusaurus admonitions (`:::tip`, `:::info`, `:::warning`, `:::caution`) for callouts.
- Always specify a language on code blocks: ` ```bash `, ` ```yaml `, ` ```json `.
- Every page requires frontmatter: `id`, `title`, `sidebar_position`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
