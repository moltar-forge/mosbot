import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowPathIcon, ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { getOpenClawIntegrationStatus } from '../api/client';

export default function OpenClawPairingSetup() {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStatus = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getOpenClawIntegrationStatus();
      setStatus(data);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Failed to load pairing status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const missingScopes = status?.missingScopes || [];

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

      <div className="text-sm text-dark-400">
        Wizard actions (start pairing, approve flow, finalize) are being wired in this branch.
        For now, complete pairing from the operator side and refresh this page.
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
