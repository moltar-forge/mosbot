/**
 * Available AI models for agent configuration
 */

export const AVAILABLE_MODELS = [
  {
    id: 'openrouter/moonshotai/kimi-k2.5',
    name: 'Kimi K2.5',
    alias: 'kimi',
    provider: 'Moonshot AI',
  },
  {
    id: 'openrouter/deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    alias: 'deepseek',
    provider: 'DeepSeek',
  },
  {
    id: 'openrouter/google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    alias: 'flash',
    provider: 'Google',
  },
  {
    id: 'openrouter/google/gemini-2.5',
    name: 'Gemini 2.5',
    alias: 'gemini',
    provider: 'Google',
  },
  {
    id: 'openrouter/anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    alias: 'haiku',
    provider: 'Anthropic',
  },
  {
    id: 'openrouter/anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    alias: 'sonnet',
    provider: 'Anthropic',
  },
  {
    id: 'openrouter/anthropic/claude-opus-4.6',
    name: 'Claude Opus 4.6',
    alias: 'opus',
    provider: 'Anthropic',
  },
  {
    id: 'openrouter/openai/gpt-5.2',
    name: 'GPT-5.2',
    alias: 'gpt5',
    provider: 'OpenAI',
  },
  {
    id: 'openrouter/openai/gpt-4o',
    name: 'GPT-4o',
    alias: 'gpt4o',
    provider: 'OpenAI',
  },
];

export const DEFAULT_PRIMARY_MODEL = 'openrouter/anthropic/claude-sonnet-4.5';
export const DEFAULT_HEARTBEAT_MODEL = 'openrouter/moonshotai/kimi-k2.5';
