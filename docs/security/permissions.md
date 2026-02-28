# Permissions (roles and capabilities)

MosBot Dashboard uses role-based access control. The UI reflects permissions for clarity, but **the backend is authoritative**.

## Roles

- **owner**: highest privilege
- **admin**: administrative privilege
- **agent**: privileged operational role (often treated as elevated)
- **user**: standard least-privilege role

## Capability matrix (dashboard UX)

This matrix describes intended UX behavior.

### Workspaces

- **Browse structure + view metadata**: all authenticated roles
- **Read file contents**: elevated roles (commonly `admin`, `owner`, and sometimes `agent`, depending on policy)
- **Modify workspace (create/rename/move/delete)**: elevated roles (commonly `admin`/`owner`)

### Settings → Users

- **View user list**: all authenticated roles (view-only for non-admin)
- **Create/edit/delete users**: `admin` and `owner`

### Tasks

- **View tasks**: all authenticated roles
- **Mutate tasks (create/update/status move)**: depends on MosBot API policy; dashboard should assume backend enforcement

If this matrix diverges from MosBot API, the API wins—update the dashboard UX + docs to match.
