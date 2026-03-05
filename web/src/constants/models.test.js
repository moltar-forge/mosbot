import { describe, it, expect } from 'vitest';
import { AVAILABLE_MODELS, DEFAULT_PRIMARY_MODEL, DEFAULT_HEARTBEAT_MODEL } from './models';

describe('models', () => {
  it('exports AVAILABLE_MODELS with expected structure', () => {
    expect(Array.isArray(AVAILABLE_MODELS)).toBe(true);
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    AVAILABLE_MODELS.forEach((model) => {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('name');
      expect(model).toHaveProperty('alias');
      expect(model).toHaveProperty('provider');
    });
  });

  it('exports DEFAULT_PRIMARY_MODEL', () => {
    expect(DEFAULT_PRIMARY_MODEL).toBe('openrouter/anthropic/claude-sonnet-4.5');
  });

  it('exports DEFAULT_HEARTBEAT_MODEL', () => {
    expect(DEFAULT_HEARTBEAT_MODEL).toBe('openrouter/moonshotai/kimi-k2.5');
  });
});
