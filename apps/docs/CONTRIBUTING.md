# Contributing to MosBot Docs

Thank you for your interest in contributing! This repository contains the official documentation for
[MosBot OS](https://github.com/bymosbot/mosbot-api).

## Development setup

```bash
git clone https://github.com/bymosbot/mosbot-docs.git
cd mosbot-docs
npm install
npm start
```

The docs site will be available at **<http://localhost:3000/mosbot-docs/>**.

## Branch model (trunk-based)

We use **trunk-based development** with short-lived feature branches:

| Branch      | Purpose                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `main`      | Published docs. Protected. Auto-deploys to GitHub Pages.                |
| `feature/*` | New documentation pages or sections (e.g. `feature/add-scheduler-docs`) |
| `fix/*`     | Corrections and fixes (e.g. `fix/broken-links`)                         |

**Never commit directly to `main`.** All changes go through a pull request.

## Workflow

```bash
# Start from an up-to-date main
git checkout main && git pull

# Create a feature branch
git checkout -b feature/your-docs-change

# Make changes, then verify
npm run lint
npm run build

# Push and open a PR to main
git push -u origin feature/your-docs-change
```

## Pull request checklist

- [ ] Linter passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No broken internal links
- [ ] No real secrets or credentials in examples (use placeholder values)
- [ ] New pages are added to `sidebars.js`

## Commit message format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
docs: add scheduler configuration guide
fix: correct openclaw.json field description
feat: add new troubleshooting section
chore: update Docusaurus to v3.8
```

## Writing style

- Write for end users, not developers — assume the reader is setting up MosBot OS for the first time
- Use second person ("you") rather than third person
- Use active voice
- Keep sentences short and direct
- Use code blocks for all commands, file paths, and configuration values
- Use admonitions (`:::tip`, `:::info`, `:::warning`, `:::caution`) to highlight important
  information
- Use placeholder values in examples: `your-token-here`, `<your-api-key>`, `example.com`

## File structure

Documentation pages live in `docs/` organized by section:

```
docs/
├── getting-started/   ← setup and first-run guides
├── openclaw/          ← OpenClaw integration
├── skills/            ← skills documentation
├── configuration/     ← openclaw.json reference
├── features/          ← dashboard feature guides
├── deployment/        ← deployment guides
├── security/          ← security guides
└── troubleshooting/   ← common issues and FAQ
```

Each new page must be:

1. Added as a `.md` file in the appropriate directory
2. Listed in `sidebars.js` in the correct position

## Code style

- 2-space indentation in YAML and JSON examples
- Single quotes in JavaScript code examples
- Trailing newline at end of files

Run `npm run lint` before pushing. The CI will reject PRs with lint errors.

## Security

- Never include real API keys, tokens, passwords, or other secrets in documentation
- Use placeholder values: `your-token-here`, `<api-key>`, `example.com`, `admin@example.com`
- If you accidentally commit a real secret, see [SECURITY.md](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
