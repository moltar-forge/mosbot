---
id: changelog
title: Changelog
sidebar_label: Changelog
---

<!-- markdownlint-disable MD025 -->

All notable changes to MosBot OS documentation are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

For application-level changes, see the changelogs in the respective repositories:

- [mosbot-api CHANGELOG](https://github.com/bymosbot/mosbot-api/blob/main/CHANGELOG.md)
- [mosbot-dashboard CHANGELOG](https://github.com/bymosbot/mosbot-dashboard/blob/main/CHANGELOG.md)

---

## [Unreleased]

_No unreleased changes._

---

## 2026-03-02

### mosbot-dashboard

#### [0.1.4] — [Release](https://github.com/bymosbot/mosbot-dashboard/releases/tag/v0.1.4)

##### Added

- Syntax highlighting for code files in FilePreview using react-syntax-highlighter
- Language detection utility supporting 30+ file types (JavaScript, TypeScript, Python, Go, Rust,
  SQL, Docker, and more)
- `.eslintignore` file to exclude build artifacts and dependencies from linting

##### Changed

- Model display format standardized across all components (now shows "alias (id)")
- SkillsGroupedList and WorkspaceTree refactored to use controlled expansion state
- WorkspaceExplorer improved tree navigation with automatic ancestor folder expansion
- CronJobs page refactored to fetch models at page level instead of per-modal
- FilePreview improved agent-only file handling with proper agentId extraction

##### Fixed

- Agent-only skill files now correctly associate with their agent for content fetching
- Workspace tree now properly expands ancestors when navigating via URL
- Model alias now properly displayed in CronRunHistoryPanel message bubbles

---

## 2026-03-01

### mosbot-api

#### [0.1.2] — [Release](https://github.com/bymosbot/mosbot-api/releases/tag/v0.1.2)

##### Changed

- Updated workspace paths: `/shared/docs` → `/docs` and `/shared/projects` → `/projects`
- Updated README and documentation to reference new documentation site
  (bymosbot.github.io/mosbot-docs)
- Added backward compatibility for legacy `/shared/projects` paths in activity feed
- Updated API documentation to reflect new workspace path structure

#### [0.1.1] — [Release](https://github.com/bymosbot/mosbot-api/releases/tag/v0.1.1)

##### Added

- OpenClaw integration instructions in README

##### Changed

- Updated Dockerfile to ignore scripts during npm installation
- Enhanced Dockerfile for multi-platform support
- Improved CI workflows

### mosbot-dashboard

#### [0.1.3] — [Release](https://github.com/bymosbot/mosbot-dashboard/releases/tag/v0.1.3)

##### Changed

- Updated workspace paths: `/shared/docs` → `/docs` and `/shared/projects` → `/projects`
- Updated README and documentation to reference new documentation site
  (bymosbot.github.io/mosbot-docs)
- Added backward compatibility for legacy `/shared/projects` paths in Log page

#### [0.1.2] — [Release](https://github.com/bymosbot/mosbot-dashboard/releases/tag/v0.1.2)

##### Added

- Frontmatter parsing and display in FilePreview component

##### Security

- Updated .gitignore to include .env.bak file

#### [0.1.1] — [Release](https://github.com/bymosbot/mosbot-dashboard/releases/tag/v0.1.1)

##### Changed

- Improved session counts handling in BotAvatar and botStore

##### Fixed

- Updated deployment condition to check for non-forked repositories

---

## 2026-02-28

### mosbot-api

#### [0.1.0] — [Release](https://github.com/bymosbot/mosbot-api/releases/tag/v0.1.0)

First push. Initial project setup and open source release of MosBot API.

### mosbot-dashboard

#### [0.1.0] — [Release](https://github.com/bymosbot/mosbot-dashboard/releases/tag/v0.1.0)

First push. Initial project setup and open source release of MosBot Dashboard.
