import OpenAI from 'openai';
import type { AIConfig, CommitRules } from '../types.js';
import { runAgentLoop } from './agent.js';
import { runAgentLite } from './agent_lite.js';
import { getFileStats } from './git.js';
import chalk from 'chalk';

function getTimeoutMs(): number {
  const raw = process.env.GIT_AI_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 120_000; // 2 minutes
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function getMaxOutputTokens(numChoices: number): number {
  const raw = process.env.GIT_AI_MAX_OUTPUT_TOKENS || process.env.OCO_TOKENS_MAX_OUTPUT;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const base = Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
  return base * Math.max(numChoices, 1);
}

function getModelCandidates(config: AIConfig): string[] {
  const primary = (config.model || '').trim();
  const fallbacks = Array.isArray(config.fallbackModels) ? config.fallbackModels : [];
  const cleaned = fallbacks.map((m) => String(m).trim()).filter(Boolean);
  const unique = [primary, ...cleaned.filter((m) => m && m !== primary)];
  return unique.filter(Boolean);
}

function redactSecrets(input: string): string {
  if (!input) return input;

  // Generic "api key: xxxx" patterns.
  let out = input.replace(/(api[_ -]?key\s*[:=]\s*)([^\s,;]+)/gi, (_m, p1, p2) => {
    const s = String(p2);
    if (s.length <= 8) return `${p1}********`;
    return `${p1}${s.slice(0, 2)}****${s.slice(-2)}`;
  });

  // Common OpenAI-style keys: sk-...
  out = out.replace(/\bsk-[A-Za-z0-9]{8,}\b/g, (m) => `${m.slice(0, 4)}****${m.slice(-2)}`);

  // Avoid leaking long tokens in error messages.
  out = out.replace(/\b[A-Za-z0-9_-]{24,}\b/g, (m) => `${m.slice(0, 3)}****${m.slice(-3)}`);

  return out;
}

function formatAgentFailureReason(error: unknown): string {
  const err = error as any;
  const status = typeof err?.status === 'number' ? String(err.status) : '';
  const name = typeof err?.name === 'string' ? err.name : '';
  const code = typeof err?.code === 'string' ? err.code : '';
  const type = typeof err?.type === 'string' ? err.type : '';

  const rawMsg =
    (typeof err?.error?.message === 'string' && err.error.message) ||
    (typeof err?.message === 'string' && err.message) ||
    '';

  const compactMsg = redactSecrets(rawMsg).replace(/\s+/g, ' ').trim();
  const shortMsg = compactMsg.length > 180 ? compactMsg.slice(0, 180) + '...' : compactMsg;

  const parts = [status || name, code, type, shortMsg].filter(Boolean);
  return parts.join(' ');
}

type AgentStrategy = 'lite' | 'tools';

function resolveAgentStrategy(_config: AIConfig): AgentStrategy {
  const raw = (process.env.GIT_AI_AGENT_STRATEGY || '').trim().toLowerCase();
  if (raw === 'tools' || raw === 'tool' || raw === 'function' || raw === 'functions') return 'tools';
  if (raw === 'lite' || raw === 'local' || raw === 'fast') return 'lite';

  // Default: lite (fewer API calls, works for providers without tool calling).
  // Users can opt-in to tool calling with GIT_AI_AGENT_STRATEGY=tools.
  return 'lite';
}

function resolveAgentModel(config: AIConfig, strategy: AgentStrategy): string {
  const envModel = process.env.GIT_AI_AGENT_MODEL;
  if (envModel && envModel.trim()) return envModel.trim();

  const configured = config.agentModel;
  if (configured && configured.trim()) return configured.trim();

  // DeepSeek reasoner models are often not tool-capable; switch to a tool-capable model only when needed.
  if (strategy === 'tools' && config.provider === 'deepseek') {
    const base = (config.model || '').trim();
    if (base.toLowerCase().includes('reasoner')) {
      return 'deepseek-chat';
    }
  }

  return config.model;
}

function isAgentDisabled(): boolean {
  return parseBooleanEnv(process.env.GIT_AI_DISABLE_AGENT) === true;
}

function isAutoAgentEnabled(): boolean {
  const raw = parseBooleanEnv(process.env.GIT_AI_AUTO_AGENT);
  if (raw === undefined) return true;
  return raw;
}

function stripCodeFences(text: string): string {
  return text.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
}

function tryParseMessagesJson(content: string): string[] | null {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const arr = parsed.filter((item) => typeof item === 'string') as string[];
      return arr.map((s) => s.trim()).filter(Boolean);
    }
    if (parsed && typeof parsed === 'object') {
      const anyObj = parsed as Record<string, unknown>;
      if (typeof anyObj.message === 'string') {
        const msg = anyObj.message.trim();
        return msg ? [msg] : [];
      }
      if (Array.isArray(anyObj.messages)) {
        const arr = (anyObj.messages as unknown[]).filter((item) => typeof item === 'string') as string[];
        return arr.map((s) => s.trim()).filter(Boolean);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

type CommitRulesNormalized = {
  types: string[];
  scopes?: string[];
  scopeMap?: Record<string, string>;
  maxSubjectLength: number;
  requireScope: boolean;
  issuePattern: RegExp;
  issuePlacement: 'scope' | 'subject' | 'footer';
  issueFooterPrefix: string;
  requireIssue: boolean;
};

const DEFAULT_COMMIT_RULES: CommitRulesNormalized = {
  types: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'build', 'ci'],
  maxSubjectLength: 50,
  requireScope: false,
  issuePattern: /([A-Z]+-\d+|#\d+)/,
  issuePlacement: 'footer',
  issueFooterPrefix: 'Refs',
  requireIssue: false,
};

const RULES_PRESETS: Record<string, CommitRules> = {
  conventional: {
    types: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'build', 'ci'],
    maxSubjectLength: 50,
    requireScope: false,
  },
  angular: {
    types: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    maxSubjectLength: 50,
    requireScope: true,
  },
  minimal: {
    types: ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'chore'],
    maxSubjectLength: 50,
    requireScope: false,
  },
};

export function validateCommitRules(raw: unknown): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (raw === undefined) return { errors, warnings };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('rules must be an object');
    return { errors, warnings };
  }

  const rules = raw as CommitRules;

  if (rules.types !== undefined) {
    if (!Array.isArray(rules.types)) {
      errors.push('rules.types must be an array of strings');
    } else {
      const cleaned = rules.types.filter((t) => typeof t === 'string' && t.trim());
      if (cleaned.length === 0) {
        errors.push('rules.types must not be empty');
      }
      if (cleaned.length !== rules.types.length) {
        warnings.push('rules.types contains non-string entries');
      }
    }
  }

  if (rules.scopes !== undefined) {
    if (!Array.isArray(rules.scopes)) {
      errors.push('rules.scopes must be an array of strings');
    } else {
      const cleaned = rules.scopes.filter((s) => typeof s === 'string' && s.trim());
      if (cleaned.length !== rules.scopes.length) {
        warnings.push('rules.scopes contains non-string entries');
      }
    }
  }

  if (rules.scopeMap !== undefined) {
    if (!rules.scopeMap || typeof rules.scopeMap !== 'object' || Array.isArray(rules.scopeMap)) {
      errors.push('rules.scopeMap must be an object map of path -> scope');
    } else {
      const entries = Object.entries(rules.scopeMap);
      const valid = entries.filter(
        ([k, v]) => typeof k === 'string' && k.trim() && typeof v === 'string' && v.trim()
      );
      if (valid.length !== entries.length) {
        warnings.push('rules.scopeMap contains invalid entries');
      }
    }
  }

  if (rules.maxSubjectLength !== undefined) {
    if (typeof rules.maxSubjectLength !== 'number' || !Number.isFinite(rules.maxSubjectLength)) {
      errors.push('rules.maxSubjectLength must be a number');
    } else if (rules.maxSubjectLength <= 10) {
      warnings.push('rules.maxSubjectLength should be > 10');
    }
  }

  if (rules.requireScope !== undefined && typeof rules.requireScope !== 'boolean') {
    errors.push('rules.requireScope must be a boolean');
  }

  if (rules.issuePattern !== undefined) {
    if (typeof rules.issuePattern !== 'string' || !rules.issuePattern.trim()) {
      errors.push('rules.issuePattern must be a non-empty string');
    } else {
      try {
        // eslint-disable-next-line no-new
        new RegExp(rules.issuePattern);
      } catch {
        errors.push('rules.issuePattern must be a valid regex string');
      }
    }
  }

  if (rules.issuePlacement !== undefined) {
    if (
      rules.issuePlacement !== 'scope' &&
      rules.issuePlacement !== 'subject' &&
      rules.issuePlacement !== 'footer'
    ) {
      errors.push('rules.issuePlacement must be scope, subject, or footer');
    }
  }

  if (rules.issueFooterPrefix !== undefined && typeof rules.issueFooterPrefix !== 'string') {
    errors.push('rules.issueFooterPrefix must be a string');
  }

  if (rules.requireIssue !== undefined && typeof rules.requireIssue !== 'boolean') {
    errors.push('rules.requireIssue must be a boolean');
  }

  return { errors, warnings };
}

