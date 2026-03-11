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
import { useAgentStore } from '../stores/agentStore';

export default function AgentEditModal({ isOpen, onClose, onSave, agentId = null, mode = 'edit' }) {
  const { showToast } = useToastStore();
  const fetchAgents = useAgentStore((state) => state.fetchAgents);
  const isCreateMode = mode === 'create' || !agentId;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state - merged view of agents config and openclaw.json data
  const [formData, setFormData] = useState({
    // From agents DB metadata
    id: '',
    title: '',
    label: '',
    displayName: '',
    description: '',
    status: 'active',
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
  const [availableModels, setAvailableModels] = useState([]);

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
      status: 'active',
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
        // Use only models enabled in OpenClaw config.
        // Do not merge in hardcoded fallback lists when API models are available.
        setAvailableModels(transformedModels);
      }
      // If API returns empty, fallback to built-in models.
      if (models.length === 0) {
        setAvailableModels(AVAILABLE_MODELS);
      }
    } catch (error) {
      logger.warn('Failed to load models, using fallback', { error: error.message });
      setAvailableModels(AVAILABLE_MODELS);
    }
  };

  const loadAgentData = async () => {
    setIsLoading(true);
    try {
      // Fetch agents config (leadership/org data) and the enriched /openclaw/agents list
      // (which now includes model, identity, heartbeat resolved from agents.list + agents.defaults).
      // The backend handles JSON5 parsing and default resolution — we never read raw files here.
      const [agentsConfigResult, agentsListResult] = await Promise.allSettled([
        api.get('/openclaw/agents/config'),
        api.get('/openclaw/agents'),
      ]);

      let agentsConfig = null;
      let agentEntry = null;

      if (agentsConfigResult.status === 'fulfilled') {
        agentsConfig = agentsConfigResult.value.data?.data || null;
      } else {
        logger.warn('Failed to load agents config', { error: agentsConfigResult.reason?.message });
      }

      if (agentsListResult.status === 'fulfilled') {
        const list = agentsListResult.value.data?.data || [];
        agentEntry = list.find((a) => a.id === agentId) || null;
      } else {
        logger.warn('Failed to load agents list', { error: agentsListResult.reason?.message });
      }

      if (!agentsConfig && !agentEntry) {
        showToast('Failed to load agent configuration. Please try again.', 'error');
        onClose();
        return;
      }

      const leadershipEntry = agentsConfig
        ? (agentsConfig.leadership || []).find((l) => l.id === agentId)
        : null;

      if (!leadershipEntry && !agentEntry) {
        showToast('Agent not found', 'error');
        onClose();
        return;
      }

      // Model values from enriched agent entry (already merged with agents.defaults server-side).
      // Use ?? '' so unset fields show blank — never fall back to a hardcoded UI default.
      const configuredModelPrimary = agentEntry?.model?.primary ?? '';
      const configuredFallback1   = agentEntry?.model?.fallbacks?.[0] ?? '';
      const configuredFallback2   = agentEntry?.model?.fallbacks?.[1] ?? '';
      const configuredHbModel     = agentEntry?.heartbeat?.model ?? '';

      // Inject any configured model IDs that aren't in AVAILABLE_MODELS so the selects
      // render the correct value. Do this after loadModels() may have run by merging here.
      const extraModels = [configuredModelPrimary, configuredFallback1, configuredFallback2, configuredHbModel]
        .filter(Boolean)
        .map((id) => ({ id, name: id, alias: id, provider: 'configured' }));

      if (extraModels.length > 0) {
        setAvailableModels((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = extraModels.filter((m) => !existingIds.has(m.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });
      }

      setFormData({
        // Org/display fields from agents DB metadata
        id: leadershipEntry?.id || agentId,
        title: leadershipEntry?.title || '',
        label: leadershipEntry?.label || `mosbot-${agentId}`,
        displayName: leadershipEntry?.displayName || agentEntry?.identity?.name || '',
        description: leadershipEntry?.description || agentEntry?.identity?.theme || '',
        status: 'active',
        reportsTo: leadershipEntry?.reportsTo || '',

        // OpenClaw config fields — sourced from enriched /openclaw/agents response
        workspace: agentEntry?.workspace || '',
        identityName: agentEntry?.identity?.name || leadershipEntry?.displayName || '',
        identityTheme: agentEntry?.identity?.theme || leadershipEntry?.description || '',
        identityEmoji: agentEntry?.identity?.emoji || agentEntry?.icon || leadershipEntry?.emoji || '🤖',
        modelPrimary: configuredModelPrimary,
        modelFallback1: configuredFallback1,
        modelFallback2: configuredFallback2,

        // Heartbeat
        heartbeatEnabled: !!agentEntry?.heartbeat,
        heartbeatEvery: agentEntry?.heartbeat?.every || '60m',
        heartbeatModel: configuredHbModel,
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

    if (!formData.modelPrimary) {
      showToast('Primary model is required for non-human agents', 'error');
      return;
    }

    setIsSaving(true);

    try {
      // Build payload for the API - the server handles both agents config and openclaw.json
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

      // Refresh workspace/agent dropdown sources immediately after mutation.
      await fetchAgents({ force: true });

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
                      <label className="block text-sm font-medium text-dark-300 mb-2">
                        Status <span className="text-xs text-dark-500">(lifecycle modes temporarily disabled)</span>
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) => handleChange('status', e.target.value)}
                        disabled
                        className="input-field w-full disabled:opacity-50"
                      >
                        <option value="active">Active</option>
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

                {/* OpenClaw config */}
                {(
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
                            <span className="ml-2 text-xs text-dark-500 font-normal">(auto-managed)</span>
                          </label>
                          <input
                            type="text"
                            value={formData.workspace}
                            readOnly
                            disabled
                            placeholder="Auto-generated by OpenClaw from agents.defaults.workspace"
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
                            <option value="">Select a model…</option>
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
                                <option value="">Use primary model (default)</option>
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
