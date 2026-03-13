import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { getOpenClawIntegrationStatus } from '../api/client';

const PAIRING_ROUTE = '/settings/openclaw-pairing';

export default function ProtectedRoute() {
  const { user, isAuthenticated, isLoading, isInitialized } = useAuthStore();
  const location = useLocation();
  const [integrationReady, setIntegrationReady] = useState(true);
  const [integrationCheckDone, setIntegrationCheckDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkIntegration = async () => {
      if (!isAuthenticated) {
        if (!cancelled) {
          setIntegrationReady(true);
          setIntegrationCheckDone(false);
        }
        return;
      }

      // Only enforce pairing gate for admin/owner users.
      const role = user?.role;
      const mustEnforcePairing = role === 'admin' || role === 'owner';
      if (!mustEnforcePairing) {
        if (!cancelled) {
          setIntegrationReady(true);
          setIntegrationCheckDone(true);
        }
        return;
      }

      try {
        const status = await getOpenClawIntegrationStatus();
        if (cancelled) return;
        setIntegrationReady(status?.ready === true);
      } catch (_error) {
        if (cancelled) return;
        setIntegrationReady(false);
      } finally {
        if (!cancelled) {
          setIntegrationCheckDone(true);
        }
      }
    };

    checkIntegration();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.role]);

  // Wait for initialization to complete before checking auth
  if (!isInitialized || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-950">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-dark-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login, but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!integrationCheckDone) {
    return (
      <div className="flex items-center justify-center h-screen bg-dark-950">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-dark-400">Checking OpenClaw pairing...</p>
        </div>
      </div>
    );
  }

  if (!integrationReady && location.pathname !== PAIRING_ROUTE) {
    return <Navigate to={PAIRING_ROUTE} state={{ from: location }} replace />;
  }

  return <Outlet />;
}