function normalizeRules(config: AIConfig): CommitRulesNormalized {
  const presetName = (config.rulesPreset || '').trim().toLowerCase();
  const preset = presetName ? RULES_PRESETS[presetName] : undefined;
  const custom: CommitRules | undefined = config.rules;

  const resolvedTypes =
    Array.isArray(custom?.types) && custom.types.length > 0
      ? custom.types.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
      : Array.isArray(preset?.types) && preset?.types?.length
        ? preset.types
        : DEFAULT_COMMIT_RULES.types;
  const types = resolvedTypes.length ? resolvedTypes : DEFAULT_COMMIT_RULES.types;

  const scopes =
    Array.isArray(custom?.scopes) && custom.scopes.length > 0
      ? custom.scopes.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : Array.isArray(preset?.scopes) && preset?.scopes?.length
        ? preset.scopes
        : undefined;

  const presetScopeMap =
    preset?.scopeMap && typeof preset.scopeMap === 'object'
      ? (Object.fromEntries(
          Object.entries(preset.scopeMap).filter(
            ([k, v]) => typeof k === 'string' && typeof v === 'string' && k.trim() && v.trim()
          )
        ) as Record<string, string>)
      : undefined;
  const customScopeMap =
    custom?.scopeMap && typeof custom.scopeMap === 'object'
      ? (Object.fromEntries(
          Object.entries(custom.scopeMap).filter(
            ([k, v]) => typeof k === 'string' && typeof v === 'string' && k.trim() && v.trim()
          )
        ) as Record<string, string>)
      : undefined;
  const scopeMap =
    presetScopeMap || customScopeMap ? { ...(presetScopeMap || {}), ...(customScopeMap || {}) } : undefined;

  const maxSubjectLength =
    typeof custom?.maxSubjectLength === 'number' && custom.maxSubjectLength > 10
      ? Math.floor(custom.maxSubjectLength)
      : typeof preset?.maxSubjectLength === 'number' && preset.maxSubjectLength > 10
        ? Math.floor(preset.maxSubjectLength)
        : DEFAULT_COMMIT_RULES.maxSubjectLength;

  const requireScope =
    typeof custom?.requireScope === 'boolean'
      ? custom.requireScope
      : typeof preset?.requireScope === 'boolean'
        ? preset.requireScope
        : DEFAULT_COMMIT_RULES.requireScope;

  const issuePatternRaw =
    typeof custom?.issuePattern === 'string' && custom.issuePattern.trim()
      ? custom.issuePattern.trim()
      : typeof preset?.issuePattern === 'string' && preset.issuePattern.trim()
        ? preset.issuePattern.trim()
        : undefined;
  let issuePattern = DEFAULT_COMMIT_RULES.issuePattern;
  if (issuePatternRaw) {
    try {
      issuePattern = new RegExp(issuePatternRaw);
    } catch {
      issuePattern = DEFAULT_COMMIT_RULES.issuePattern;
    }
  }

  const issuePlacement =
    custom?.issuePlacement === 'scope' ||
    custom?.issuePlacement === 'subject' ||
    custom?.issuePlacement === 'footer'
      ? custom.issuePlacement
      : preset?.issuePlacement === 'scope' ||
          preset?.issuePlacement === 'subject' ||
          preset?.issuePlacement === 'footer'
        ? preset.issuePlacement
        : DEFAULT_COMMIT_RULES.issuePlacement;

  const issueFooterPrefix =
    typeof custom?.issueFooterPrefix === 'string' && custom.issueFooterPrefix.trim()
      ? custom.issueFooterPrefix.trim()
      : typeof preset?.issueFooterPrefix === 'string' && preset.issueFooterPrefix.trim()
        ? preset.issueFooterPrefix.trim()
        : DEFAULT_COMMIT_RULES.issueFooterPrefix;

  const requireIssue =
    typeof custom?.requireIssue === 'boolean'
      ? custom.requireIssue
      : typeof preset?.requireIssue === 'boolean'
        ? preset.requireIssue
        : DEFAULT_COMMIT_RULES.requireIssue;

  return {
    types,
    scopes,
    scopeMap,
    maxSubjectLength,
    requireScope,
    issuePattern,
    issuePlacement,
    issueFooterPrefix,
    requireIssue,
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function inferTypeFromBranch(branchName?: string): string | null {
  const branch = branchName || '';
  if (/^feature\//.test(branch)) return 'feat';
  if (/^bugfix\//.test(branch)) return 'fix';
  if (/^hotfix\//.test(branch)) return 'fix';
  if (/^release\//.test(branch)) return 'chore';
  if (/^docs\//.test(branch)) return 'docs';
  return null;
}

function inferScopeFromBranch(branchName?: string): string | null {
  if (!branchName) return null;
  const patterns = [
    /^(?:feature|bugfix|hotfix|release|dev)\/([a-zA-Z0-9_-]+)/,
    /^(?:feat|fix|chore|docs)\/([a-zA-Z0-9_-]+)/,
    /^[A-Z]+-\d+/,
  ];

  for (const pattern of patterns) {
    const match = branchName.match(pattern);
    if (match) {
      return match[1].toLowerCase().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }
  }
  return null;
}

function inferScopeFromPaths(
  stagedFiles: string[] | undefined,
  scopeMap: Record<string, string> | undefined
): string | null {
  if (!stagedFiles || stagedFiles.length === 0) return null;
  if (scopeMap) {
    const normalizedMap = Object.entries(scopeMap)
      .map(([prefix, scope]) => [normalizePath(prefix), scope] as const)
      .sort((a, b) => b[0].length - a[0].length);

    for (const file of stagedFiles) {
      const normalized = normalizePath(file);
      for (const [prefix, scope] of normalizedMap) {
        if (!prefix) continue;
        const anchor = prefix.endsWith('/') ? prefix : `${prefix}/`;
        if (normalized.startsWith(prefix) || normalized.includes(anchor)) {
          return scope;
        }
      }
    }
  }

  // Monorepo auto-scope (packages/apps/services/libs)
  for (const file of stagedFiles) {
    const normalized = normalizePath(file);
    const match = normalized.match(/^(?:packages|apps|services|libs)\/([^/]+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function pickScope(
  inputScope: string | undefined,
  rules: CommitRulesNormalized,
  branchName?: string,
  stagedFiles?: string[]
): string | null {
  let scope = inputScope?.trim();
  if (!scope) {
    scope = inferScopeFromBranch(branchName) || inferScopeFromPaths(stagedFiles, rules.scopeMap) || undefined;
  }
  if (scope && rules.scopes && !rules.scopes.includes(scope)) {
    scope = undefined;
  }
  if (!scope && rules.requireScope) {
    scope = inferScopeFromBranch(branchName) || inferScopeFromPaths(stagedFiles, rules.scopeMap) || 'core';
  }
  return scope || null;
}

function normalizeType(
  inputType: string | undefined,
  rules: CommitRulesNormalized,
  branchName?: string
): string {
  const trimmed = inputType?.trim();
  if (trimmed && rules.types.includes(trimmed)) return trimmed;
  const inferred = inferTypeFromBranch(branchName);
  if (inferred && rules.types.includes(inferred)) return inferred;
  return rules.types[0] || 'chore';
}

function cleanSubject(subject: string | undefined, rules: CommitRulesNormalized, locale: 'zh' | 'en'): string {
  let out = (subject || '').trim();
  out = out.replace(/[。.]$/, '').trim();
  if (!out) {
    out = locale === 'zh' ? '更新代码' : 'update code';
  }
  if (out.length > rules.maxSubjectLength) {
    out = out.slice(0, rules.maxSubjectLength).trim();
  }
  return out;
}

function findIssue(text: string | undefined, pattern: RegExp): string | null {
  if (!text) return null;
  const match = text.match(pattern);
  return match ? match[0] : null;
}

function resolveIssueId(
  message: string | undefined,
  branchName: string | undefined,
  rules: CommitRulesNormalized
): { issue: string | null; fromMessage: boolean } {
  const fromMessage = findIssue(message, rules.issuePattern);
  if (fromMessage) return { issue: fromMessage, fromMessage: true };
  const fromBranch = findIssue(branchName, rules.issuePattern);
  if (fromBranch) return { issue: fromBranch, fromMessage: false };
  return { issue: null, fromMessage: false };
}

function normalizeIssueId(issue: string, placement: 'scope' | 'subject' | 'footer'): string {
  if (placement === 'scope') {
    return issue.replace(/^#/, '');
  }
  return issue;
}

function formatCommitMessage(
  type: string,
  scope: string | null,
  subject: string,
  locale: 'zh' | 'en',
  body?: string,
  risks?: string,
  footer?: string
): string {
  const head = `${type}${scope ? `(${scope})` : ''}: ${subject}`;
  const bodyParts: string[] = [];
  if (body && body.trim()) bodyParts.push(body.trim());
  if (risks && risks.trim()) {
    bodyParts.push(`${locale === 'zh' ? '风险' : 'Risks'}: ${risks.trim()}`);
  }
  if (footer && footer.trim()) {
    bodyParts.push(footer.trim());
  }
  if (bodyParts.length === 0) return head;
  return `${head}\n\n${bodyParts.join('\n\n')}`;
}

function enforceRulesOnTextMessage(
  message: string,
  rules: CommitRulesNormalized,
  locale: 'zh' | 'en',
  branchName?: string,
  stagedFiles?: string[]
): string {
  const lines = message.split('\n');
  const head = lines[0]?.trim() || '';
  const body = lines.slice(1).join('\n').trim() || undefined;

  const match = head.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
  const type = normalizeType(match?.[1], rules, branchName);
  let scope = pickScope(match?.[2], rules, branchName, stagedFiles);
  let subject = cleanSubject(match?.[3] || head, rules, locale);

  const issueInfo = resolveIssueId(message, branchName, rules);
  let footer: string | undefined;

  if (issueInfo.issue && !issueInfo.fromMessage) {
    const issue = normalizeIssueId(issueInfo.issue, rules.issuePlacement);
    if (rules.issuePlacement === 'scope') {
      if (!scope || scope === 'core') {
        if (!rules.scopes || rules.scopes.includes(issue)) {
          scope = issue;
        } else {
          footer = `${rules.issueFooterPrefix}: ${issueInfo.issue}`;
        }
      } else {
        footer = `${rules.issueFooterPrefix}: ${issueInfo.issue}`;
      }
    } else if (rules.issuePlacement === 'subject') {
      subject = cleanSubject(`${issue} ${subject}`, rules, locale);
    } else {
      footer = `${rules.issueFooterPrefix}: ${issueInfo.issue}`;
    }
  }

  return formatCommitMessage(type, scope, subject, locale, body, undefined, footer);
}

export function validateCommitMessage(
  message: string,
  config: AIConfig,
  context?: { branchName?: string; stagedFiles?: string[] }
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rules = normalizeRules(config);

  const lines = message.split('\n');
  const head = lines[0]?.trim() || '';
  const match = head.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);

  if (!match) {
    errors.push('Commit message must match "<type>(<scope>): <subject>"');
    return { errors, warnings };
  }

  const type = match[1];
  const scope = match[2];
  const subject = match[3]?.trim() || '';

  if (!rules.types.includes(type)) {
    errors.push(`type "${type}" is not allowed`);
  }

  if (rules.requireScope && (!scope || !scope.trim())) {
    errors.push('scope is required');
  }

  if (scope && rules.scopes && !rules.scopes.includes(scope)) {
    errors.push(`scope "${scope}" is not in allowed scopes`);
  }

  if (!subject) {
    errors.push('subject must not be empty');
  }

  if (subject.length > rules.maxSubjectLength) {
    errors.push(`subject exceeds max length ${rules.maxSubjectLength}`);
  }

  if (rules.requireIssue) {
    const issue =
      findIssue(message, rules.issuePattern) ||
      findIssue(context?.branchName, rules.issuePattern);
    if (!issue) {
      errors.push('issue id is required but not found');
    }
  }

  return { errors, warnings };
}

type CommitJson = {
  type?: string;
  scope?: string;
  subject?: string;
  body?: string;
  risks?: string;
  message?: string;
};

function parseCommitJson(normalized: string): CommitJson[] | null {
  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'object' && item ? (item as CommitJson) : null))
        .filter(Boolean) as CommitJson[];
    }
    if (parsed && typeof parsed === 'object') {
      return [parsed as CommitJson];
    }
  } catch {
    // ignore
  }
  return null;
}

function formatFromCommitJson(
  items: CommitJson[],
  rules: CommitRulesNormalized,
  locale: 'zh' | 'en',
  branchName?: string,
  stagedFiles?: string[]
): string[] {
  return items.map((item) => {
    if (item.message && typeof item.message === 'string') {
      return enforceRulesOnTextMessage(item.message, rules, locale, branchName, stagedFiles);
    }
    const type = normalizeType(item.type, rules, branchName);
    let scope = pickScope(item.scope, rules, branchName, stagedFiles);
    let subject = cleanSubject(item.subject, rules, locale);
    const raw = [item.type, item.scope, item.subject, item.body, item.risks]
      .filter((v) => typeof v === 'string' && v.trim())
      .join('\n');
    const issueInfo = resolveIssueId(raw, branchName, rules);
    let footer: string | undefined;

    if (issueInfo.issue && !issueInfo.fromMessage) {
      const issue = normalizeIssueId(issueInfo.issue, rules.issuePlacement);
      if (rules.issuePlacement === 'scope') {
        if (!scope || scope === 'core') {
          if (!rules.scopes || rules.scopes.includes(issue)) {
            scope = issue;
          } else {
            footer = `${rules.issueFooterPrefix}: ${issueInfo.issue}`;
          }
        } else {
          footer = `${rules.issueFooterPrefix}: ${issueInfo.issue}`;
        }
      } else if (rules.issuePlacement === 'subject') {
        subject = cleanSubject(`${issue} ${subject}`, rules, locale);
      } else {
        footer = `${rules.issueFooterPrefix}: ${issueInfo.issue}`;
      }
    }

    return formatCommitMessage(type, scope, subject, locale, item.body, item.risks, footer);
  });
}

function normalizeAIError(error: unknown): Error {
  if (error instanceof Error) {
    const safe = redactSecrets(error.message || '');
    const e = new Error(safe);
    (e as any).cause = error;
    return e;
  }
  return new Error(redactSecrets(String(error)));
}

function shouldFallbackFromAgent(error: unknown): boolean {
  const err = error as any;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  const type = typeof err?.type === 'string' ? err.type : '';

  // If auth/endpoint is wrong, basic mode will fail too: don't spam the user with a second failure.
  if (status === 401 || status === 403 || type === 'authentication_error') return false;
  if (status === 404) return false;

  // Rate limits / transient errors: agent uses more calls; basic mode may succeed.
  if (status === 429) return true;
  if (status && status >= 500) return true;

  const msg =
    (typeof err?.error?.message === 'string' && err.error.message) ||
    (typeof err?.message === 'string' && err.message) ||
    '';
  const lowered = String(msg).toLowerCase();

  // Tool calling compatibility issues: fall back to basic mode.
  if (lowered.includes('tool') || lowered.includes('tool_choice') || lowered.includes('function')) return true;

  // Default: keep previous behavior (fallback), unless it's clearly an auth/endpoint issue.
  return true;
}

function shouldFallbackModel(error: unknown): boolean {
  const err = error as any;
  const status = typeof err?.status === 'number' ? err.status : undefined;
  const type = typeof err?.type === 'string' ? err.type : '';
  if (status === 401 || status === 403 || type === 'authentication_error') return false;
  if (status === 404) return false;
  if (status === 429) return true;
  if (status && status >= 500) return true;
  const msg =
    (typeof err?.error?.message === 'string' && err.error.message) ||
    (typeof err?.message === 'string' && err.message) ||
    '';
  const lowered = String(msg).toLowerCase();
  if (lowered.includes('timeout') || lowered.includes('timed out')) return true;
  if (lowered.includes('rate limit')) return true;
  return false;
}

const DEFAULT_SYSTEM_PROMPT_EN = `You are an expert at writing Git commit messages following the Conventional Commits specification.

Based on the git diff provided, generate a concise and descriptive commit message.

Rules:
1. Use the format: <type>(<scope>): <subject>
2. Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
3. Keep the subject line under 50 characters
4. Use imperative mood ("add" not "added")
5. Don't end the subject line with a period
6. If needed, add a blank line followed by a body for more details
7. Git Flow Branch Mapping (Priority):
   - feature/* -> type: feat
   - bugfix/* -> type: fix
   - hotfix/* -> type: fix
   - release/* -> type: chore
    - docs/* -> type: docs
    - If branch name matches, infer <scope> from it (e.g. feature/login -> feat(login): ...)
    - If branch name doesn't match these patterns, ignore it and infer type/scope strictly from the code changes.

Only output the commit message, nothing else.`;

const DEFAULT_SYSTEM_PROMPT_ZH = `你是一个专业的 Git commit message 编写专家，遵循 Conventional Commits 规范。

根据提供的 git diff，生成简洁且描述性的提交信息。

规则：
1. 使用格式: <type>(<scope>): <subject>
2. type 类型: feat, fix, docs, style, refactor, perf, test, chore, build, ci
3. subject 保持在 50 字符以内
4. 使用祈使语气
5. subject 末尾不要加句号
6. 如需要，空一行后添加 body 提供更多细节
7. Git Flow 分支映射规则 (优先级最高):
   - feature/* -> type: feat
   - bugfix/* -> type: fix
   - hotfix/* -> type: fix
   - release/* -> type: chore
   - docs/* -> type: docs
   - 如果分支名匹配，请从中推断 <scope> (例如: feature/login -> feat(login): ...)
   - 如果分支名不符合上述标准前缀，请忽略分支名，仅依据代码变更内容(diff)来决定 type 和 scope。

只输出 commit message，不要输出其他内容。`;

const DEEPSEEK_PROMPT_ZH = `你是一个智能编程助手，专注于生成高质量的 Git 提交信息。

请仔细分析下方的 Git Diff，理解代码变更的*意图*（不仅仅是修改了什么）。

规则：
1. 严格遵循 Conventional Commits 规范: <type>(<scope>): <subject>
2. 类型(type)必须是: feat, fix, docs, style, refactor, perf, test, chore, build, ci
3. 描述(subject)需简洁有力，50字符以内，使用中文。
4. 如果变更复杂，请在 subject 后空一行，添加详细的 body 说明。
5. 专注于*为什么*变更，而不仅仅是*改了什么*。
6. Git Flow 分支映射规则 (优先级最高):
   - feature/* -> type: feat
   - bugfix/* -> type: fix
   - hotfix/* -> type: fix
   - release/* -> type: chore
   - docs/* -> type: docs
   - 如果分支名匹配，请从中推断 <scope> (例如: feature/login -> feat(login): ...)
   - 如果分支名不符合上述标准前缀，请忽略分支名，仅依据代码变更内容(diff)来决定 type 和 scope。

只输出最终的 Commit Message，不包含 Markdown 代码块或其他解释。`;

export function createAIClient(config: AIConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey || 'ollama',
    baseURL: config.baseUrl,
    timeout: getTimeoutMs(),
    maxRetries: 2,  // Built-in retry support
  });
}

export interface CommitMessageGenerationInput {
  diff?: string;
  diffLoader?: () => Promise<{ diff: string; truncated: boolean; ignoredFiles: string[] }>;
  stagedFiles?: string[];
  ignoredFiles?: string[];
  truncated?: boolean;
  branchName?: string;
  recentCommits?: string[];
  forceAgent?: boolean;
  quiet?: boolean;
}

export async function generateCommitMessage(
  client: OpenAI,
  input: CommitMessageGenerationInput,
  config: AIConfig,
  numChoices = 1
): Promise<string[]> {
  let diff = input.diff;
  let ignoredFiles = input.ignoredFiles;
  let truncated = input.truncated;
  const rules = normalizeRules(config);
  const outputFormat = config.outputFormat || 'text';

  const ensureDiff = async (): Promise<void> => {
    if (diff !== undefined) return;
    if (input.diffLoader) {
      const loaded = await input.diffLoader();
      diff = loaded.diff;
      truncated = loaded.truncated;
      ignoredFiles = loaded.ignoredFiles;
      return;
    }
    diff = '';
  };

  // Auto-enable Agent for critical branches in Git Flow
  // Critical: release/hotfix/master/main - always use Agent
  // Feature: feature/*/bugfix/*/dev/* - use Agent for impact analysis
  const branch = input.branchName || '';
  const isCriticalBranch = /^(release|hotfix)\//.test(branch) || /^(master|main)$/.test(branch);
  const isFeatureBranch = /^(feature|bugfix|dev)\//.test(branch);
  const autoAgentEnabled = isAutoAgentEnabled();
  const agentDisabled = isAgentDisabled();
  const shouldRunAgent =
    !agentDisabled &&
    (input.forceAgent || (autoAgentEnabled && (input.truncated || isCriticalBranch || isFeatureBranch))) &&
    numChoices === 1;

  // Trigger Agent Mode if diff is truncated OR forced by user OR critical branch
  if (shouldRunAgent) {
    try {
      const stats = await getFileStats();
      if (stats.length > 0) {
        const agentStrategy = resolveAgentStrategy(config);
        const agentModel = resolveAgentModel(config, agentStrategy);
        if (!input.quiet) {
          const label = agentStrategy === 'tools' ? 'tools' : 'lite';
          if (agentModel !== config.model) {
            console.log(
              chalk.gray(`\n🧠 Agent (${label}) model: ${agentModel} (base model: ${config.model})`)
            );
          } else {
            console.log(chalk.gray(`\n🧠 Agent strategy: ${label}`));
          }
        }

        const agentMessage =
          agentStrategy === 'tools'
            ? await runAgentLoop(client, config, stats, input.branchName, input.quiet, agentModel)
            : await runAgentLite(client, config, stats, input.branchName, input.quiet, agentModel);
        const enforced = enforceRulesOnTextMessage(
          agentMessage,
          rules,
          config.locale,
          input.branchName,
          input.stagedFiles
        );
        const out = config.enableFooter ? `${enforced}\n\n🤖 Generated by git-ai 🚀` : enforced;
        return [out];
      }
    } catch (error) {
      if (!shouldFallbackFromAgent(error)) {
        throw normalizeAIError(error);
      }
      if (!input.quiet) {
        const reason = formatAgentFailureReason(error);
        const suffix = reason ? ` (${reason})` : '';
        console.error(chalk.yellow(`\n⚠️  Agent mode failed${suffix}, falling back to basic mode...`));
        if (process.env.GIT_AI_DEBUG === '1') {
          console.error(error);
        }
      }
    }
  }

  await ensureDiff();

  let systemPrompt = config.customPrompt;

  if (!systemPrompt) {
    const isZh = config.locale === 'zh';
    if (config.provider === 'deepseek' || config.provider === 'qwen') {
      systemPrompt = isZh ? DEEPSEEK_PROMPT_ZH : DEFAULT_SYSTEM_PROMPT_EN; // Reuse EN for now or add DeepSeek EN later
    } else {
      systemPrompt = isZh ? DEFAULT_SYSTEM_PROMPT_ZH : DEFAULT_SYSTEM_PROMPT_EN;
    }
  }

  const isZh = config.locale === 'zh';
  const lines: string[] = [];

  const rulesHeader = isZh ? 'Commit 规则:' : 'Commit rules:';
  const rulesLines = [
    `${rulesHeader}`,
    `types: ${rules.types.join(', ')}`,
    `maxSubjectLength: ${rules.maxSubjectLength}`,
    `requireScope: ${rules.requireScope ? 'true' : 'false'}`,
    `issuePlacement: ${rules.issuePlacement}`,
    `requireIssue: ${rules.requireIssue ? 'true' : 'false'}`,
    `issuePattern: ${rules.issuePattern.source}`,
    `issueFooterPrefix: ${rules.issueFooterPrefix}`,
  ];
  if (rules.scopes && rules.scopes.length) {
    rulesLines.push(`scopes: ${rules.scopes.join(', ')}`);
  }
  lines.push(rulesLines.join('\n'));

  if (numChoices > 1) {
    // Add instruction for multiple choices (JSON array for robustness)
    const multiInstruction = outputFormat === 'json'
      ? isZh
        ? `\n请仅输出 JSON 数组，包含 ${numChoices} 个对象，每个对象字段为 type, scope, subject, body?, risks?；不要输出其他内容。`
        : `\nRespond with a JSON array of ${numChoices} objects with fields type, scope, subject, body?, risks?. Output JSON only.`
      : isZh
        ? `\n请仅输出 JSON 数组，包含 ${numChoices} 条不同的 commit message（字符串数组），不要输出其他内容。`
        : `\nRespond with a JSON array of ${numChoices} distinct commit message strings. Output JSON only.`;
    systemPrompt += multiInstruction;
  } else if (outputFormat === 'json') {
    const singleInstruction = isZh
      ? `\n请仅输出一个 JSON 对象，字段为 type, scope, subject, body?, risks?；不要输出其他内容。`
      : `\nRespond with a single JSON object with fields type, scope, subject, body?, risks?. Output JSON only.`;
    systemPrompt += singleInstruction;
  }

  if (input.recentCommits?.length) {
    const header = isZh
      ? '参考历史提交风格 (请模仿以下风格):'
      : 'Reference recent commits (please mimic the style):';
    // Extract subject from "hash date subject" format
    // Format is "%h %cd %s", so we take everything after the second space
    const cleanCommits = input.recentCommits
      .map((line) => {
        const parts = line.split(' ');
        if (parts.length >= 3) {
          return parts.slice(2).join(' ');
        }
        return line;
      })
      .slice(0, 10); // Limit to 10 to save tokens

    lines.push(`${header}\n${cleanCommits.map((c) => `- ${c}`).join('\n')}`);
  }

  if (input.branchName) {
    const header = isZh ? '当前分支:' : 'Current branch:';
    lines.push(`${header} ${input.branchName}`);
  }

  if (input.stagedFiles?.length) {
    const header = isZh ? '已暂存文件:' : 'Staged files:';
    lines.push(`${header}\n${input.stagedFiles.map((f) => `- ${f}`).join('\n')}`);
  }

  if (ignoredFiles?.length) {
    const header = isZh
      ? '以下文件为节省 Token 已忽略 Diff:'
      : 'Ignored files (diff omitted for token optimization):';
    lines.push(`${header}\n${ignoredFiles.map((f) => `- ${f}`).join('\n')}`);
  }

  if (truncated) {
    lines.push(
      isZh
        ? '注意：Diff 内容已因长度限制被截断。'
        : 'Note: The diff was truncated due to size limits.'
    );
  }

  const diffHeader = isZh ? 'Git Diff:' : 'Git diff:';
  lines.push(`${diffHeader}\n\n${diff || '(empty)'}`);

  const modelCandidates = getModelCandidates(config);
  let response: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: lines.join('\n\n') },
        ],
        temperature: 0.7,
        max_tokens: getMaxOutputTokens(numChoices),
      });
      break;
    } catch (error) {
      lastError = error;
      if (!shouldFallbackModel(error) || model === modelCandidates[modelCandidates.length - 1]) {
        throw normalizeAIError(error);
      }
      if (process.env.GIT_AI_DEBUG === '1') {
        console.error(chalk.yellow(`⚠️  Model ${model} failed, trying fallback...`));
      }
    }
  }

  if (!response) {
    throw normalizeAIError(lastError);
  }

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Failed to generate commit message: empty response');
  }

  const normalized = stripCodeFences(content);
  let messages: string[] = [];

  if (outputFormat === 'json') {
    const parsed = parseCommitJson(normalized);
    if (parsed && parsed.length) {
      messages = formatFromCommitJson(parsed, rules, config.locale, input.branchName, input.stagedFiles);
    } else {
      const fallback = tryParseMessagesJson(normalized);
      const rawMessages = fallback && fallback.length ? fallback : [normalized];
      messages = rawMessages.map((msg) =>
        enforceRulesOnTextMessage(msg, rules, config.locale, input.branchName, input.stagedFiles)
      );
    }
  } else {
    if (numChoices > 1) {
      const parsed = tryParseMessagesJson(normalized);
      if (parsed && parsed.length) {
        messages = parsed;
      } else {
        messages = normalized
          .split('---')
          .map((msg) => msg.trim())
          .filter(Boolean);
      }
    } else {
      const parsed = tryParseMessagesJson(normalized);
      if (parsed && parsed.length === 1) {
        messages = parsed;
      } else {
        messages = [normalized];
      }
    }

    messages = messages.map((msg) =>
      enforceRulesOnTextMessage(msg, rules, config.locale, input.branchName, input.stagedFiles)
    );
  }

  if (config.enableFooter) {
    return messages.map((msg) => `${msg}\n\n🤖 Generated by git-ai 🚀`);
  }

  return messages;
}

