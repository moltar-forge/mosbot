---
id: known-issues
title: Known Issues
sidebar_label: Known Issues
---

This page lists currently known issues and limitations in MosBot OS. We are actively working on
resolving these.

## Agents Page

- **Workspace Creation**: The Agents page currently only updates the `openclaw.json > agents.list[]`
  configuration. It does **not** automatically trigger the creation of the corresponding workspace
  in OpenClaw. You must manually ensure the workspace exists or prompt the OpenClaw agent to create
  it.

## User Management

- **Agent/User Linking**: The **Settings > Users > Add User** functionality creates the user account
  necessary for login and JWT exchange. However, it does **not** automatically link this user to an
  agent in `openclaw.json > agents.list[]`. You must manually ensure the user is correctly
  associated with an agent in the configuration if required.
