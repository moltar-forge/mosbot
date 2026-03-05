# Contributing to MosBot Workspace Service

Thank you for your interest in contributing! This document covers how to set up a local development environment, run tests, and submit changes.

## Prerequisites

- Node.js >= 18
- npm >= 9
- Docker (optional, for container testing)
- [gitleaks](https://github.com/gitleaks/gitleaks) (optional, installed locally for pre-commit secret scanning)

## Local Development Setup

```bash
git clone https://github.com/bymosbot/mosbot-workspace-service.git
cd mosbot-workspace-service
npm install
```

Set the required environment variable before starting the server:

```bash
export WORKSPACE_SERVICE_TOKEN=dev-token-change-me
npm start
```

For local development without a token (not recommended for production):

```bash
export WORKSPACE_SERVICE_ALLOW_ANONYMOUS=true
npm start
```

## Running Tests

```bash
# Run tests once
npm run test:run

# Run tests in watch mode
npm test

# Run tests with coverage (must reach 100%)
npm run test:coverage
```

## Code Formatting

This project uses [Prettier](https://prettier.io/) for consistent formatting.

```bash
# Check formatting
npm run format:check

# Auto-fix formatting
npm run format
```

Formatting is enforced automatically via a Husky pre-commit hook. Staged files are formatted with `lint-staged` before each commit.

## Pre-commit Hooks

Husky is configured to run the following on every commit:

1. `lint-staged` — runs Prettier on staged `.js`, `.json`, and `.md` files
2. `gitleaks` (if installed) — scans staged files for secrets

To install hooks after cloning:

```bash
npm install  # Husky is set up automatically via the `prepare` script
```

## Project Structure

```text
server.js        — backwards-compatible entrypoint (delegates to src/)
src/
  app.js         — Express app factory (routes, middleware, helpers)
  index.js       — process entrypoint (env validation, server start)
__tests__/
  auth.test.js
  health-status.test.js
  files-api.test.js
  symlink-remap.test.js
```

## Submitting Changes

1. Fork the repository and create a feature branch from `main`.
2. Make your changes and ensure all tests pass with 100% coverage.
3. Ensure formatting is clean (`npm run format:check`).
4. Open a pull request against `main` with a clear description of the change.

## Release Process

Releases are tagged with semantic versions (`v1.2.3`). Pushing a tag triggers the GitHub Actions workflow to build and publish a multi-platform Docker image to GHCR.

```bash
git tag v1.0.0
git push origin v1.0.0
```