const REPORT_PROMPT_ZH = `你是一位资深技术专家，擅长撰写高质量的周报/日报。

请根据提供的 Git Commit 记录，整理出一份结构清晰、重点突出的工作汇报。

规则：
1. **分类汇总**：将提交记录归类（例如：✨ 新特性、🐛 问题修复、⚡️ 性能优化、📝 文档与其他）。
2. **价值导向**：不要只罗列代码变更，尝试用简练的语言描述业务价值或技术成果。
3. **格式美观**：使用 Markdown 格式，利用列表和 emoji 让阅读体验更佳。
4. **过滤噪音**：忽略无意义的测试提交或临时提交。

输出格式示例：
## 📅 工作汇报 (Time Range)

### ✨ 核心产出
- **功能 A**: 完成了...逻辑，提升了...体验
- **功能 B**: ...

### 🐛 问题修复
- 修复了...导致的崩溃问题

### 📝 其他
- ...

(结尾可加一句下周计划建议)`;

const REPORT_PROMPT_EN = `You are a senior technical lead expert at writing professional progress reports.

Based on the provided Git Commit logs, generate a structured and high-quality status report.

Rules:
1. **Categorize**: Group commits logically (e.g., ✨ Features, 🐛 Bug Fixes, ⚡️ Improvements, 📝 Other).
2. **Value-Driven**: Don't just list technical changes; briefly emphasize the value or outcome.
3. **Formatting**: Use Markdown with bullet points and emojis.
4. **Filter Noise**: Ignore trivial or "wip" commits.

Output structured markdown text only.`;

