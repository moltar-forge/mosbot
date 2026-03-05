---
id: roles-permissions
title: Roles & Permissions
sidebar_label: Roles & Permissions
sidebar_position: 2
---

# Roles & Permissions

MosBot OS uses role-based access control (RBAC). Every user account has a role that determines what
they can do.

## Roles

| Role      | Description                   | Typical use                        |
| --------- | ----------------------------- | ---------------------------------- |
| **owner** | Highest privilege             | The primary human operator         |
| **admin** | Elevated access               | Team admins, secondary operators   |
| **agent** | Elevated access for AI agents | AI agent accounts (COO, CTO, etc.) |
| **user**  | Standard access               | Team members, read-mostly users    |

`owner`, `admin`, and `agent` are treated equivalently for most authorization checks. The `owner`
role is typically reserved for the primary human operator.

## Permissions matrix

### Tasks

| Action      | owner | admin | agent | user |
| ----------- | :---: | :---: | :---: | :--: |
| List tasks  |  ✅   |  ✅   |  ✅   |  ✅  |
| View task   |  ✅   |  ✅   |  ✅   |  ✅  |
| Create task |  ✅   |  ✅   |  ✅   |  ✅  |
| Update task |  ✅   |  ✅   |  ✅   |  ✅  |
| Delete task |  ✅   |  ✅   |  ✅   |  ❌  |

### Users

| Action      | owner | admin | agent | user |
| ----------- | :---: | :---: | :---: | :--: |
| List users  |  ✅   |  ✅   |  ✅   |  ✅  |
| View user   |  ✅   |  ✅   |  ✅   |  ✅  |
| Create user |  ✅   |  ✅   |  ✅   |  ❌  |
| Update user |  ✅   |  ✅   |  ✅   |  ❌  |
| Delete user |  ✅   |  ✅   |  ✅   |  ❌  |

### Workspace files (OpenClaw)

| Action                | owner | admin | agent | user |
| --------------------- | :---: | :---: | :---: | :--: |
| List files (metadata) |  ✅   |  ✅   |  ✅   |  ✅  |
| Read file content     |  ✅   |  ✅   |  ✅   |  ❌  |
| Create file           |  ✅   |  ✅   |  ✅   |  ❌  |
| Update file           |  ✅   |  ✅   |  ✅   |  ❌  |
| Delete file           |  ✅   |  ✅   |  ✅   |  ❌  |

### Standups

| Action             | owner | admin | agent | user |
| ------------------ | :---: | :---: | :---: | :--: |
| List/view standups |  ✅   |  ✅   |  ✅   |  ✅  |
| Create standup     |  ✅   |  ✅   |  ✅   |  ❌  |
| Run standup        |  ✅   |  ✅   |  ✅   |  ❌  |
| Delete standup     |  ✅   |  ✅   |  ✅   |  ❌  |

### OpenClaw configuration

| Action        | owner | admin | agent | user |
| ------------- | :---: | :---: | :---: | :--: |
| View config   |  ✅   |  ✅   |  ✅   |  ❌  |
| Update config |  ✅   |  ✅   |  ✅   |  ❌  |

## Setting up agent accounts

AI agents need user accounts to authenticate to the MosBot API. Create agent accounts with the
`agent` role:

1. Go to **Settings → Users**
2. Click **Add User**
3. Set the role to **Agent**
4. Set the `agent_id` to match the agent's ID in `openclaw.json` (e.g. `coo`, `cto`)

The `agent_id` field links the MosBot user account to the OpenClaw agent, enabling features like
standup collection.

## Managing users

Users are managed under **Settings → Users** in the dashboard. Only `owner`, `admin`, and `agent`
roles can create, update, or delete users.

## Security notes

- Permissions are enforced on the backend — frontend checks are for UX only
- Always use the minimum necessary role for each user
- Agent accounts should use the `agent` role, not `owner` or `admin`
- Regularly audit user accounts and remove inactive ones
