import { describe, expect, it } from 'vitest';
import { extractAgentIdFromWorkspacePath, isAbsoluteWorkspacePath } from './workspacePaths';

describe('workspacePaths', () => {
  describe('isAbsoluteWorkspacePath', () => {
    it('detects absolute agent workspace prefixes', () => {
      expect(isAbsoluteWorkspacePath('/workspace-coo/docs/guide.md')).toBe(true);
      expect(isAbsoluteWorkspacePath('/workspace/docs/guide.md')).toBe(true);
    });

    it('rejects workspace-relative paths', () => {
      expect(isAbsoluteWorkspacePath('/docs/guide.md')).toBe(false);
      expect(isAbsoluteWorkspacePath('docs/guide.md')).toBe(false);
      expect(isAbsoluteWorkspacePath(null)).toBe(false);
    });
  });

  describe('extractAgentIdFromWorkspacePath', () => {
    it('extracts the agent id from absolute agent workspace paths', () => {
      expect(extractAgentIdFromWorkspacePath('/workspace-coo/docs/guide.md')).toBe('coo');
      expect(extractAgentIdFromWorkspacePath('/workspace-lead')).toBe('lead');
    });

    it('returns null for shared or relative paths', () => {
      expect(extractAgentIdFromWorkspacePath('/workspace/docs/guide.md')).toBe(null);
      expect(extractAgentIdFromWorkspacePath('/docs/guide.md')).toBe(null);
      expect(extractAgentIdFromWorkspacePath(undefined)).toBe(null);
    });
  });
});
