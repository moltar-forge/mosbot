# Security & Secrets

## Do

- Require `WORKSPACE_SERVICE_TOKEN` on startup unless explicitly allowing anonymous access for local dev.
- Validate all user-provided file paths through the existing safe path resolution logic.
- Use `assertWithinRoot` to prevent path traversal attacks.
- Hash or encrypt sensitive data when persisting to storage.
- Log security-relevant events (failed auth attempts, path traversal attempts).
- Sanitize file paths by resolving `..` sequences and rejecting paths outside the workspace root.
- Handle symlinks safely with proper prefix remapping (`SYMLINK_REMAP_PREFIXES`).

## Don't

- Don't bypass path validation for any reason — always enforce `assertWithinRoot` checks.
- Don't log bearer tokens, file contents, or other sensitive data.
- Don't allow path traversal via `../` sequences or symbolic links pointing outside the workspace.
- Don't return internal error details in API responses — log server-side only.
- Don't disable authentication in production environments.
- Don't follow symlinks without proper validation and remapping.

## Required env vars (must never have defaults)

| Variable                  | Why                                                   |
| ------------------------- | ----------------------------------------------------- |
| `WORKSPACE_SERVICE_TOKEN` | A default token makes the service completely insecure |

## If you accidentally committed a secret

1. Immediately revoke/rotate the exposed credential — assume it is compromised.
2. Remove from history: use `git filter-repo` or BFG Repo Cleaner.
3. Force-push the cleaned branch and notify maintainers.
4. Verify: `git log -p | grep <partial-secret>`.
5. If the repo is public, treat the credential as fully compromised regardless of removal speed.

## Dependencies

- Run `npm audit` before opening a PR that adds or upgrades dependencies.
- Do not add dependencies with known high/critical CVEs without documented justification.

## File System Safety

- Always validate file paths before any fs operations
- Prevent access to system files outside the workspace root
- Restrict file operations to the designated workspace subdirectory
- Implement proper rate limiting to prevent abuse
