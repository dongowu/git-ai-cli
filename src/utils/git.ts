import { execa } from 'execa';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIFF_BLACKLIST, MAX_DIFF_LENGTH } from '../types.js';

type IgnoreRule = {
  raw: string;
  regex: RegExp;
  negate: boolean;
};

let cachedIgnoreRules: IgnoreRule[] | null = null;
const MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_OUTPUT_CHARS = 4000;

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function getMaxDiffLengthChars(): number {
  const rawChars = process.env.GIT_AI_MAX_DIFF_CHARS;
  const parsedChars = rawChars ? Number.parseInt(rawChars, 10) : Number.NaN;
  if (Number.isFinite(parsedChars) && parsedChars > 0) return parsedChars;

  // OpenCommit compatibility: approximate tokens -> chars (roughly 4 chars per token).
  const rawTokens = process.env.OCO_TOKENS_MAX_INPUT;
  const parsedTokens = rawTokens ? Number.parseInt(rawTokens, 10) : Number.NaN;
  if (Number.isFinite(parsedTokens) && parsedTokens > 0) return parsedTokens * 4;

  return MAX_DIFF_LENGTH;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function escapeRegexChar(char: string): string {
  return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

function globToRegex(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      const next = pattern[i + 1];
      if (next === '*') {
        // Collapse consecutive ** into one.
        while (pattern[i + 1] === '*') i++;
        out += '.*';
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      continue;
    }
    out += escapeRegexChar(ch);
  }
  return out;
}

function compileIgnoreRule(rawPattern: string): IgnoreRule | null {
  let pattern = rawPattern.trim();
  if (!pattern) return null;

  // Comment handling (support escaped # and !).
  if (pattern.startsWith('\\#')) {
    pattern = pattern.slice(1);
  } else if (pattern.startsWith('#')) {
    return null;
  }

  let negate = false;
  if (pattern.startsWith('\\!')) {
    pattern = pattern.slice(1);
  } else if (pattern.startsWith('!')) {
    negate = true;
    pattern = pattern.slice(1).trim();
    if (!pattern) return null;
  }

  let anchored = false;
  if (pattern.startsWith('/')) {
    anchored = true;
    pattern = pattern.slice(1);
  }

  if (pattern.endsWith('/')) {
    pattern = pattern.slice(0, -1);
  }

  const normalized = normalizePath(pattern);
  const body = globToRegex(normalized);

  const prefix = anchored ? '^' : '(^|.*/)';
  const suffix = '(/.*)?$';

  try {
    return {
      raw: rawPattern,
      regex: new RegExp(prefix + body + suffix),
      negate,
    };
  } catch {
    return null;
  }
}

function getIgnoreRules(): IgnoreRule[] {
  if (cachedIgnoreRules) return cachedIgnoreRules;

  const patterns = [...DIFF_BLACKLIST];
  const ignorePaths = [
    join(process.cwd(), '.git-aiignore'),
    // OpenCommit compatibility
    join(process.cwd(), '.opencommitignore'),
  ];

  for (const ignorePath of ignorePaths) {
    if (!existsSync(ignorePath)) continue;
    try {
      const content = readFileSync(ignorePath, 'utf-8');
      const lines = content.split('\n').map((l) => l.trim());
      patterns.push(...lines);
    } catch {
      // ignore error
    }
  }

  cachedIgnoreRules = patterns
    .map((pattern) => compileIgnoreRule(pattern))
    .filter(Boolean) as IgnoreRule[];

  return cachedIgnoreRules;
}

export async function isGitInstalled(): Promise<boolean> {
  try {
    await execa('git', ['--version']);
    return true;
  } catch {
    return false;
  }
}

export async function isInGitRepo(): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

export async function getBranchName(): Promise<string> {
  try {
    const { stdout } = await execa('git', ['symbolic-ref', '--short', 'HEAD']);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function getStagedDiff(): Promise<string> {
  const { stdout } = await execa('git', ['diff', '--cached']);
  return stdout;
}

export async function getStagedFiles(): Promise<string[]> {
  const { stdout } = await execa('git', ['diff', '--cached', '--name-only']);
  return stdout.split('\n').filter(Boolean);
}

export interface FileStat {
  file: string;
  insertions: number;
  deletions: number;
}

export interface UnstagedFileEntry {
  path: string;
  status: string;
}

export async function getFileStats(): Promise<FileStat[]> {
  try {
    const { stdout } = await execa('git', ['diff', '--cached', '--numstat']);
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [insertions, deletions, file] = line.split('\t');
        return {
          file,
          insertions: parseInt(insertions) || 0,
          deletions: parseInt(deletions) || 0,
        };
      });
  } catch {
    return [];
  }
}

export async function getFileDiff(file: string): Promise<string> {
  try {
    const { stdout } = await execa('git', ['diff', '--cached', '--', file]);
    return stdout;
  } catch {
    return '';
  }
}

export function isBlacklisted(filename: string): boolean {
  const rules = getIgnoreRules();
  const target = normalizePath(filename);
  let ignored = false;

  for (const rule of rules) {
    if (rule.regex.test(target)) {
      ignored = !rule.negate;
    }
  }

  return ignored;
}

function chunkArgsByLength(
  args: string[],
  options: { maxItems: number; maxChars: number }
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const arg of args) {
    const argLen = arg.length + 1;
    const shouldStartNewBatch =
      current.length >= options.maxItems || currentChars + argLen > options.maxChars;

    if (shouldStartNewBatch) {
      if (current.length > 0) {
        batches.push(current);
      }
      current = [];
      currentChars = 0;
    }

    current.push(arg);
    currentChars += argLen;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

export async function getFilteredDiff(
  files: string[]
): Promise<{ diff: string; truncated: boolean; ignoredFiles: string[] }> {
  const ignoredFiles = files.filter(isBlacklisted);
  const allowedFiles = files.filter((file) => !isBlacklisted(file));
  const diffParts: string[] = [];

  const fileBatches = chunkArgsByLength(allowedFiles, { maxItems: 50, maxChars: 6000 });
  for (const batch of fileBatches) {
    try {
      const { stdout } = await execa('git', ['diff', '--cached', '--', ...batch]);
      if (stdout) {
        diffParts.push(stdout);
      }
    } catch {
      diffParts.push(`[Diff unavailable for ${batch.length} file(s)]`);
    }
  }

  let fullDiff = diffParts.join('\n');
  let truncated = false;

  const maxLen = getMaxDiffLengthChars();
  if (fullDiff.length > maxLen) {
    fullDiff = fullDiff.slice(0, maxLen) + '\n\n...[Diff Truncated]';
    truncated = true;
  }

  return { diff: fullDiff, truncated, ignoredFiles };
}

export async function commit(message: string): Promise<void> {
  await execa('git', ['commit', '-m', message]);
}

export async function getUserName(): Promise<string> {
  try {
    const { stdout } = await execa('git', ['config', 'user.name']);
    return stdout.trim();
  } catch {
    return '';
  }
}

export async function getRecentCommits(days: number): Promise<string[]> {
  return getCommitsInRange({ since: `${days} days ago` });
}

export async function getCommitsInRange(options: {
  since?: string;
  until?: string;
}): Promise<string[]> {
  try {
    const author = await getUserName();
    const includeAll = parseBooleanEnv(process.env.GIT_AI_RECENT_COMMITS_ALL) === true;
    const allowFallback =
      parseBooleanEnv(process.env.GIT_AI_RECENT_COMMITS_FALLBACK) !== false;

    const buildArgs = (withAuthor?: string): string[] => {
      const args = [
        'log',
        '--pretty=format:%h %cd %s', // Hash Date Subject
        '--date=short',
        '--no-merges', // Exclude merge commits
      ];
      if (options.since) args.push(`--since=${options.since}`);
      if (options.until) args.push(`--until=${options.until}`);
      if (withAuthor) {
        args.push(`--author=${withAuthor}`);
      }
      return args;
    };

    const useAuthor = author && !includeAll ? author : undefined;
    let stdout = '';

    if (useAuthor) {
      const result = await execa('git', buildArgs(useAuthor));
      stdout = result.stdout;
      if (!stdout && allowFallback) {
        const fallback = await execa('git', buildArgs(undefined));
        stdout = fallback.stdout;
      }
    } else {
      const result = await execa('git', buildArgs(undefined));
      stdout = result.stdout;
    }

    return stdout.split('\n').filter((line) => line.trim());
  } catch {
    return [];
  }
}

export async function searchCode(pattern: string): Promise<string> {
  try {
    // Use git grep to search in tracked files (it's faster and respects .gitignore)
    const { stdout } = await execa('git', ['grep', '-n', '-e', pattern]);
    if (!stdout) return 'No matches found.';

    const lines = stdout.split('\n').filter(Boolean);
    let output = lines.join('\n');

    if (lines.length > MAX_SEARCH_RESULTS) {
      output =
        lines.slice(0, MAX_SEARCH_RESULTS).join('\n') +
        `\n...[${lines.length - MAX_SEARCH_RESULTS} more matches]`;
    }

    if (output.length > MAX_SEARCH_OUTPUT_CHARS) {
      output = output.slice(0, MAX_SEARCH_OUTPUT_CHARS) + '\n...[Search output truncated]';
    }

    return output;
  } catch {
    return 'No matches found.';
  }
}

export async function getUnstagedFiles(): Promise<string[]> {
  const entries = await getUnstagedFileEntries();
  return entries.map((entry) => entry.path);
}

export async function addFiles(files: string[]): Promise<void> {
  if (files.length === 0) return;
  await execa('git', ['add', ...files]);
}

export async function getUnstagedFileEntries(): Promise<UnstagedFileEntry[]> {
  try {
    const { stdout } = await execa('git', ['status', '--porcelain', '-z']);
    if (!stdout) return [];

    const parts = stdout.split('\0').filter(Boolean);
    const entries: UnstagedFileEntry[] = [];

    for (let i = 0; i < parts.length; i++) {
      const item = parts[i];
      if (item.length < 3) continue;

      const status = item.slice(0, 2);
      let path = item.slice(3);

      // Renames/copies include an extra path field.
      if ((status[0] === 'R' || status[0] === 'C') && parts[i + 1]) {
        path = parts[i + 1];
        i += 1;
      }

      // Unstaged changes: worktree status not blank, or untracked.
      if (status === '??' || status[1] !== ' ') {
        entries.push({ path, status });
      }
    }

    return entries;
  } catch {
    return [];
  }
}
