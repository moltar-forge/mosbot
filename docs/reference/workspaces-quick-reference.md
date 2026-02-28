# Workspaces quick reference

## Create a file (including nested folders)

Example:

- Input: `docs/guides/setup.md`
- Result: creates missing folders and then the file

## Move a file

- Drag a file onto a destination folder in the tree
- Confirm overwrite if prompted

## Common errors

- **“File name cannot contain ..”** → remove `..` from the path
- **“Path must end with a filename”** → don’t end with `/`
- **“Already exists”** → choose a different name, or delete first (create does not overwrite)

## Permissions (high level)

- Browse structure + metadata: all authenticated users
- Modify (create/move/delete/rename): elevated roles only
