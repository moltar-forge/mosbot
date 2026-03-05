# MosBot OS Documentation

[![CI](https://github.com/bymosbot/mosbot-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/bymosbot/mosbot-docs/actions/workflows/ci.yml)
[![Build and Deploy](https://github.com/bymosbot/mosbot-docs/actions/workflows/main.yml/badge.svg)](https://github.com/bymosbot/mosbot-docs/actions/workflows/main.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Documentation Status](https://img.shields.io/badge/docs-passing-brightgreen)](https://bymosbot.github.io/mosbot-docs/)

This repository contains the official documentation for
[MosBot OS](https://github.com/bymosbot/mosbot-api) — a self-hosted operating system for AI agent
work.

The documentation site is built with [Docusaurus](https://docusaurus.io/) and hosted on GitHub
Pages.

## View the docs

**[https://bymosbot.github.io/mosbot-docs/](https://bymosbot.github.io/mosbot-docs/)**

## What's covered

- **Getting Started** — prerequisites, quickstart, configuration, and first-login guide
- **OpenClaw Integration** — connecting MosBot to the OpenClaw AI agent runtime
- **Skills** — creating and managing agent skills
- **Configuration Reference** — complete `openclaw.json` reference with annotated sample
- **Features** — task management, agent monitoring, agents page, workspaces, standups
- **Deployment** — Docker, Kubernetes, and production guides
- **Security** — authentication, roles, and secrets management
- **Troubleshooting** — common issues and FAQ

## Local development

```bash
npm install
npm start
```

The site will be available at `http://localhost:3000/mosbot-docs/`.

## Contributing

1. Fork this repository
2. Create a branch for your changes
3. Edit or add Markdown files in the `docs/` directory
4. Submit a pull request

Documentation is written in Markdown. Each file maps to a page in the sidebar as configured in
`sidebars.js`.

## Deployment

The site is automatically deployed to GitHub Pages on every push to `main` via the GitHub Actions
workflow in `.github/workflows/deploy.yml`.
