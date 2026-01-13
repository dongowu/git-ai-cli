import { execa } from 'execa';
import { DIFF_BLACKLIST, MAX_DIFF_LENGTH } from '../types.js';

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

export function isBlacklisted(filename: string): boolean {
  return DIFF_BLACKLIST.some((pattern) => {
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
