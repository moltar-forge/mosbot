import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useToastStore } from '../stores/toastStore';
import { api, getModels } from '../api/client';
import {
  AVAILABLE_MODELS,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_HEARTBEAT_MODEL,
} from '../constants/models';
import logger from '../utils/logger';

export default function AgentEditModal({ isOpen, onClose, onSave, agentId = null, mode = 'edit' }) {
  const { showToast } = useToastStore();
  const isCreateMode = mode === 'create' || !agentId;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state - merged view of agents.json and openclaw.json data
  const [formData, setFormData] = useState({
    // From agents.json leadership
    id: '',
    title: '',
    label: '',
    displayName: '',
    description: '',
    status: 'scaffolded', // human, scaffolded, active, deprecated
    reportsTo: '',

    // From openclaw.json agents.list
    workspace: '',
    identityName: '',
    identityTheme: '',
    identityEmoji: '🤖',
    modelPrimary: DEFAULT_PRIMARY_MODEL,
    modelFallback1: '',
    modelFallback2: '',

    // Heartbeat config (optional)
    heartbeatEnabled: false,
    heartbeatEvery: '60m',
    heartbeatModel: DEFAULT_HEARTBEAT_MODEL,
  });

  const [availableLeaders, setAvailableLeaders] = useState([]);
  const [availableModels, setAvailableModels] = useState(AVAILABLE_MODELS); // Fallback to hardcoded list

  // Load agent data, available leaders, and models when modal opens
  useEffect(() => {
    if (isOpen) {
      if (isCreateMode) {
        resetForm();
      } else {
        loadAgentData();
      }
      loadAvailableLeaders();
      loadModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAgentData, loadAvailableLeaders, resetForm are stable; isCreateMode derived from agentId
  }, [isOpen, agentId, isCreateMode]);

  const resetForm = () => {
    // Create mode: seed with sensible defaults
    // Edit mode: never call this — loadAgentData populates from live config
    setFormData({
      id: '',
      title: '',
      label: '',
      displayName: '',
      description: '',
      status: 'scaffolded',
      reportsTo: '',
      workspace: '',
      identityName: '',
      identityTheme: '',
      identityEmoji: '🤖',
      modelPrimary: DEFAULT_PRIMARY_MODEL,
      modelFallback1: '',
      modelFallback2: '',
      heartbeatEnabled: false,
      heartbeatEvery: '60m',
      heartbeatModel: DEFAULT_HEARTBEAT_MODEL,
    });
  };

  const loadAvailableLeaders = async () => {
    try {
      const response = await api.get('/openclaw/agents/config');
      const config = response.data?.data || {};
      const leaders = (config.leadership || []).filter((l) => l.status !== 'human');
      setAvailableLeaders(leaders);
    } catch (error) {
      logger.warn('Failed to load available leaders', { error: error.message });
      setAvailableLeaders([]);
    }
  };

  const loadModels = async () => {
    try {
      const models = await getModels();
      if (models.length > 0) {
        // Transform API models to match AVAILABLE_MODELS format
        // API returns: { id, name (display name), alias, params, isDefault }
        const transformedModels = models.map((model) => {
          const provider = model.id.split('/')[0] || 'Unknown';
          return {
            id: model.id,
            name: model.name || model.id,
            alias: model.alias || model.name || model.id,
            provider,
          };
        });
        setAvailableModels(transformedModels);
      }
      // If API returns empty or fails, keep AVAILABLE_MODELS fallback
    } catch (error) {
      logger.warn('Failed to load models, using fallback', { error: error.message });
      // Keep AVAILABLE_MODELS as fallback
    }
  };

  const loadAgentData = async () => {
    setIsLoading(true);
    try {
      // Fetch agents.json (leadership/org data) and the raw openclaw.json (full agent config)
      // in parallel. We need the raw openclaw.json because the normalized /openclaw/agents
      // endpoint strips model, identity, and heartbeat fields — it's display-only.
      const [agentsConfigResult, rawConfigResult] = await Promise.allSettled([
        api.get('/openclaw/agents/config'),
        api.get('/openclaw/workspace/files/content', { params: { path: '/openclaw.json' } }),
      ]);

      let agentsConfig = null;
      let rawAgentEntry = null;

      if (agentsConfigResult.status === 'fulfilled' && agentsConfigResult.value) {
        agentsConfig = agentsConfigResult.value.data?.data || null;
      } else {
        logger.warn('Failed to load agents config', { error: agentsConfigResult.reason?.message });
      }

      if (rawConfigResult.status === 'fulfilled' && rawConfigResult.value) {
        try {
          const raw = rawConfigResult.value.data?.data?.content || '{}';
          const openclawConfig = JSON.parse(raw);
          const agentsDefaults = openclawConfig?.agents?.defaults || {};
          const agentsList = openclawConfig?.agents?.list || [];
          const agentSpecific = agentsList.find((a) => a.id === agentId) || {};

          // Merge: defaults first, then agent-specific config on top.
          // Main agent is often absent from agents.list and inherits entirely from defaults.
          // Priority: agent-specific > agents.defaults > nothing
          const resolvedModel = agentSpecific.model?.primary
            ? agentSpecific.model
            : agentsDefaults.model || null;

          rawAgentEntry = {
            workspace: agentSpecific.workspace || agentsDefaults.workspace || null,
            identity: agentSpecific.identity || null,
            heartbeat: agentSpecific.heartbeat || null,
            model: resolvedModel,
          };
        } catch (parseErr) {
          logger.warn('Failed to parse openclaw.json', { error: parseErr.message });
        }
      } else {
        logger.warn('Failed to load raw openclaw config', { error: rawConfigResult.reason?.message });
      }

      // If both failed, bail
      if (!agentsConfig && !rawAgentEntry) {
        showToast('Failed to load agent configuration. Please try again.', 'error');
        onClose();
        return;
      }

      // Leadership entry from agents.json (display/org fields)
      const leadershipEntry = agentsConfig
        ? (agentsConfig.leadership || []).find((l) => l.id === agentId)
        : null;

      if (!leadershipEntry && !rawAgentEntry) {
        showToast('Agent not found', 'error');
        onClose();
        return;
      }

      // Pull model values from raw openclaw.json config (source of truth).
      // Do NOT fall back to DEFAULT_PRIMARY_MODEL — if a field isn't configured, show it blank.
      const configuredModelPrimary = rawAgentEntry?.model?.primary ?? '';
      const configuredFallback1 = rawAgentEntry?.model?.fallbacks?.[0] ?? '';
      const configuredFallback2 = rawAgentEntry?.model?.fallbacks?.[1] ?? '';

      // If the configured model isn't in the available models list, add it dynamically
      // so the select renders the correct value instead of showing a mismatch.
      if (configuredModelPrimary) {
        setAvailableModels((prev) => {
          if (!prev.find((m) => m.id === configuredModelPrimary)) {
            return [
              ...prev,
              { id: configuredModelPrimary, name: configuredModelPrimary, alias: configuredModelPrimary, provider: 'Unknown' },
            ];
          }
          return prev;
        });
      }

      setFormData({
        // Org/display fields from agents.json leadership
        id: leadershipEntry?.id || agentId,
        title: leadershipEntry?.title || '',
        label: leadershipEntry?.label || `mosbot-${agentId}`,
        displayName: leadershipEntry?.displayName || rawAgentEntry?.identity?.name || '',
        description: leadershipEntry?.description || rawAgentEntry?.identity?.theme || '',
        status: leadershipEntry?.status || 'active',
        reportsTo: leadershipEntry?.reportsTo || '',

        // OpenClaw config fields from raw openclaw.json
        workspace: rawAgentEntry?.workspace || `/home/node/.openclaw/workspace-${agentId}`,
        identityName: rawAgentEntry?.identity?.name || leadershipEntry?.displayName || '',
        identityTheme: rawAgentEntry?.identity?.theme || leadershipEntry?.description || '',
        identityEmoji: rawAgentEntry?.identity?.emoji || leadershipEntry?.emoji || '🤖',
        modelPrimary: configuredModelPrimary,
        modelFallback1: configuredFallback1,
        modelFallback2: configuredFallback2,

        // Heartbeat from raw openclaw.json
        heartbeatEnabled: !!rawAgentEntry?.heartbeat,
        heartbeatEvery: rawAgentEntry?.heartbeat?.every || '60m',
        heartbeatModel: rawAgentEntry?.heartbeat?.model || '',
      });
    } catch (error) {
      logger.error('Failed to load agent data', error, {
        agentId,
        status: error.response?.status,
        message: error.response?.data?.error?.message || error.message,
      });
      showToast(error.response?.data?.error?.message || 'Failed to load agent data', 'error');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (isSaving) return;

    // Validation
    if (!formData.id.trim()) {
      showToast('Agent ID is required', 'error');
      return;
    }

    if (!formData.displayName.trim()) {
      showToast('Display name is required', 'error');
      return;
    }

    setIsSaving(true);

    try {
      // Build payload for the API - the server handles both agents.json and openclaw.json
      const payload = {
        id: formData.id,
        title: formData.title,
        label: formData.label,
        displayName: formData.displayName,
        description: formData.description,
        status: formData.status,
        reportsTo: formData.reportsTo || null,
        workspace: formData.workspace,
        identityName: formData.identityName || formData.displayName,
        identityTheme: formData.identityTheme || formData.description,
        identityEmoji: formData.identityEmoji,
        modelPrimary: formData.modelPrimary,
        modelFallback1: formData.modelFallback1,
        modelFallback2: formData.modelFallback2,
        heartbeatEnabled: formData.heartbeatEnabled,
        heartbeatEvery: formData.heartbeatEvery,
        heartbeatModel: formData.heartbeatModel,
      };

      logger.info('Saving agent via API', {
        agentId: formData.id,
        mode: isCreateMode ? 'create' : 'edit',
      });

      let response;
      if (isCreateMode) {
        response = await api.post('/openclaw/agents/config', payload);
      } else {
        response = await api.put(`/openclaw/agents/config/${formData.id}`, payload);
      }

      const result = response.data?.data;
      logger.info('Agent saved successfully', { agentId: formData.id, result });

      showToast(
        isCreateMode ? 'Agent created successfully' : 'Agent updated successfully',
        'success',
      );

      if (onSave) {
        await onSave();
      }

      onClose();
    } catch (error) {
      logger.error('Failed to save agent', error, {
        agentId: formData.id,
        status: error.response?.status,
        message: error.response?.data?.error?.message,
      });
      showToast(error.response?.data?.error?.message || 'Failed to save agent', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-75 transition-opacity"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative w-full max-w-3xl transform rounded-lg bg-dark-900 border border-dark-700 shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-dark-800 px-6 py-4">
            <h3 className="text-lg font-semibold text-dark-100">
              {isCreateMode
                ? 'Add New Agent'
                : `Edit Agent: ${formData.displayName || formData.id}`}
            </h3>
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="text-dark-400 hover:text-dark-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-dark-400 text-sm">Loading agent data...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Basic Info Section */}
                <div>
                  <h4 className="text-sm font-medium text-dark-200 mb-4">Basic Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Agent ID <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.id}
                        onChange={(e) => handleChange('id', e.target.value)}
                        disabled={!isCreateMode || isSaving}
                        placeholder="e.g., orchestrator, researcher, builder"
                        className="input-field w-full disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <p className="text-xs text-dark-500 mt-1">
                        Lowercase, no spaces (e.g., orchestrator, builder)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">Title</label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleChange('title', e.target.value)}
                        disabled={isSaving}
                        placeholder="e.g., Orchestrator, Engineer, Researcher"
                        className="input-field w-full disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Display Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.displayName}
                        onChange={(e) => handleChange('displayName', e.target.value)}
                        disabled={isSaving}
                        placeholder="e.g., MosBot, ResearchBot, BuilderBot"
                        className="input-field w-full disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">Label</label>
                      <input
                        type="text"
                        value={formData.label}
                        onChange={(e) => handleChange('label', e.target.value)}
                        disabled={isSaving}
                        placeholder="e.g., mosbot-orchestrator"
                        className="input-field w-full disabled:opacity-50"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => handleChange('description', e.target.value)}
                        disabled={isSaving}
                        placeholder="Brief description of the agent's role and responsibilities"
                        rows={3}
                        className="input-field w-full disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        disabled={isSaving}
                        className="input-field w-full disabled:opacity-50"
                      >
                        <option value="scaffolded">Scaffolded</option>
                        <option value="active">Active</option>
                        <option value="deprecated">Deprecated</option>
                        <option value="human">Human</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Reports To
                      </label>
                      <select
                        value={formData.reportsTo}
                        onChange={(e) => handleChange('reportsTo', e.target.value)}
                        disabled={isSaving}
                        className="input-field w-full disabled:opacity-50"
                      >
                        <option value="">None (Top Level)</option>
                        {availableLeaders
                          .filter((l) => l.id !== formData.id)
                          .map((leader) => (
                            <option key={leader.id} value={leader.id}>
                              {leader.displayName || leader.title} ({leader.id})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Skip OpenClaw config for human agents */}
                {formData.status !== 'human' && (
                  <>
                    {/* OpenClaw Config Section */}
                    <div>
                      <h4 className="text-sm font-medium text-dark-200 mb-4">
                        OpenClaw Configuration
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-dark-300 mb-2">
                            Workspace Path
                            {agentId === 'main' && (
                              <span className="ml-2 text-xs text-dark-500 font-normal">(read-only for main agent)</span>
                            )}
                          </label>
                          <input
                            type="text"
                            value={formData.workspace}
                            onChange={(e) => handleChange('workspace', e.target.value)}
                            disabled={isSaving || agentId === 'main'}
                            placeholder="/home/node/.openclaw/workspace-myagent"
                            className="input-field w-full disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-2">
                            Emoji
                          </label>
                          <input
                            type="text"
                            value={formData.identityEmoji}
                            onChange={(e) => handleChange('identityEmoji', e.target.value)}
                            disabled={isSaving}
                            placeholder="🤖"
                            className="input-field w-full disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-2">
                            Primary Model <span className="text-red-400">*</span>
                          </label>
                          <select
                            value={formData.modelPrimary}
                            onChange={(e) => handleChange('modelPrimary', e.target.value)}
                            disabled={isSaving}
                            className="input-field w-full disabled:opacity-50"
                          >
                            {availableModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.alias} ({model.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-2">
                            Fallback Model 1
                          </label>
                          <select
                            value={formData.modelFallback1}
                            onChange={(e) => handleChange('modelFallback1', e.target.value)}
                            disabled={isSaving}
                            className="input-field w-full disabled:opacity-50"
                          >
                            <option value="">None</option>
                            {availableModels
                              .filter((m) => m.id !== formData.modelPrimary)
                              .map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.alias} ({model.id})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-2">
                            Fallback Model 2
                          </label>
                          <select
                            value={formData.modelFallback2}
                            onChange={(e) => handleChange('modelFallback2', e.target.value)}
                            disabled={isSaving}
                            className="input-field w-full disabled:opacity-50"
                          >
                            <option value="">None</option>
                            {availableModels
                              .filter(
                                (m) =>
                                  m.id !== formData.modelPrimary &&
                                  m.id !== formData.modelFallback1,
                              )
                              .map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.alias} ({model.id})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Heartbeat Section */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-dark-200">
                          Heartbeat Configuration
                        </h4>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.heartbeatEnabled}
                            onChange={(e) => handleChange('heartbeatEnabled', e.target.checked)}
                            disabled={isSaving}
                            className="w-4 h-4 text-primary-600 bg-dark-800 border-dark-600 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-dark-300">Enable</span>
                        </label>
                      </div>

                      {formData.heartbeatEnabled && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-dark-300 mb-2">
                                Interval
                              </label>
                              <input
                                type="text"
                                value={formData.heartbeatEvery}
                                onChange={(e) => handleChange('heartbeatEvery', e.target.value)}
                                disabled={isSaving}
                                placeholder="60m"
                                className="input-field w-full disabled:opacity-50"
                              />
                              <p className="text-xs text-dark-500 mt-1">e.g., 30m, 1h, 2h</p>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-dark-300 mb-2">
                                Model
                              </label>
                              <select
                                value={formData.heartbeatModel}
                                onChange={(e) => handleChange('heartbeatModel', e.target.value)}
                                disabled={isSaving}
                                className="input-field w-full disabled:opacity-50"
                              >
                                {availableModels.map((model) => (
                                  <option key={model.id} value={model.id}>
                                    {model.alias} ({model.id})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-dark-800 px-6 py-4">
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : isCreateMode ? 'Create Agent' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
