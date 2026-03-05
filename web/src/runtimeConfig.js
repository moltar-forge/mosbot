/**
 * Runtime configuration.
 *
 * In production, values are injected into window.__RUNTIME_CONFIG__ by
 * docker-entrypoint.sh at container startup. In development, they fall
 * through to import.meta.env (Vite dev server).
 */

const runtimeConfig = window.__RUNTIME_CONFIG__ || {};

// Helper: use runtime value if non-empty, else fall back to Vite env / default.
const get = (key, fallback) => runtimeConfig[key] || import.meta.env[key] || fallback;

// True when the API URL was explicitly set (runtime or Vite env), not just the default.
const isApiUrlConfigured = Boolean(runtimeConfig.VITE_API_URL || import.meta.env.VITE_API_URL);

export const config = {
  apiUrl: get('VITE_API_URL', 'http://localhost:3000/api/v1'),
  appName: get('VITE_APP_NAME', 'MosBot'),
  isApiUrlConfigured,
};
