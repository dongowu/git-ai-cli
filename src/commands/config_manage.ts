import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigPath, getMergedConfig, getLocalConfigError, setConfig } from '../utils/config.js';
import type { AIConfig } from '../types.js';

export interface ConfigGetOptions {
  json?: boolean;
  local?: boolean;
}

export interface ConfigSetOptions {
  local?: boolean;
  json?: boolean;
}

function getLocalConfigPath(): string {
  return join(process.cwd(), '.git-ai.json');
}

function safeReadLocalConfig(): Record<string, unknown> {
  const localPath = getLocalConfigPath();
  if (!existsSync(localPath)) return {};
  try {
    const raw = readFileSync(localPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function safeWriteLocalConfig(data: Record<string, unknown>): void {
  const localPath = getLocalConfigPath();
  const json = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(localPath, json, 'utf-8');
}

function maskSecret(secret: unknown): string {
  if (typeof secret !== 'string') return '';
  const s = secret.trim();
  if (!s) return '';
  if (s.length <= 8) return '********';
  return `${s.slice(0, 2)}****${s.slice(-2)}`;
}

function parseValue(key: string, value: string): unknown {
  if (key === 'enableFooter') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return value;
  }
  return value;
}

function isValidKey(key: string): key is keyof AIConfig {
  return (
    key === 'provider' ||
    key === 'apiKey' ||
    key === 'baseUrl' ||
    key === 'model' ||
    key === 'agentModel' ||
    key === 'locale' ||
    key === 'customPrompt' ||
    key === 'enableFooter'
  );
}

function redactConfigForDisplay(cfg: Partial<AIConfig>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...cfg };
  if ('apiKey' in out) out.apiKey = maskSecret(out.apiKey);
  return out;
}

export function runConfigDescribe(options: { json?: boolean } = {}): void {
  const payload = {
    configPath: getConfigPath(),
    localConfigPath: getLocalConfigPath(),
    keys: [
      'provider',
      'apiKey',
      'baseUrl',
      'model',
      'agentModel',
      'locale',
      'customPrompt',
      'enableFooter',
    ],
    env: {
      provider: ['GIT_AI_PROVIDER', 'OCO_AI_PROVIDER'],
      apiKey: ['GIT_AI_API_KEY', 'OCO_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY'],
      baseUrl: ['GIT_AI_BASE_URL'],
      model: ['GIT_AI_MODEL', 'OCO_MODEL'],
      agentModel: ['GIT_AI_AGENT_MODEL'],
      locale: ['GIT_AI_LOCALE'],
      enableFooter: ['GIT_AI_ENABLE_FOOTER'],
      customPrompt: ['GIT_AI_CUSTOM_PROMPT'],
      maxDiffChars: ['GIT_AI_MAX_DIFF_CHARS', 'OCO_TOKENS_MAX_INPUT (approx)'],
      maxOutputTokens: ['GIT_AI_MAX_OUTPUT_TOKENS', 'OCO_TOKENS_MAX_OUTPUT'],
      timeoutMs: ['GIT_AI_TIMEOUT_MS'],
      debug: ['GIT_AI_DEBUG'],
      autoAgent: ['GIT_AI_AUTO_AGENT', 'GIT_AI_DISABLE_AGENT', 'GIT_AI_AGENT_STRATEGY'],
      recentCommits: ['GIT_AI_RECENT_COMMITS_ALL', 'GIT_AI_RECENT_COMMITS_FALLBACK'],
      updateCheck: ['GIT_AI_DISABLE_UPDATE', 'GIT_AI_NO_UPDATE', 'GIT_AI_UPDATE_INTERVAL_HOURS'],
      msgDelimiter: ['GIT_AI_MSG_DELIM'],
    },
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.cyan('\n🛠️  git-ai configuration (describe)\n'));
  console.log(chalk.gray(`Global config path: ${payload.configPath}`));
  console.log(chalk.gray(`Local config path : ${payload.localConfigPath}`));
  console.log(chalk.cyan('\nKeys:'));
  payload.keys.forEach((k) => console.log(chalk.gray(`  - ${k}`)));
  console.log(chalk.cyan('\nEnvironment overrides:'));
  Object.entries(payload.env).forEach(([k, vars]) => {
    console.log(chalk.gray(`  - ${k}: ${vars.join(', ')}`));
  });
  console.log('');
}

export function runConfigGet(options: ConfigGetOptions = {}): void {
  const effective = getMergedConfig();
  const local = safeReadLocalConfig();
  const localError = getLocalConfigError();

  const payload = {
    configPath: getConfigPath(),
    localConfigPath: getLocalConfigPath(),
    effective: redactConfigForDisplay(effective),
    local: options.local ? local : undefined,
    localError: localError ? { path: localError.path, error: localError.error } : undefined,
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(chalk.cyan('\n🔧 git-ai configuration\n'));
  console.log(chalk.gray(`Global config path: ${payload.configPath}`));
  console.log(chalk.gray(`Local config path : ${payload.localConfigPath}`));
  if (payload.localError) {
    console.log(
      chalk.yellow(`⚠️  Failed to parse ${payload.localError.path}: ${payload.localError.error}`)
    );
  }
  console.log(chalk.cyan('\nEffective config:'));
  Object.entries(payload.effective).forEach(([k, v]) => {
    if (v === undefined || v === '') return;
    console.log(chalk.gray(`  ${k}: ${String(v)}`));
  });

  if (options.local) {
    console.log(chalk.cyan('\nLocal .git-ai.json:'));
    if (Object.keys(local).length === 0) {
      console.log(chalk.gray('  (not set)'));
    } else {
      Object.entries(local).forEach(([k, v]) => console.log(chalk.gray(`  ${k}: ${String(v)}`)));
    }
  }
  console.log('');
}

export function runConfigSet(key: string, value: string, options: ConfigSetOptions = {}): void {
  if (!isValidKey(key)) {
    const msg = `Unknown config key: ${key}`;
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg }, null, 2));
    } else {
      console.error(chalk.red(`✗ ${msg}`));
    }
    process.exit(1);
  }

  const parsedValue = parseValue(key, value);

  if (options.local) {
    const data = safeReadLocalConfig();
    data[key] = parsedValue;
    safeWriteLocalConfig(data);

    if (options.json) {
      console.log(JSON.stringify({ success: true, scope: 'local', key, value: parsedValue }, null, 2));
    } else {
      console.log(chalk.green(`✓ Set local ${key}`));
      console.log(chalk.gray(`  ${getLocalConfigPath()}`));
    }
    return;
  }

  setConfig({ [key]: parsedValue } as Partial<AIConfig>);
  if (options.json) {
    console.log(JSON.stringify({ success: true, scope: 'global', key, value: parsedValue }, null, 2));
  } else {
    console.log(chalk.green(`✓ Set ${key}`));
    console.log(chalk.gray(`  ${getConfigPath()}`));
  }
}
