import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowPathIcon,
  CloudArrowUpIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { useAgentStore } from '../stores/agentStore';
import {
  getOpenClawConfig,
  updateOpenClawConfig,
  listOpenClawConfigBackups,
  getOpenClawConfigBackupContent,
} from '../api/client';
import logger from '../utils/logger';
import { useMobileNav } from '../components/MobileNavContext';

function formatBackupDate(name) {
  // Filename: openclaw-2026-02-23T12-34-56-789Z.json5
  const match = name.match(/openclaw-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  if (!match) return name;
  const iso = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3') + 'Z';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return name;
  return d.toLocaleString('en-SG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------
// History Drawer
// ---------------------------------------------------------------------------
function HistoryDrawer({
  isOpen,
  onClose,
  canEdit,
  backups,
  backupsLoading,
  backupsLoaded,
  onRefresh,
  selectedBackup,
  onSelectBackup,
  backupContent,
  backupContentLoading,
  onRestore,
}) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-dark-950/60" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-200"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col bg-dark-900 shadow-xl border-l border-dark-700">
                    {/* Drawer header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700 bg-dark-800">
                      <div className="flex items-center gap-2">
                        <ClockIcon className="w-5 h-5 text-primary-400" />
                        <Dialog.Title className="text-lg font-semibold text-dark-100">
                          Config History
                        </Dialog.Title>
                      </div>
                      <div className="flex items-center gap-2">
                        {backupsLoaded && (
                          <button
                            type="button"
                            onClick={onRefresh}
                            className="flex items-center gap-1.5 text-xs text-dark-400 hover:text-dark-200 transition-colors px-2 py-1 rounded hover:bg-dark-700"
                          >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                            Refresh
                          </button>
                        )}
                        <button
                          type="button"
                          className="p-2 rounded-md text-dark-400 hover:text-dark-200 hover:bg-dark-700 transition-colors"
                          onClick={onClose}
                        >
                          <span className="sr-only">Close</span>
                          <XMarkIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Drawer body */}
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                      <p className="text-xs text-dark-500 mb-4">
                        A backup is saved automatically before each successful config apply. Select
                        a snapshot to preview it, then restore it into the editor.
                      </p>

                      {backupsLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="w-7 h-7 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : backups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <ClockIcon className="w-10 h-10 text-dark-700 mb-3" />
                          <p className="text-sm text-dark-500">No backups yet.</p>
                          <p className="text-xs text-dark-600 mt-1">
                            Backups are created automatically on each save.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {backups.map((backup) => (
                            <div key={backup.path}>
                              <button
                                type="button"
                                onClick={() => onSelectBackup(backup)}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                                  selectedBackup?.path === backup.path
                                    ? 'bg-primary-600/20 text-primary-300 border border-primary-600/30'
                                    : 'text-dark-300 hover:bg-dark-800 hover:text-dark-100 border border-transparent'
                                }`}
                              >
                                <span className="flex items-center gap-2 min-w-0">
                                  <DocumentDuplicateIcon className="w-4 h-4 flex-shrink-0 text-dark-500" />
                                  <span className="truncate text-xs">
                                    {formatBackupDate(backup.name)}
                                  </span>
                                </span>
                                <span className="text-xs text-dark-600 flex-shrink-0 ml-2">
                                  {formatBytes(backup.size)}
                                </span>
                              </button>

                              {/* Expanded preview */}
                              {selectedBackup?.path === backup.path && (
                                <div className="mt-1 p-3 bg-dark-800 rounded-lg border border-dark-700">
                                  {backupContentLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-dark-400 py-2">
                                      <div className="w-3 h-3 border border-dark-400 border-t-transparent rounded-full animate-spin" />
                                      Loading…
                                    </div>
                                  ) : (
                                    <>
                                      <pre className="text-xs text-dark-300 overflow-x-auto max-h-64 whitespace-pre-wrap break-words leading-relaxed">
                                        {backupContent || '(empty)'}
                                      </pre>
                                      <div className="mt-3 flex justify-end">
                                        <button
                                          type="button"
                                          onClick={onRestore}
                                          disabled={!canEdit || !backupContent}
                                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          <ArrowPathIcon className="w-3.5 h-3.5" />
                                          Restore into editor
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function OpenClawConfigSettings() {
  const { user } = useAuthStore();
  const { showToast } = useToastStore();
  const fetchAgents = useAgentStore((state) => state.fetchAgents);
  const onOpenNav = useMobileNav();

  const canEdit = useMemo(() => user?.role === 'admin' || user?.role === 'owner', [user]);

  // Editor state
  const [raw, setRaw] = useState('');
  const [baseHash, setBaseHash] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveValidationDetails, setSaveValidationDetails] = useState(null);
  const [conflictData, setConflictData] = useState(null);
  const [note, setNote] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [originalRaw, setOriginalRaw] = useState('');

  // History drawer state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [backupContent, setBackupContent] = useState('');
  const [backupContentLoading, setBackupContentLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    setSaveError('');
    setSaveValidationDetails(null);
    setConflictData(null);
    try {
      const data = await getOpenClawConfig();
      setRaw(data.raw || '');
      setOriginalRaw(data.raw || '');
      setBaseHash(data.hash);
      setIsDirty(false);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to load config';
      setLoadError(msg);
      logger.error('Failed to load OpenClaw config', { error: err.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const data = await listOpenClawConfigBackups();
      setBackups(data || []);
      setBackupsLoaded(true);
    } catch (err) {
      logger.warn('Failed to load config backups', { error: err.message });
      setBackups([]);
      setBackupsLoaded(true);
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  const handleOpenHistory = () => {
    setHistoryOpen(true);
    if (!backupsLoaded) {
      loadBackups();
    }
  };

  const handleCloseHistory = () => {
    setHistoryOpen(false);
    setSelectedBackup(null);
    setBackupContent('');
  };

  const handleRefreshBackups = () => {
    setBackupsLoaded(false);
    setSelectedBackup(null);
    setBackupContent('');
    loadBackups();
  };

  const handleSelectBackup = async (backup) => {
    if (selectedBackup?.path === backup.path) {
      setSelectedBackup(null);
      setBackupContent('');
      return;
    }
    setSelectedBackup(backup);
    setBackupContent('');
    setBackupContentLoading(true);
    try {
      const data = await getOpenClawConfigBackupContent(backup.path);
      setBackupContent(data?.content || '');
    } catch (err) {
      showToast('Failed to load backup content', 'error');
      logger.warn('Failed to load backup content', { path: backup.path, error: err.message });
    } finally {
      setBackupContentLoading(false);
    }
  };

  const handleRestoreBackup = () => {
    if (!backupContent) return;
    setRaw(backupContent);
    setIsDirty(backupContent !== originalRaw);
    handleCloseHistory();
    showToast('Backup loaded into editor. Review and save to apply.', 'info');
  };

  const editorRef = useRef(null);

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    // Allow JSON5 syntax (comments, trailing commas) without squiggles.
    // Real structural errors (mismatched braces, malformed values) still show.
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      trailingCommas: 'ignore',
    });
  };

  const handleEditorChange = (value) => {
    const next = value ?? '';
    setRaw(next);
    setIsDirty(next !== originalRaw);
    setSaveError('');
    setSaveValidationDetails(null);
    setConflictData(null);
  };

  const hasRedactedValues = raw.includes('__OPENCLAW_REDACTED__');

  const handleSave = async () => {
    if (isSaving || !canEdit) return;
    setSaveError('');
    setSaveValidationDetails(null);
    setConflictData(null);
    setIsSaving(true);
    try {
      const result = await updateOpenClawConfig({ raw, baseHash, note: note.trim() || undefined });
      setBaseHash(result.hash);
      setOriginalRaw(raw);
      setIsDirty(false);
      setNote('');
      // Invalidate backup list so it reloads next time the drawer opens
      setBackupsLoaded(false);
      setBackups([]);
      // Refresh dynamic agent/workspace lists after config apply.
      await fetchAgents({ force: true });

      showToast('Config applied successfully. Gateway is restarting.', 'success');
      logger.info('OpenClaw config saved', { hash: result.hash, backupPath: result.backupPath });
    } catch (err) {
      const status = err.response?.status;
      const errData = err.response?.data;

      if (status === 409) {
        setConflictData(errData?.data || null);
        setSaveError(errData?.error?.message || 'Config conflict detected.');
      } else if (status === 400) {
        setSaveError(errData?.error?.message || 'Config validation failed.');
        setSaveValidationDetails(errData?.error?.details || null);
      } else {
        setSaveError(errData?.error?.message || err.message || 'Failed to save config.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReloadLatest = async () => {
    await loadConfig();
    showToast('Reloaded latest config from gateway.', 'info');
  };

  const handleRebaseFromConflict = () => {
    if (!conflictData) return;
    setRaw(conflictData.raw || '');
    setBaseHash(conflictData.hash);
    setOriginalRaw(conflictData.raw || '');
    setIsDirty(false);
    setConflictData(null);
    setSaveError('');
    showToast('Editor updated to latest config. Re-apply your changes manually.', 'info');
  };

  // Check if error is about origin not being allowed
  const isOriginError = useMemo(() => {
    return (
      loadError &&
      (loadError.toLowerCase().includes('origin not allowed') ||
        loadError.toLowerCase().includes('allowedorigins') ||
        loadError.toLowerCase().includes('control ui'))
    );
  }, [loadError]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-dark-900 border-b border-dark-800">
        <div className="flex items-center gap-3">
          {onOpenNav && (
            <button
              type="button"
              className="md:hidden p-2 -ml-2 rounded-lg text-dark-300 hover:text-dark-100 hover:bg-dark-800 transition-colors"
              onClick={onOpenNav}
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-xl md:text-2xl font-bold text-dark-100">OpenClaw Config</h1>
            <p className="text-sm text-dark-500">Edit the live openclaw.json configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReloadLatest}
            disabled={isLoading || isSaving}
            className="flex items-center gap-2 px-3 py-2 text-sm text-dark-300 hover:text-dark-100 hover:bg-dark-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reload latest config from gateway"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reload</span>
          </button>
          <button
            type="button"
            onClick={handleOpenHistory}
            className="flex items-center gap-2 px-3 py-2 text-sm text-dark-300 hover:text-dark-100 hover:bg-dark-800 rounded-lg transition-colors"
            title="View config history"
          >
            <ClockIcon className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4">
        {/* Access restriction notice for non-admin/owner */}
        {!canEdit && (
          <div className="flex items-start gap-3 p-4 bg-amber-900/20 border border-amber-800/50 rounded-lg">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">
              You have read-only access. Admin or owner role is required to edit the config.
            </p>
          </div>
        )}

        {/* Load error */}
        {loadError && (
          <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-800/50 rounded-lg">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-300 break-words">{loadError}</p>
              {isOriginError && (
                <div className="mt-3 pt-3 border-t border-red-800/50 space-y-2">
                  <p className="text-xs text-red-400">
                    The MosBot API&apos;s WebSocket connection to OpenClaw is being rejected. The
                    API sends its own origin header (derived from{' '}
                    <code className="font-mono bg-red-950/40 px-1 rounded text-red-300">
                      OPENCLAW_GATEWAY_URL
                    </code>
                    ) when connecting, and that origin must be in{' '}
                    <code className="font-mono bg-red-950/40 px-1 rounded text-red-300">
                      gateway.controlUi.allowedOrigins
                    </code>
                    .
                  </p>
                  <p className="text-xs text-red-400">
                    Add the MosBot API&apos;s gateway URL origin to your OpenClaw config. For
                    example, if your{' '}
                    <code className="font-mono bg-red-950/40 px-1 rounded text-red-300">
                      OPENCLAW_GATEWAY_URL
                    </code>{' '}
                    is{' '}
                    <code className="font-mono bg-red-950/40 px-1 rounded text-red-300">
                      https://openclaw.your-namespace.svc.cluster.local:18789
                    </code>
                    , add that as an allowed origin.
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={loadConfig}
              className="text-xs text-red-400 hover:text-red-200 underline flex-shrink-0 whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* Conflict banner */}
        {conflictData && (
          <div className="flex items-start gap-3 p-4 bg-orange-900/20 border border-orange-800/50 rounded-lg">
            <ExclamationTriangleIcon className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-orange-300">Config conflict detected</p>
              <p className="text-xs text-orange-400 mt-1">
                The config was modified externally since you loaded it. Reload the latest version
                and re-apply your changes manually.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRebaseFromConflict}
              className="text-xs text-orange-300 hover:text-orange-100 underline flex-shrink-0"
            >
              Load latest
            </button>
          </div>
        )}

        {/* Save validation error */}
        {saveError && !conflictData && (
          <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-800/50 rounded-lg">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-300">{saveError}</p>
              {saveValidationDetails && (
                <pre className="mt-2 text-xs text-red-400 bg-red-950/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                  {typeof saveValidationDetails === 'string'
                    ? saveValidationDetails
                    : JSON.stringify(saveValidationDetails, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Editor card */}
        <div className="card p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-dark-100">openclaw.json</h2>
              <p className="text-xs text-dark-500 mt-0.5">
                JSON5 format — changes are validated by the Gateway before being applied. The
                Gateway will restart automatically after a successful save.
              </p>
            </div>
            {isDirty && (
              <span className="text-xs px-2 py-1 bg-amber-900/30 text-amber-300 rounded">
                Unsaved changes
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div
                className={`w-full rounded-lg border overflow-hidden transition-colors ${
                  !canEdit || isSaving
                    ? 'opacity-60 border-dark-700'
                    : 'border-dark-700 hover:border-dark-600'
                }`}
                style={{ height: 'max(50vh, 300px)' }}
              >
                <Editor
                  height="100%"
                  language="json"
                  theme="vs-dark"
                  value={raw}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  options={{
                    readOnly: !canEdit || isSaving,
                    fontSize: 13,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                    lineNumbers: 'on',
                    renderLineHighlight: 'line',
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    folding: true,
                    automaticLayout: true,
                    padding: { top: 12, bottom: 12 },
                  }}
                />
              </div>

              {canEdit && hasRedactedValues && (
                <div className="mt-4 flex items-start gap-3 p-3 bg-dark-800/60 border border-dark-700 rounded-lg">
                  <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-dark-400">
                    Sensitive values shown as{' '}
                    <code className="font-mono bg-dark-700 px-1 rounded text-dark-300">
                      __OPENCLAW_REDACTED__
                    </code>{' '}
                    will be automatically restored from the live config on save — you don&apos;t
                    need to fill them in. To change a secret, replace the placeholder with the new
                    value.
                  </p>
                </div>
              )}

              {canEdit && (
                <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={isSaving}
                    placeholder="Optional: describe what you changed…"
                    className="flex-1 text-sm bg-dark-800 border border-dark-700 text-dark-200 placeholder-dark-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:opacity-50"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    {isSaving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Applying…
                      </>
                    ) : (
                      <>
                        <CloudArrowUpIcon className="w-4 h-4" />
                        Save &amp; Apply
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Hash info */}
              {baseHash && <p className="mt-3 text-xs text-dark-600 font-mono">hash: {baseHash}</p>}
            </>
          )}
        </div>

        {/* Safety notice */}
        <div className="flex items-start gap-3 p-4 bg-dark-800/50 border border-dark-700 rounded-lg">
          <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-dark-400 space-y-1">
            <p className="font-medium text-dark-300">Failsafe save flow</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>A backup of the current config is written before any change is applied.</li>
              <li>The Gateway validates the new config against its schema before writing it.</li>
              <li>If validation fails, the existing config is untouched.</li>
              <li>A conflict check prevents clobbering concurrent edits.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* History drawer */}
      <HistoryDrawer
        isOpen={historyOpen}
        onClose={handleCloseHistory}
        canEdit={canEdit}
        backups={backups}
        backupsLoading={backupsLoading}
        backupsLoaded={backupsLoaded}
        onRefresh={handleRefreshBackups}
        selectedBackup={selectedBackup}
        onSelectBackup={handleSelectBackup}
        backupContent={backupContent}
        backupContentLoading={backupContentLoading}
        onRestore={handleRestoreBackup}
      />
    </div>
  );
}
