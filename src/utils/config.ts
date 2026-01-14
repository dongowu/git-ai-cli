import Conf from 'conf';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
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

function getLocalConfig(): Partial<AIConfig> {
  const localPath = join(process.cwd(), '.git-ai.json');
  if (existsSync(localPath)) {
    try {
      const content = readFileSync(localPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // Ignore invalid config
    }
  }
  return {};
}

export function getConfig(): AIConfig | null {
  const globalConfig = {
    provider: config.get('provider'),
    apiKey: config.get('apiKey'),
    baseUrl: config.get('baseUrl'),
    model: config.get('model'),
    locale: config.get('locale'),
    customPrompt: config.get('customPrompt'),
    enableFooter: config.get('enableFooter'),
  };

  const localConfig = getLocalConfig();
  const finalConfig = { ...globalConfig, ...localConfig };

  // Provider is mandatory (either global or local)
  if (!finalConfig.provider) {
    return null;
  }

  return finalConfig as AIConfig;
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
