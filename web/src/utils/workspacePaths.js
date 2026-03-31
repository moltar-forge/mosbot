// Absolute workspace paths bypass the store's workspaceRootPath prefixing.
export const isAbsoluteWorkspacePath = (value) =>
  typeof value === 'string' &&
  (value.startsWith('/workspace-') || value.startsWith('/workspace/'));

export const extractAgentIdFromWorkspacePath = (value) => {
  if (typeof value !== 'string') return null;

  const match = value.match(/^\/workspace-([^/]+)(?:\/|$)/);
  return match ? match[1] : null;
};