const PR_PROMPT_EN = `You are a senior engineer writing a pull request description.

Based on the commit list and diff summary, produce a concise PR description.

Rules:
1) Use Markdown
2) Include sections: Summary, Changes, Testing, Risks
3) Be concise and value-focused
4) If testing info is unknown, write "Not run"

Output Markdown only.`;

const PR_PROMPT_ZH = `你是资深工程师，负责撰写 PR 描述。

根据提交记录和 diff 概要，生成简洁的 PR 描述。

规则：
1) 使用 Markdown
2) 包含板块：Summary, Changes, Testing, Risks
3) 聚焦价值与影响，避免啰嗦
4) 如未知测试情况，写 "Not run"

仅输出 Markdown。`;

const RELEASE_PROMPT_EN = `You are a release manager writing release notes.

Based on the commit list, generate structured release notes.

Rules:
1) Use Markdown
2) Group changes by type (Features, Fixes, Improvements, Docs/Chore)
3) Be concise and user-facing when possible
4) Exclude trivial/wip commits

Output Markdown only.`;

const RELEASE_PROMPT_ZH = `你是发布负责人，负责撰写 Release Notes。

根据提交记录生成结构化的发布说明。

规则：
1) 使用 Markdown
2) 按类型分组（Features / Fixes / Improvements / Docs/Chore）
3) 尽量面向用户价值表达
4) 过滤无意义提交

仅输出 Markdown。`;

