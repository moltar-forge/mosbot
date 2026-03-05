---
paths:
  - "src/**/*.js"
  - "__tests__/**/*"
  - "Dockerfile"
  - ".env*"
---

# OpenClaw Integration Rules

## Do

- Preserve the intended security model of the workspace service as a secure sidecar for OpenClaw.
- Respect OpenClaw's workspace structure and file organization conventions.
- Implement proper error handling for cases when the workspace is not accessible.
- Follow OpenClaw's conventions for file persistence and state management.
- Maintain compatibility with OpenClaw's expected file paths and structures.
- Use proper symlink handling for cross-container operations with OpenClaw.
- Implement robust workspace availability checks at startup.

## Don't

- Don't modify OpenClaw's core file structures without explicit coordination.
- Don't bypass security measures to accommodate OpenClaw-specific requirements.
- Don't make assumptions about OpenClaw's internal file structure without verification.
- Don't expose OpenClaw internals unnecessarily through the API.
- Don't cache workspace file states without considering OpenClaw's potential concurrent access.
- Don't weaken security measures to achieve deeper OpenClaw integration.

## Integration Points

- Workspace mounting and file access via the configured `WORKSPACE_ROOT` and `WORKSPACE_SUBDIR`
- Authentication compatibility with OpenClaw's service discovery
- Proper handling of OpenClaw's symlink patterns via `SYMLINK_REMAP_PREFIXES`
- File format compatibility with OpenClaw's expected input/output formats

## Configuration Alignment

- Align environment variable names with OpenClaw conventions where possible
- Ensure default paths work well with standard OpenClaw deployments
- Maintain backward compatibility when OpenClaw updates its workspace expectations
- Document any workspace-specific behavior that OpenClaw users should know about

## Error Recovery

- Handle gracefully when OpenClaw's workspace is temporarily unavailable
- Provide clear error messages when integration issues occur
- Implement proper retries where appropriate for transient OpenClaw connectivity issues
