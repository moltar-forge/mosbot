import { describe, it, expect } from 'vitest';
import { agencyOrgChart, getAllSubagentLabels, findNodeByLabel } from './agencyOrgChart';

describe('agencyOrgChart', () => {
  it('exports agencyOrgChart object', () => {
    expect(agencyOrgChart).toBeDefined();
    expect(typeof agencyOrgChart).toBe('object');
  });

  it('has leadership array', () => {
    expect(agencyOrgChart.leadership).toBeDefined();
    expect(Array.isArray(agencyOrgChart.leadership)).toBe(true);
    expect(agencyOrgChart.leadership.length).toBeGreaterThan(0);
  });

  it('has departments array', () => {
    expect(agencyOrgChart.departments).toBeDefined();
    expect(Array.isArray(agencyOrgChart.departments)).toBe(true);
    expect(agencyOrgChart.departments.length).toBeGreaterThan(0);
  });

  it('leadership entries have required fields', () => {
    agencyOrgChart.leadership.forEach((leader) => {
      expect(leader).toHaveProperty('id');
      expect(leader).toHaveProperty('title');
      expect(leader).toHaveProperty('label');
      expect(leader).toHaveProperty('displayName');
      expect(leader).toHaveProperty('description');
      expect(leader).toHaveProperty('status');
      expect(leader).toHaveProperty('reportsTo');
    });
  });

  it('departments have required fields', () => {
    agencyOrgChart.departments.forEach((dept) => {
      expect(dept).toHaveProperty('id');
      expect(dept).toHaveProperty('name');
      expect(dept).toHaveProperty('leadId');
      expect(dept).toHaveProperty('description');
      expect(dept).toHaveProperty('subagents');
      expect(Array.isArray(dept.subagents)).toBe(true);
    });
  });

  it('subagents have required fields', () => {
    agencyOrgChart.departments.forEach((dept) => {
      dept.subagents.forEach((agent) => {
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('displayName');
        expect(agent).toHaveProperty('label');
        expect(agent).toHaveProperty('description');
        expect(agent).toHaveProperty('status');
      });
    });
  });

  it('has CEO with null reportsTo', () => {
    const ceo = agencyOrgChart.leadership.find((l) => l.id === 'ceo');
    expect(ceo).toBeDefined();
    expect(ceo.reportsTo).toBeNull();
  });

  it('all non-CEO leaders have reportsTo', () => {
    agencyOrgChart.leadership
      .filter((l) => l.id !== 'ceo')
      .forEach((leader) => {
        expect(leader.reportsTo).toBeTruthy();
      });
  });

  describe('getAllSubagentLabels', () => {
    it('returns array of all subagent labels', () => {
      const labels = getAllSubagentLabels();
      expect(Array.isArray(labels)).toBe(true);
      expect(labels.length).toBeGreaterThan(0);
    });

    it('returns unique labels', () => {
      const labels = getAllSubagentLabels();
      const uniqueLabels = [...new Set(labels)];
      expect(labels.length).toBe(uniqueLabels.length);
    });

    it('includes all subagents from all departments', () => {
      const labels = getAllSubagentLabels();
      let expectedCount = 0;

      agencyOrgChart.departments.forEach((dept) => {
        expectedCount += dept.subagents.length;
      });

      expect(labels.length).toBe(expectedCount);
    });

    it('returns labels in correct format', () => {
      const labels = getAllSubagentLabels();
      labels.forEach((label) => {
        expect(typeof label).toBe('string');
        expect(label.startsWith('mosbot-')).toBe(true);
      });
    });
  });

  describe('findNodeByLabel', () => {
    it('finds leadership node by label', () => {
      const node = findNodeByLabel('mosbot-ceo');
      expect(node).toBeDefined();
      expect(node.type).toBe('leadership');
      expect(node.id).toBe('ceo');
    });

    it('finds subagent node by label', () => {
      const node = findNodeByLabel('mosbot-anvil');
      expect(node).toBeDefined();
      expect(node.type).toBe('subagent');
      expect(node.id).toBe('anvil');
      expect(node.department).toBeDefined();
    });

    it('returns null for non-existent label', () => {
      const node = findNodeByLabel('mosbot-nonexistent');
      expect(node).toBeNull();
    });

    it('returns null for empty label', () => {
      const node = findNodeByLabel('');
      expect(node).toBeNull();
    });

    it('prioritizes leadership over subagents', () => {
      // This test ensures leadership is checked first
      const cooNode = findNodeByLabel('mosbot-coo');
      expect(cooNode).toBeDefined();
      expect(cooNode.type).toBe('leadership');
    });

    it('includes department name for subagents', () => {
      const node = findNodeByLabel('mosbot-anvil');
      expect(node).toBeDefined();
      expect(node.department).toBe('Backend & Security');
    });
  });
});
