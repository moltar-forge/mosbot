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

### Changed

- Docker publish workflow hardened for multi-platform builds and SHA prefix handling
- Documentation clarified for read/write mounts and `MAIN_WORKSPACE_DIR` behavior
- Path routing is now strict split-root: only `/workspace` and `/workspace/**` resolve under
  `MAIN_WORKSPACE_FS_ROOT`; all other absolute paths resolve under `CONFIG_ROOT`
- Legacy archived paths such as `/_archived_workspace_main/**` now resolve under `CONFIG_ROOT`

### Fixed

- Dockerfile now includes the application source directory in image builds

### Security

- Switched Gitleaks license key to an organization secret

## [0.1.0] - 2026-03-03

- Initial release

[0.1.0]: https://github.com/bymosbot/mosbot-workspace-service/releases/tag/v0.1.0
