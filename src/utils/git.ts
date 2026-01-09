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

export async function getFilteredDiff(): Promise<{ diff: string; truncated: boolean }> {
  const files = await getStagedFiles();
  const diffParts: string[] = [];

  for (const file of files) {
    if (isBlacklisted(file)) {
      diffParts.push(`[File: ${file}] (content ignored - blacklisted)`);
      continue;
    }

    try {
      const { stdout } = await execa('git', ['diff', '--cached', '--', file]);
      diffParts.push(stdout);
    } catch {
      diffParts.push(`[File: ${file}] (unable to get diff)`);
    }
  }

  let fullDiff = diffParts.join('\n');
  let truncated = false;

  if (fullDiff.length > MAX_DIFF_LENGTH) {
    fullDiff = fullDiff.slice(0, MAX_DIFF_LENGTH) + '\n\n...[Diff Truncated]';
    truncated = true;
  }

  return { diff: fullDiff, truncated };
}

export async function commit(message: string): Promise<void> {
  await execa('git', ['commit', '-m', message]);
}
