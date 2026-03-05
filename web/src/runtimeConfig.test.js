import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('runtimeConfig', () => {
  let originalRuntimeConfig;

  beforeEach(() => {
    originalRuntimeConfig = window.__RUNTIME_CONFIG__;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalRuntimeConfig === undefined) {
      delete window.__RUNTIME_CONFIG__;
    } else {
      window.__RUNTIME_CONFIG__ = originalRuntimeConfig;
    }
  });

  it('exports config with default values when no runtime config is set', async () => {
    window.__RUNTIME_CONFIG__ = {};
    const { config } = await import('./runtimeConfig');
    expect(config).toHaveProperty('apiUrl');
    expect(config).toHaveProperty('appName');
    expect(config).toHaveProperty('isApiUrlConfigured');
  });

  it('uses fallback defaults when runtime config values are empty', async () => {
    window.__RUNTIME_CONFIG__ = { VITE_API_URL: '', VITE_APP_NAME: '' };
    const { config } = await import('./runtimeConfig');
    // Empty strings are falsy, so defaults should apply
    expect(config.apiUrl).toBe('http://localhost:3000/api/v1');
    expect(config.appName).toBe('MosBot');
  });

  it('isApiUrlConfigured is false when no explicit URL is set', async () => {
    window.__RUNTIME_CONFIG__ = {};
    const { config } = await import('./runtimeConfig');
    expect(config.isApiUrlConfigured).toBe(false);
  });

  it('picks up runtime config values when set', async () => {
    window.__RUNTIME_CONFIG__ = {
      VITE_API_URL: 'https://custom.api/v1',
      VITE_APP_NAME: 'CustomBot',
    };
    const { config } = await import('./runtimeConfig');
    expect(config.apiUrl).toBe('https://custom.api/v1');
    expect(config.appName).toBe('CustomBot');
    expect(config.isApiUrlConfigured).toBe(true);
  });
});
