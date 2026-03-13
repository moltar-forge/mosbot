import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowPathIcon, ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import {
  finalizeOpenClawPairing,
  getOpenClawIntegrationStatus,
  startOpenClawPairing,
} from '../api/client';

export default function OpenClawPairingSetup() {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState('');
  const isMountedRef = useRef(true);

  const loadStatus = async () => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await getOpenClawIntegrationStatus();
      if (!isMountedRef.current) return;
      setStatus(data);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load pairing status');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadStatus();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleStartPairing = async () => {
    if (!isMountedRef.current) return;
    setIsStarting(true);
    setError('');
    try {
      const data = await startOpenClawPairing();
      if (!isMountedRef.current) return;
      setStatus(data);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.response?.data?.error?.message || err.message || 'Failed to start pairing');
    } finally {
      if (isMountedRef.current) {
        setIsStarting(false);
      }
    }
  };

  const handleFinalizePairing = async () => {
    if (!isMountedRef.current) return;
    setIsFinalizing(true);
    setError('');
    try {
      const data = await finalizeOpenClawPairing();
      if (!isMountedRef.current) return;
      setStatus(data);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err?.response?.data?.error?.message || err.message || 'Failed to finalize pairing');
    } finally {
      if (isMountedRef.current) {
        setIsFinalizing(false);
      }
    }
  };

  const missingScopes = status?.missingScopes || [];
  const statusValue = status?.status || 'unknown';

  const hasStartedPairing = ['pending_pairing', 'paired_missing_scopes', 'ready'].includes(statusValue);
  const shouldDisableStart = isStarting || isLoading || hasStartedPairing;

  const startButtonLabel = isStarting
    ? 'Starting…'
    : statusValue === 'ready'
      ? 'Already paired'
      : hasStartedPairing
        ? 'Pairing already started'
        : 'Start pairing';

  const nextStepHint =
    statusValue === 'pending_pairing'
      ? 'Next: approve the pending device in OpenClaw, then click Finalize pairing.'
      : statusValue === 'paired_missing_scopes'
        ? 'Pairing exists, but required scopes are missing. Re-approve/rotate scopes in OpenClaw, then finalize again.'
        : statusValue === 'ready'
          ? 'Pairing is complete. Continue to OpenClaw Config.'
          : 'Start pairing to create a pending device request.';

  const step1State = statusValue === 'ready' || hasStartedPairing ? 'done' : 'current';
  const step2State = ['paired_missing_scopes', 'ready'].includes(statusValue)
    ? 'done'
    : statusValue === 'pending_pairing'
      ? 'current'
      : 'upcoming';
  const step3State = statusValue === 'ready' ? 'done' : statusValue === 'paired_missing_scopes' ? 'current' : 'upcoming';

  const stepBadgeClass = {
    done: 'bg-green-900/30 text-green-300 border-green-700/60',
    current: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/60',
    upcoming: 'bg-dark-900/40 text-dark-400 border-dark-700',
  };

  const finalizeDisabled = isFinalizing || isLoading || !hasStartedPairing;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="card p-6 border border-yellow-700/50 bg-yellow-950/20">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-yellow-400 mt-0.5" />
          <div>
            <h1 className="text-xl font-semibold text-yellow-100">OpenClaw Pairing Required</h1>
            <p className="text-sm text-yellow-200 mt-2">
              MosBot is locked until OpenClaw integration pairing is completed with required
              operator scopes.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-dark-100">Integration readiness</h2>
          <button
            type="button"
            onClick={loadStatus}
            className="btn-secondary inline-flex items-center gap-2"
            disabled={isLoading}
          >
            <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-dark-400">Checking pairing status…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <div className="space-y-4">
            <div className="text-sm">
              <span className="text-dark-400">Status:</span>{' '}
              <span className="font-medium text-dark-100">{status?.status || 'unknown'}</span>
            </div>

            <div className="text-sm">
              <span className="text-dark-400">Ready:</span>{' '}
              <span className={`font-medium ${status?.ready ? 'text-green-400' : 'text-yellow-300'}`}>
                {status?.ready ? 'Yes' : 'No'}
              </span>
            </div>

            {missingScopes.length > 0 && (
              <div>
                <div className="text-sm text-dark-300 mb-2">Missing required scopes:</div>
                <div className="flex flex-wrap gap-2">
                  {missingScopes.map((scope) => (
                    <span
                      key={scope}
                      className="px-2 py-1 rounded text-xs bg-red-900/30 text-red-300 border border-red-700/50"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {status?.ready && (
              <div className="inline-flex items-center gap-2 text-sm text-green-300 bg-green-900/20 border border-green-700/50 px-3 py-2 rounded">
                <ShieldCheckIcon className="w-4 h-4" />
                Pairing is valid. You can continue to OpenClaw settings.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 space-y-4">
        <div className="font-medium text-dark-200">Pairing wizard</div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="border border-dark-700 rounded p-3 space-y-2 bg-dark-900/20">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-dark-100">Step 1: Start</div>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${stepBadgeClass[step1State]}`}>
                {step1State}
              </span>
            </div>
            <p className="text-xs text-dark-400">Create MosBot device identity and open a pairing request.</p>
            <button className="btn-primary w-full" onClick={handleStartPairing} disabled={shouldDisableStart}>
              {startButtonLabel}
            </button>
          </div>

          <div className="border border-dark-700 rounded p-3 space-y-2 bg-dark-900/20">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-dark-100">Step 2: Approve</div>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${stepBadgeClass[step2State]}`}>
                {step2State}
              </span>
            </div>
            <p className="text-xs text-dark-400">
              Approve the pending device request in OpenClaw operator controls.
            </p>
          </div>

          <div className="border border-dark-700 rounded p-3 space-y-2 bg-dark-900/20">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-dark-100">Step 3: Finalize</div>
              <span className={`text-[11px] px-2 py-0.5 rounded border ${stepBadgeClass[step3State]}`}>
                {step3State}
              </span>
            </div>
            <p className="text-xs text-dark-400">Validate required scopes and unlock MosBot UI.</p>
            <button className="btn-secondary w-full" onClick={handleFinalizePairing} disabled={finalizeDisabled}>
              {isFinalizing ? 'Finalizing…' : 'Finalize pairing'}
            </button>
          </div>
        </div>

        <div className="text-xs text-dark-400 bg-dark-900/40 border border-dark-700 rounded px-3 py-2">
          <span className="text-dark-300">Current status:</span> {statusValue} — {nextStepHint}
        </div>
      </div>

      {status?.ready && (
        <div>
          <Link to="/settings/openclaw-config" className="btn-primary">
            Continue to OpenClaw Config
          </Link>
        </div>
      )}
    </div>
  );
}
