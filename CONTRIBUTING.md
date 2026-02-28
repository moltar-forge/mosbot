# Contributing to MosBot Dashboard

Thank you for your interest in contributing! This document covers how to get started, the branch model, and what we expect in pull requests.

## Development setup

For the full stack (recommended):

```bash
git clone https://github.com/bymosbot/mosbot-api.git
git clone https://github.com/bymosbot/mosbot-dashboard.git
cd mosbot-api
cp .env.example .env   # edit required values
make up
```

Dashboard-only dev server:

```bash
cd mosbot-dashboard
npm install
cp .env.example .env   # set VITE_API_URL to your running API
npm run dev
```

## Branch model (trunk-based)

| Branch | Purpose |
| ------ | ------- |
| `main` | Production-ready code. Protected. |
| `feature/*` | New features |
| `fix/*` | Bug fixes |

**Never commit directly to `main`.** All changes go through a pull request.

## Workflow

```bash
git checkout main && git pull
git checkout -b feature/your-feature

# Make changes, then verify
npm run lint
npm run test:run

git push -u origin feature/your-feature
# Open a PR to main
```

## Pull request checklist

- [ ] Tests pass (`npm run test:run`)
- [ ] Linter passes (`npm run lint`)
- [ ] No secrets or credentials committed
- [ ] New env vars added to `.env.example`
- [ ] Relevant docs updated

## Commit message format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add session detail panel
fix: prevent double-submission on task save
docs: update configuration reference
refactor: extract toast store
test: add tests for kanban drag-and-drop
```

## Code style

- Functional React components with hooks only (no class components)
- Tailwind utility classes for styling
- Zustand for state management
- Single quotes for strings
- 2-space indentation

Run `npm run lint` before pushing. The CI will reject PRs with lint errors.

## Security

- Never commit `.env` files or any secrets
- `VITE_*` variables are embedded in the built bundle — never put secrets in them
- See [docs/security/secrets.md](docs/security/secrets.md)

To report a security vulnerability privately, see [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
