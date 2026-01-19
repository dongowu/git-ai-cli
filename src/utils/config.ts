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
    outputFormat: {
      type: 'string',
      default: 'text',
    },
    rules: {
      type: 'object',
      default: {},
    },
    rulesPreset: {
      type: 'string',
      default: '',
    },
    fallbackModels: {
      type: 'array',
      default: [],
    },
    policy: {
      type: 'object',
      default: {},
    },
    branch: {
      type: 'object',
      default: {},
    },
  },
});

let lastLocalConfigError: string | null = null;

function getLocalConfigPath(): string {
  return join(process.cwd(), '.git-ai.json');
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function getLocalConfig(): Partial<AIConfig> {
  const localPath = getLocalConfigPath();
  lastLocalConfigError = null;
  if (existsSync(localPath)) {
    try {
      const content = readFileSync(localPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastLocalConfigError = message;
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

  const outputFormat = process.env.GIT_AI_OUTPUT_FORMAT;
  if (outputFormat === 'json' || outputFormat === 'text') {
    env.outputFormat = outputFormat as 'json' | 'text';
  }

  const rulesPreset = process.env.GIT_AI_RULES_PRESET;
  if (rulesPreset) env.rulesPreset = rulesPreset;

  const fallbackModelsRaw = process.env.GIT_AI_FALLBACK_MODELS;
  if (fallbackModelsRaw) {
    const models = fallbackModelsRaw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    if (models.length) env.fallbackModels = models;
  }

  const policyStrict = parseBooleanEnv(process.env.GIT_AI_POLICY_STRICT);
  if (policyStrict !== undefined) {
    env.policy = { ...(env.policy || {}), strict: policyStrict };
  }

  const branchPattern = process.env.GIT_AI_BRANCH_PATTERN;
  if (branchPattern) {
    env.branch = { ...(env.branch || {}), pattern: branchPattern };
  }
  const branchTypesRaw = process.env.GIT_AI_BRANCH_TYPES;
  if (branchTypesRaw) {
    const types = branchTypesRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (types.length) env.branch = { ...(env.branch || {}), types };
  }
  const branchIssueSep = process.env.GIT_AI_BRANCH_ISSUE_SEPARATOR;
  if (branchIssueSep) {
    env.branch = { ...(env.branch || {}), issueSeparator: branchIssueSep };
  }
  const branchMaxLenRaw = process.env.GIT_AI_BRANCH_NAME_MAXLEN;
  const branchMaxLen = branchMaxLenRaw ? Number.parseInt(branchMaxLenRaw, 10) : Number.NaN;
  if (Number.isFinite(branchMaxLen) && branchMaxLen > 0) {
    env.branch = { ...(env.branch || {}), nameMaxLength: branchMaxLen };
  }

  const issuePattern = process.env.GIT_AI_ISSUE_PATTERN;
  if (issuePattern) {
    env.rules = { ...(env.rules || {}), issuePattern };
  }

  const issuePlacement = process.env.GIT_AI_ISSUE_PLACEMENT as
    | 'scope'
    | 'subject'
    | 'footer'
    | undefined;
  if (issuePlacement === 'scope' || issuePlacement === 'subject' || issuePlacement === 'footer') {
    env.rules = { ...(env.rules || {}), issuePlacement };
  }

  const requireIssue = parseBooleanEnv(process.env.GIT_AI_REQUIRE_ISSUE);
  if (requireIssue !== undefined) {
    env.rules = { ...(env.rules || {}), requireIssue };
  }

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
    outputFormat: config.get('outputFormat'),
    rules: config.get('rules'),
    rulesPreset: config.get('rulesPreset'),
    fallbackModels: config.get('fallbackModels'),
    policy: config.get('policy'),
    branch: config.get('branch'),
  };

  const localConfig = getLocalConfig();
  const merged = { ...globalConfig, ...localConfig };
  const envConfig = getEnvConfig(merged.provider);
  const finalConfig = { ...merged, ...envConfig };
  if (merged.rules || envConfig.rules) {
    finalConfig.rules = { ...(merged.rules || {}), ...(envConfig.rules || {}) };
  }
  if (merged.policy || envConfig.policy) {
    finalConfig.policy = { ...(merged.policy || {}), ...(envConfig.policy || {}) };
  }
  if (merged.branch || envConfig.branch) {
    finalConfig.branch = { ...(merged.branch || {}), ...(envConfig.branch || {}) };
  }
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

export function getLocalConfigError(): { path: string; error: string } | null {
  if (!lastLocalConfigError) return null;
  return { path: getLocalConfigPath(), error: lastLocalConfigError };
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
