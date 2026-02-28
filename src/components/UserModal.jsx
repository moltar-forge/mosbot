import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function UserModal({ isOpen, onClose, user = null, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    active: true,
    // Agent-specific fields
    agentId: '',
    primaryModel: '',
    fallbackModels: '',
    emoji: '',
    theme: '',
    agentConfigJson: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (user) {
        // Edit mode - populate form
        const agentConfig = user.agentConfig || {};
        const identity = agentConfig.identity || {};
        const model = agentConfig.model || {};

        setFormData({
          name: user.name || '',
          email: user.email || '',
          password: '', // Don't populate password for edit
          role: user.role || 'user',
          active: user.active !== undefined ? user.active : true,
          // Agent-specific fields
          agentId: user.agent_id || '',
          primaryModel: model.primary || '',
          fallbackModels: Array.isArray(model.fallbacks) ? model.fallbacks.join(', ') : '',
          emoji: identity.emoji || '',
          theme: identity.theme || '',
          agentConfigJson: '',
        });
      } else {
        // Create mode - reset form
        setFormData({
          name: '',
          email: '',
          password: '',
          role: 'user',
          active: true,
          agentId: '',
          primaryModel: '',
          fallbackModels: '',
          emoji: '',
          theme: '',
          agentConfigJson: '',
        });
      }
      setError('');
      setShowAdvanced(false);
    }
  }, [user, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name || !formData.email) {
      setError('Name and email are required');
      return;
    }

    if (!user && !formData.password) {
      setError('Password is required for new users');
      return;
    }

    if (formData.password && formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare basic user data - don't send password if empty (for edit mode)
      const userData = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        active: formData.active,
      };

      if (formData.password) {
        userData.password = formData.password;
      }

      // If user is an agent or admin (admin can also have agent config), add agent-specific fields
      const isAgentOrAdminWithConfig = formData.role === 'agent' || formData.role === 'admin';
      if (isAgentOrAdminWithConfig) {
        userData.agentId = formData.agentId;

        // Build agentConfigPatch
        const agentConfigPatch = {};

        // Identity fields
        if (formData.emoji || formData.theme) {
          agentConfigPatch.identity = {};
          if (formData.emoji) agentConfigPatch.identity.emoji = formData.emoji;
          if (formData.theme) agentConfigPatch.identity.theme = formData.theme;
        }

        // Model fields
        if (formData.primaryModel || formData.fallbackModels) {
          agentConfigPatch.model = {};
          if (formData.primaryModel) {
            agentConfigPatch.model.primary = formData.primaryModel;
          }
          if (formData.fallbackModels) {
            // Split comma-separated list and trim whitespace
            agentConfigPatch.model.fallbacks = formData.fallbackModels
              .split(',')
              .map((m) => m.trim())
              .filter((m) => m.length > 0);
          }
        }

        // Advanced JSON config (if provided)
        if (formData.agentConfigJson && formData.agentConfigJson.trim()) {
          try {
            const advancedConfig = JSON.parse(formData.agentConfigJson);
            // Merge advanced config with basic fields
            Object.assign(agentConfigPatch, advancedConfig);
          } catch (jsonError) {
            setError('Invalid JSON in advanced configuration');
            setIsSubmitting(false);
            return;
          }
        }

        userData.agentConfigPatch = agentConfigPatch;
      }

      await onSave(userData, user?.id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save user');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 py-8">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-lg bg-dark-900 border border-dark-800 shadow-xl transition-all max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 pb-4 border-b border-dark-800 flex-shrink-0">
                  <Dialog.Title className="text-xl font-semibold text-dark-100">
                    {user ? 'Edit User' : 'Add New User'}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-dark-400 hover:text-dark-200 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                {/* Form - Scrollable content */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-4">
                    {/* Error Message */}
                    {error && (
                      <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
                        <p className="text-sm text-red-300">{error}</p>
                      </div>
                    )}

                    {/* Two-column layout when showing agent config (agent or admin) */}
                    <div
                      className={
                        formData.role === 'agent' || formData.role === 'admin'
                          ? 'grid grid-cols-1 lg:grid-cols-2 gap-6'
                          : ''
                      }
                    >
                      {/* Left column: Basic user fields */}
                      <div className="space-y-4">
                        {/* Name */}
                        <div>
                          <label
                            htmlFor="name"
                            className="block text-sm font-medium text-dark-300 mb-2"
                          >
                            Name *
                          </label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            required
                            value={formData.name}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="Enter full name"
                            disabled={isSubmitting}
                          />
                        </div>

                        {/* Email */}
                        <div>
                          <label
                            htmlFor="email"
                            className="block text-sm font-medium text-dark-300 mb-2"
                          >
                            Email *
                          </label>
                          <input
                            type="email"
                            id="email"
                            name="email"
                            required
                            value={formData.email}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="user@example.com"
                            disabled={isSubmitting}
                          />
                        </div>

                        {/* Password */}
                        <div>
                          <label
                            htmlFor="password"
                            className="block text-sm font-medium text-dark-300 mb-2"
                          >
                            Password {user && '(leave blank to keep current)'}
                            {!user && ' *'}
                          </label>
                          <input
                            type="password"
                            id="password"
                            name="password"
                            required={!user}
                            value={formData.password}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="••••••••"
                            disabled={isSubmitting}
                          />
                          <p className="text-xs text-dark-500 mt-1">Minimum 8 characters</p>
                        </div>

                        {/* Role */}
                        <div>
                          <label
                            htmlFor="role"
                            className="block text-sm font-medium text-dark-300 mb-2"
                          >
                            Role
                          </label>
                          <select
                            id="role"
                            name="role"
                            value={formData.role}
                            onChange={handleChange}
                            className="input-field"
                            disabled={isSubmitting || (user && user.role === 'owner')}
                          >
                            <option value="user">User</option>
                            <option value="agent">Agent</option>
                            <option value="admin">Admin</option>
                            {user && user.role === 'owner' && <option value="owner">Owner</option>}
                          </select>
                          {user && user.role === 'owner' && (
                            <p className="text-xs text-dark-500 mt-1">
                              Owner role cannot be changed
                            </p>
                          )}
                        </div>

                        {/* Active Status (only in edit mode, hidden for owner) */}
                        {user && user.role !== 'owner' && (
                          <div>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                name="active"
                                checked={formData.active}
                                onChange={handleChange}
                                className="w-4 h-4 rounded border-dark-700 bg-dark-800 text-primary-600 focus:ring-primary-500 focus:ring-2"
                                disabled={isSubmitting}
                              />
                              <span className="text-sm font-medium text-dark-300">
                                Active (user can log in)
                              </span>
                            </label>
                            <p className="text-xs text-dark-500 mt-1 ml-6">
                              Uncheck to deactivate this user account
                            </p>
                          </div>
                        )}
                      </div>
                      {/* End left column */}

                      {/* Agent-specific fields - Right column (agent or admin; admin can also be an agent) */}
                      {(formData.role === 'agent' || formData.role === 'admin') && (
                        <div className="space-y-4 lg:border-l lg:border-dark-700 lg:pl-6">
                          <div>
                            <h3 className="text-base font-semibold text-primary-400 mb-4 flex items-center gap-2">
                              <span className="text-xl">🤖</span> Agent Configuration
                            </h3>

                            {/* Agent ID */}
                            <div className="mb-4">
                              <label
                                htmlFor="agentId"
                                className="block text-sm font-medium text-dark-300 mb-2"
                              >
                                Agent ID * (slug)
                              </label>
                              <input
                                type="text"
                                id="agentId"
                                name="agentId"
                                required={formData.role === 'agent'}
                                value={formData.agentId}
                                onChange={handleChange}
                                className="input-field"
                                placeholder="coo, cto, ops-assistant"
                                disabled={isSubmitting || (user && user.agent_id)}
                                pattern="[a-z0-9_-]+"
                              />
                              <p className="text-xs text-dark-500 mt-1">
                                Lowercase, alphanumeric, hyphens, underscores only
                                {user && user.agent_id && ' (cannot be changed)'}
                              </p>
                            </div>

                            {/* Primary Model */}
                            <div className="mb-4">
                              <label
                                htmlFor="primaryModel"
                                className="block text-sm font-medium text-dark-300 mb-2"
                              >
                                Primary Model
                              </label>
                              <input
                                type="text"
                                id="primaryModel"
                                name="primaryModel"
                                value={formData.primaryModel}
                                onChange={handleChange}
                                className="input-field"
                                placeholder="openrouter/moonshotai/kimi-k2.5"
                                disabled={isSubmitting}
                              />
                              <p className="text-xs text-dark-500 mt-1">
                                OpenRouter model identifier
                              </p>
                            </div>

                            {/* Fallback Models */}
                            <div className="mb-4">
                              <label
                                htmlFor="fallbackModels"
                                className="block text-sm font-medium text-dark-300 mb-2"
                              >
                                Fallback Models (comma-separated)
                              </label>
                              <input
                                type="text"
                                id="fallbackModels"
                                name="fallbackModels"
                                value={formData.fallbackModels}
                                onChange={handleChange}
                                className="input-field"
                                placeholder="openrouter/anthropic/claude-sonnet-4.5, openrouter/openai/gpt-5.2"
                                disabled={isSubmitting}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                              {/* Emoji */}
                              <div>
                                <label
                                  htmlFor="emoji"
                                  className="block text-sm font-medium text-dark-300 mb-2"
                                >
                                  Emoji
                                </label>
                                <input
                                  type="text"
                                  id="emoji"
                                  name="emoji"
                                  value={formData.emoji}
                                  onChange={handleChange}
                                  className="input-field"
                                  placeholder="🤖"
                                  disabled={isSubmitting}
                                  maxLength={2}
                                />
                              </div>

                              {/* Theme */}
                              <div>
                                <label
                                  htmlFor="theme"
                                  className="block text-sm font-medium text-dark-300 mb-2"
                                >
                                  Theme
                                </label>
                                <input
                                  type="text"
                                  id="theme"
                                  name="theme"
                                  value={formData.theme}
                                  onChange={handleChange}
                                  className="input-field"
                                  placeholder="Chief Operating Officer"
                                  disabled={isSubmitting}
                                />
                              </div>
                            </div>

                            {/* Advanced Configuration Toggle */}
                            <div className="mt-4 pt-4 border-t border-dark-700">
                              <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="text-sm font-medium text-primary-500 hover:text-primary-400 flex items-center gap-2"
                              >
                                <span>{showAdvanced ? '▼' : '▶'}</span>
                                <span>Advanced Configuration (JSON)</span>
                              </button>

                              {/* Advanced JSON Config */}
                              {showAdvanced && (
                                <div className="mt-3">
                                  <label
                                    htmlFor="agentConfigJson"
                                    className="block text-sm font-medium text-dark-300 mb-2"
                                  >
                                    Advanced Agent Config (JSON)
                                  </label>
                                  <textarea
                                    id="agentConfigJson"
                                    name="agentConfigJson"
                                    value={formData.agentConfigJson}
                                    onChange={handleChange}
                                    className="input-field font-mono text-xs"
                                    placeholder='{"heartbeat": {"every": "30m"}, "subagents": {"model": "..."}}'
                                    disabled={isSubmitting}
                                    rows={8}
                                  />
                                  <p className="text-xs text-dark-500 mt-1">
                                    Advanced fields like heartbeat, subagents, etc. Merged with
                                    basic fields above.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* End scrollable content */}

                  {/* Actions - Fixed at bottom */}
                  <div className="flex gap-3 p-6 pt-4 border-t border-dark-800 bg-dark-900 flex-shrink-0">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 btn-secondary"
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="flex-1 btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : user ? 'Update User' : 'Create User'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
