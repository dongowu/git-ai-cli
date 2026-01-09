import Conf from 'conf';
import type { AIConfig } from '../types.js';

const config = new Conf<AIConfig>({
  projectName: 'git-ai-cli',
  schema: {
    provider: {
      type: 'string',
      default: '',
    },
    apiKey: {
      type: 'string',
      default: '',
    },
    baseUrl: {
      type: 'string',
      default: '',
    },
    model: {
      type: 'string',
      default: '',
    },
    locale: {
      type: 'string',
      enum: ['zh', 'en'],
      default: 'en',
    },
    customPrompt: {
      type: 'string',
      default: '',
    },
  },
});

export function getConfig(): AIConfig | null {
  const provider = config.get('provider');
  if (!provider) {
    return null;
  }
  return {
    provider: config.get('provider'),
    apiKey: config.get('apiKey'),
    baseUrl: config.get('baseUrl'),
    model: config.get('model'),
    locale: config.get('locale'),
    customPrompt: config.get('customPrompt'),
  };
}

export function setConfig(newConfig: Partial<AIConfig>): void {
  for (const [key, value] of Object.entries(newConfig)) {
    if (value !== undefined) {
      config.set(key as keyof AIConfig, value);
    }
  }
}

export function clearConfig(): void {
  config.clear();
}

export function getConfigPath(): string {
  return config.path;
}
