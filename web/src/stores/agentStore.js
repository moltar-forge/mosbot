import { create } from 'zustand';
import { api, getAgents } from '../api/client';
import logger from '../utils/logger';

// Archived workspace agent - temporary access to archived files
const archivedAgent = {
  id: 'archived',
  name: 'Archived',
  label: 'Archived (Old Main)',
  description: 'Archived workspace files from previous iteration',
  workspaceRootPath: '/_archived_workspace_main',
  icon: '📦',
  isDefault: false,
};

const hasArchivedWorkspace = async () => {
  try {
    await api.get('/openclaw/workspace/files', {
      params: {
        path: archivedAgent.workspaceRootPath,
        recursive: 'false',
      },
    });
    return true;
  } catch (error) {
    if (error?.response?.status === 404) {
      return false;
    }

    logger.warn('Archived workspace probe failed, hiding archived agent', {
      status: error?.response?.status,
      message: error?.message,
    });
    return false;
  }
};

// Fallback agent when /openclaw/agents cannot provide agents
// (for example, when config cannot be read or the endpoint returns []).
const fallbackAgents = [
  {
    id: 'main',
    name: 'main',
    label: 'main (Default)',
    description: 'Default OpenClaw agent',
    workspaceRootPath: '/workspace',
    icon: '🦞',
    isDefault: true,
  },
];

export const useAgentStore = create((set, get) => ({
  agents: [],
  isLoading: false,
  error: null,
  isInitialized: false,
  lastFetchedAt: 0,

  // Fetch agents from API (auto-discovery)
  // Options:
  // - force: bypass cache guard and refresh immediately
  // - staleMs: refresh when cache older than this age (default 30s)
  fetchAgents: async ({ force = false, staleMs = 30_000 } = {}) => {
    const state = get();
    const now = Date.now();
    const isFresh = state.lastFetchedAt > 0 && now - state.lastFetchedAt < staleMs;

    // Don't fetch if already loading
    if (state.isLoading) {
      return state.agents;
    }

    // Return cached data when fresh unless force=true
    if (!force && state.isInitialized && state.agents.length > 0 && isFresh) {
      return state.agents;
    }

    set({ isLoading: true, error: null });

    try {
      const agentsData = await getAgents();
      const raw = Array.isArray(agentsData) ? agentsData : [];

      // Transform workspace paths to workspaceRootPath format for consistency
      // Derive workspaceRootPath from agent.workspace by stripping /home/node/.openclaw/ prefix
      // Examples:
      //   /home/node/.openclaw/workspace -> /workspace
      //   /home/node/.openclaw/workspace-cto -> /workspace-cto
      let agents = raw.map((agent) => {
        let workspaceRootPath = `/workspace-${agent.id}`; // fallback
        if (agent.workspace) {
          // Strip /home/node/.openclaw/ prefix if present
          const prefix = '/home/node/.openclaw/';
          if (agent.workspace.startsWith(prefix)) {
            workspaceRootPath = '/' + agent.workspace.substring(prefix.length);
          } else {
            workspaceRootPath = agent.workspace;
          }
        }
        return {
          ...agent,
          // Keep a single canonical icon field for workspace dropdowns.
          icon: agent.icon || agent.emoji || '🤖',
          workspaceRootPath,
        };
      });

      // Filter out API version if present, then conditionally append archived
      agents = agents.filter((a) => a.id !== 'archived');
      const archivedAvailable = await hasArchivedWorkspace();
      const baseAgents = agents.length > 0 ? agents : fallbackAgents;
      const finalAgents = archivedAvailable ? [...baseAgents, archivedAgent] : baseAgents;

      set({
        agents: finalAgents,
        isLoading: false,
        error: null,
        isInitialized: true,
        lastFetchedAt: Date.now(),
      });

      return finalAgents;
    } catch (error) {
      const status = error?.response?.status;
      if (status === 401 || status === 403) {
        logger.warn('Failed to fetch agents due to authorization, using fallback', {
          status,
          message: error?.message,
        });
      } else {
        logger.error('Failed to fetch agents, using fallback', error);
      }

      set({
        agents: fallbackAgents,
        isLoading: false,
        error: error.message,
        isInitialized: true,
        lastFetchedAt: Date.now(),
      });

      return fallbackAgents;
    }
  },

  // Get agent by ID
  getAgentById: (id) => {
    const { agents } = get();
    return agents.find((agent) => agent.id === id) || agents.find((a) => a.isDefault) || agents[0];
  },

  // Get default agent
  getDefaultAgent: () => {
    const { agents } = get();
    return agents.find((agent) => agent.isDefault) || agents[0];
  },

  // Check if agent ID is valid
  isValidAgentId: (id) => {
    const { agents } = get();
    return agents.some((agent) => agent.id === id);
  },

  // Reset store
  reset: () => {
    set({
      agents: [],
      isLoading: false,
      error: null,
      isInitialized: false,
      lastFetchedAt: 0,
    });
  },
}));
