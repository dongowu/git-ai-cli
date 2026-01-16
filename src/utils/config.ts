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
    agentModel: {
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
    enableFooter: {
      type: 'boolean',
      default: true,
    },
  },
});

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

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

function getEnvConfig(baseProvider?: string): Partial<AIConfig> {
  const env: Partial<AIConfig> = {};

  const provider = process.env.GIT_AI_PROVIDER || process.env.OCO_AI_PROVIDER;
  const inferredProvider = provider || baseProvider;
  if (provider) env.provider = provider;

  const apiKey =
    process.env.GIT_AI_API_KEY ||
    process.env.OCO_API_KEY ||
    (inferredProvider === 'deepseek' ? process.env.DEEPSEEK_API_KEY : undefined) ||
    (inferredProvider === 'openai' ? process.env.OPENAI_API_KEY : undefined);
  if (apiKey) env.apiKey = apiKey;

  const baseUrl = process.env.GIT_AI_BASE_URL;
  if (baseUrl) env.baseUrl = baseUrl;

  const model = process.env.GIT_AI_MODEL || process.env.OCO_MODEL;
  if (model) env.model = model;

  const agentModel = process.env.GIT_AI_AGENT_MODEL;
  if (agentModel) env.agentModel = agentModel;

  const localeRaw = process.env.GIT_AI_LOCALE;
  if (localeRaw === 'zh' || localeRaw === 'en') env.locale = localeRaw as 'zh' | 'en';

  const customPrompt = process.env.GIT_AI_CUSTOM_PROMPT;
  if (customPrompt) env.customPrompt = customPrompt;

  const enableFooter = parseBooleanEnv(process.env.GIT_AI_ENABLE_FOOTER);
  if (enableFooter !== undefined) env.enableFooter = enableFooter;

  return env;
}

export function getMergedConfig(): Partial<AIConfig> {
  const globalConfig = {
    provider: config.get('provider'),
    apiKey: config.get('apiKey'),
    baseUrl: config.get('baseUrl'),
    model: config.get('model'),
    agentModel: config.get('agentModel'),
    locale: config.get('locale'),
    customPrompt: config.get('customPrompt'),
    enableFooter: config.get('enableFooter'),
  };

  const localConfig = getLocalConfig();
  const merged = { ...globalConfig, ...localConfig };
  const envConfig = getEnvConfig(merged.provider);
  const finalConfig = { ...merged, ...envConfig };
  return finalConfig;
}

export function getConfig(): AIConfig | null {
  const finalConfig = getMergedConfig();

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
