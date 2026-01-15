import { execa } from 'execa';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIFF_BLACKLIST, MAX_DIFF_LENGTH } from '../types.js';

let cachedIgnorePatterns: string[] | null = null;

function getIgnorePatterns(): string[] {
  if (cachedIgnorePatterns) return cachedIgnorePatterns;

  const patterns = [...DIFF_BLACKLIST];
  const ignorePath = join(process.cwd(), '.git-aiignore');

  if (existsSync(ignorePath)) {
    try {
      const content = readFileSync(ignorePath, 'utf-8');
      const lines = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
      patterns.push(...lines);
    } catch {
      // ignore error
    }
  }

  cachedIgnorePatterns = patterns;
  return patterns;
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
  const patterns = getIgnorePatterns();
  return patterns.some((pattern) => {
    if (pattern.endsWith('/')) {
      return filename.startsWith(pattern) || filename.includes(`/${pattern}`);
    }
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      return filename.endsWith(ext);
    }
    return filename === pattern || filename.endsWith(`/${pattern}`);
  });
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

  if (fullDiff.length > MAX_DIFF_LENGTH) {
    fullDiff = fullDiff.slice(0, MAX_DIFF_LENGTH) + '\n\n...[Diff Truncated]';
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
  try {
    const author = await getUserName();
    const args = [
      'log',
      `--since=${days} days ago`,
      '--pretty=format:%h %cd %s', // Hash Date Subject
      '--date=short',
      '--no-merges', // Exclude merge commits
    ];

    if (author) {
      args.push(`--author=${author}`);
    }

    const { stdout } = await execa('git', args);
    return stdout.split('\n').filter((line) => line.trim());
  } catch {
    return [];
  }
}

export async function searchCode(pattern: string): Promise<string> {
  try {
    // Use git grep to search in tracked files (it's faster and respects .gitignore)
    const { stdout } = await execa('git', ['grep', '-n', '--max-depth=3', pattern]);
    return stdout;
  } catch {
    return 'No matches found.';
  }
}

export async function getUnstagedFiles(): Promise<string[]> {
  try {
    const { stdout } = await execa('git', ['status', '--porcelain']);
    if (!stdout) return [];

    return stdout
      .split('\n')
      .filter((line) => line.trim())
      .filter((line) => {
        // Check if there are unstaged changes
        // Index 1 is the worktree status. ' ' means unmodified in worktree (relative to index).
        // ?? is untracked.
        return line[1] !== ' ' || line.startsWith('??');
      })
      .map((line) => line.substring(3).trim());
  } catch {
    return [];
  }
}

export async function addFiles(files: string[]): Promise<void> {
  if (files.length === 0) return;
  await execa('git', ['add', ...files]);
}
