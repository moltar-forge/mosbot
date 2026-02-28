import { describe, it, expect } from 'vitest';
import { agentWorkspaces, getAgentById, getDefaultAgent, isValidAgentId } from './agentWorkspaces';

describe('agentWorkspaces', () => {
  it('exports agentWorkspaces array with expected structure', () => {
    expect(Array.isArray(agentWorkspaces)).toBe(true);
    agentWorkspaces.forEach((agent) => {
      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('label');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('workspaceRootPath');
      expect(agent).toHaveProperty('icon');
    });
  });

  it('getAgentById returns agent when found', () => {
    const agent = getAgentById('coo');
    expect(agent).toBeDefined();
    expect(agent.id).toBe('coo');
    expect(agent.name).toBe('COO');
  });

  it('getAgentById returns first agent when id not found', () => {
    const agent = getAgentById('nonexistent');
    expect(agent).toBeDefined();
    expect(agent).toBe(agentWorkspaces[0]);
  });

  it('getDefaultAgent returns first agent', () => {
    const agent = getDefaultAgent();
    expect(agent).toBe(agentWorkspaces[0]);
  });

  it('isValidAgentId returns true for valid id', () => {
    expect(isValidAgentId('coo')).toBe(true);
    expect(isValidAgentId('cto')).toBe(true);
  });

  it('isValidAgentId returns false for invalid id', () => {
    expect(isValidAgentId('invalid')).toBe(false);
  });
});