export async function generatePullRequestDescription(
  client: OpenAI,
  input: { commits: string[]; diffStat?: string; base: string; head: string },
  config: AIConfig
): Promise<string> {
  const isZh = config.locale === 'zh';
  const systemPrompt = isZh ? PR_PROMPT_ZH : PR_PROMPT_EN;
  const diffBlock = input.diffStat ? `\nDiff Summary:\n${input.diffStat}` : '';

  const modelCandidates = getModelCandidates(config);
  let result: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      result = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Base: ${input.base}\nHead: ${input.head}\nCommits:\n${input.commits.join(
              '\n'
            )}${diffBlock}`,
          },
        ],
        temperature: 0.4,
      });
      break;
    } catch (error) {
      lastError = error;
      if (!shouldFallbackModel(error) || model === modelCandidates[modelCandidates.length - 1]) {
        throw normalizeAIError(error);
      }
    }
  }

  if (!result) throw normalizeAIError(lastError);
  return result.choices[0]?.message?.content?.trim() || '';
}

export async function generateReleaseNotes(
  client: OpenAI,
  input: { commits: string[]; from: string; to: string },
  config: AIConfig
): Promise<string> {
  const isZh = config.locale === 'zh';
  const systemPrompt = isZh ? RELEASE_PROMPT_ZH : RELEASE_PROMPT_EN;

  const modelCandidates = getModelCandidates(config);
  let result: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      result = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Range: ${input.from} → ${input.to}\nCommits:\n${input.commits.join('\n')}`,
          },
        ],
        temperature: 0.4,
      });
      break;
    } catch (error) {
      lastError = error;
      if (!shouldFallbackModel(error) || model === modelCandidates[modelCandidates.length - 1]) {
        throw normalizeAIError(error);
      }
    }
  }

  if (!result) throw normalizeAIError(lastError);
  return result.choices[0]?.message?.content?.trim() || '';
}

export async function generateWeeklyReport(
  client: OpenAI,
  commits: string[],
  config: AIConfig
): Promise<string> {
  const isZh = config.locale === 'zh';
  const systemPrompt = isZh ? REPORT_PROMPT_ZH : REPORT_PROMPT_EN;

  if (commits.length === 0) {
    return isZh ? '这段时间没有找到您的提交记录。' : 'No commits found for this period.';
  }

  const modelCandidates = getModelCandidates(config);
  let result: OpenAI.Chat.Completions.ChatCompletion | null = null;
  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      result = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Commit History:\n${commits.join('\n')}` },
        ],
        temperature: 0.7,
      });
      break;
    } catch (error) {
      lastError = error;
      if (!shouldFallbackModel(error) || model === modelCandidates[modelCandidates.length - 1]) {
        throw normalizeAIError(error);
      }
    }
  }

  if (!result) {
    throw normalizeAIError(lastError);
  }

  return result.choices[0]?.message?.content?.trim() || '';
}
