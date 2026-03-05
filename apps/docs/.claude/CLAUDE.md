# MosBot Docs

Official documentation site for MosBot OS — a self-hosted operating system for AI agent work.
Docusaurus v3 static site hosted on GitHub Pages at https://bymosbot.github.io/mosbot-docs/.

## Tech stack

- **Docusaurus v3.9.2** — static site framework (React-based)
- **Markdown** — all docs are `.md` with YAML frontmatter (no MDX components)
- **Prettier** — formatting (single quotes, 2-space indent, proseWrap: always)
- **ESLint** — lints JS config files
- **Gitleaks** — secret scanning in pre-commit hook and CI

## Commands

```bash
npm start            # dev server (http://localhost:3001)
npm run build        # production build (output: build/)
npm run serve        # serve production build locally
npm run clear        # clear Docusaurus cache

npm run lint         # ESLint (auto-fix)
npm run lint:check   # ESLint strict (max-warnings 0, used in CI)
npm run format       # Prettier (auto-fix)
npm run format:check # Prettier check (used in CI)
```

## Repo shape

```
docs/                    — all documentation source (46 .md files)
  index.md               — homepage
  getting-started/       — prerequisites, quickstart, configuration, first-login
  openclaw/              — OpenClaw integration guides
  configuration/         — openclaw.json reference and best practices
  skills/                — creating and managing agent skills
  features/              — dashboard feature guides
  deployment/            — Docker, Kubernetes, production
  security/              — authentication, roles, secrets
  troubleshooting/       — common issues, FAQ
src/
  css/custom.css         — Docusaurus theme customizations
static/img/              — logo, favicon, screenshots
docusaurus.config.js     — site configuration (title, theme, plugins, navbar, footer)
sidebars.js              — sidebar navigation structure
```

## Non-negotiables

1. Never include real API keys, tokens, passwords, or connection strings in any doc.
2. All examples must use placeholder values (`your-token-here`, `example.com`, `<your-api-key>`).
3. New pages must be added to `sidebars.js` — they will not appear in navigation otherwise.
4. `npm run build` must pass before merging — broken internal links fail the build.
5. Branch model: `feature/*` for new content, `fix/*` for corrections. Never commit directly to
   `main`.
6. Commit format: Conventional Commits (`docs:`, `fix:`, `feat:`, `chore:`).

## Docs

- Contributing guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Changelog: `CHANGELOG.md`
