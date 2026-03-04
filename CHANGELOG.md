# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Split workspace/config filesystem roots and enforce config-root + main-workspace-dir path law
- `/workspace/*` virtual mapping for the main workspace
- Claude Code configuration and project rules
- Coverage for strict split-root path routing in files API and symlink remap tests
- Explicit virtual-path allowlist coverage and policy rejection assertions (`PATH_NOT_ALLOWED`)
- Typed per-agent link management endpoints:
  `GET /links/:type/:agentId`, `PUT /links/:type/:agentId`,
  and `DELETE /links/:type/:agentId` (docs-only for now)

### Changed

- Docker publish workflow hardened for multi-platform builds and SHA prefix handling
- Documentation clarified for read/write mounts and `MAIN_WORKSPACE_DIR` behavior
- Path routing now combines strict split-root with explicit config-root allowlist:
  only `/workspace` and `/workspace/**` resolve under the main workspace root, while
  config-root access is limited to `/openclaw.json`, `/agents.json`, `/projects/**`,
  `/skills/**`, `/docs/**`, `/workspace-<agent>/**`, and `/_archived_workspace_main/**`
- Disallowed virtual paths now return `403 PATH_NOT_ALLOWED` across file endpoints, including `/`
- Docs link management is now per-agent and system-triggerable instead of bulk projection

### Removed

- `org-chart.json` from workspace-service allowlisted config paths
- Legacy bulk endpoint `POST /symlinks/ensure`

### Fixed

- Dockerfile now includes the application source directory in image builds

### Security

- Switched Gitleaks license key to an organization secret

## [0.1.0] - 2026-03-03

- Initial release

[0.1.0]: https://github.com/bymosbot/mosbot-workspace-service/releases/tag/v0.1.0
