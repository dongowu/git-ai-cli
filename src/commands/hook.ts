import chalk from 'chalk';
import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_NAME = 'prepare-commit-msg';

const HOOK_SCRIPT = `#!/bin/sh
# git-ai hook - auto-generate commit message
# To disable temporarily: git commit --no-verify

COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2

# Only run for regular commits (not merge, squash, etc.)
if [ -z "$COMMIT_SOURCE" ]; then
  # Check if there's already a message (e.g., from -m flag)
  if [ -s "$COMMIT_MSG_FILE" ]; then
    EXISTING_MSG=$(cat "$COMMIT_MSG_FILE" | grep -v "^#" | tr -d '[:space:]')
    if [ -n "$EXISTING_MSG" ]; then
      exit 0
    fi
  fi

  # Generate commit message using git-ai
  if command -v git-ai >/dev/null 2>&1; then
    echo "🤖 Generating commit message with git-ai..."
    MSG=$(git-ai --yes 2>/dev/null | grep -A 100 "Generated commit message:" | tail -n +2 | head -n 1 | sed 's/^[[:space:]]*//')
    if [ -n "$MSG" ]; then
      echo "$MSG" > "$COMMIT_MSG_FILE"
    fi
  fi
fi

exit 0
`;

async function getGitHooksPath(): Promise<string> {
  try {
    // Check if custom hooks path is configured
    const { stdout } = await execa('git', ['config', '--get', 'core.hooksPath']);
    return stdout.trim();
  } catch {
    // Default to .git/hooks
    const { stdout } = await execa('git', ['rev-parse', '--git-dir']);
    return join(stdout.trim(), 'hooks');
  }
}

async function isInGitRepo(): Promise<boolean> {
  try {
    await execa('git', ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

export async function runHook(action: string): Promise<void> {
  if (!['install', 'remove', 'status'].includes(action)) {
    console.error(chalk.red(`❌ Unknown action: ${action}`));
    console.log(chalk.gray('   Available actions: install, remove, status'));
    process.exit(1);
  }

  if (!(await isInGitRepo())) {
    console.error(chalk.red('❌ Not in a git repository.'));
    process.exit(1);
  }

  const hooksPath = await getGitHooksPath();
  const hookFile = join(hooksPath, HOOK_NAME);

  if (action === 'status') {
    await showStatus(hookFile);
  } else if (action === 'install') {
    await installHook(hookFile, hooksPath);
  } else if (action === 'remove') {
    await removeHook(hookFile);
  }
}

async function showStatus(hookFile: string): Promise<void> {
  if (existsSync(hookFile)) {
    const content = readFileSync(hookFile, 'utf-8');
    if (content.includes('git-ai')) {
      console.log(chalk.green('✅ git-ai hook is installed'));
      console.log(chalk.gray(`   Location: ${hookFile}`));
    } else {
      console.log(chalk.yellow('⚠️  A prepare-commit-msg hook exists but is not from git-ai'));
      console.log(chalk.gray(`   Location: ${hookFile}`));
    }
  } else {
    console.log(chalk.gray('❌ git-ai hook is not installed'));
  }
}

async function installHook(hookFile: string, hooksPath: string): Promise<void> {
  // Check if hook already exists
  if (existsSync(hookFile)) {
    const content = readFileSync(hookFile, 'utf-8');
    if (content.includes('git-ai')) {
      console.log(chalk.yellow('⚠️  git-ai hook is already installed'));
      return;
    }

    // Backup existing hook
    const backupFile = `${hookFile}.backup`;
    writeFileSync(backupFile, content);
    console.log(chalk.gray(`   Existing hook backed up to: ${backupFile}`));
  }

  // Ensure hooks directory exists
  if (!existsSync(hooksPath)) {
    await execa('mkdir', ['-p', hooksPath]);
  }

  // Write hook script
  writeFileSync(hookFile, HOOK_SCRIPT);
  chmodSync(hookFile, 0o755);

  console.log(chalk.green('✅ git-ai hook installed successfully!'));
  console.log(chalk.gray(`   Location: ${hookFile}`));
  console.log('');
  console.log(chalk.cyan('📝 How it works:'));
  console.log(chalk.gray('   When you run `git commit` without -m flag,'));
  console.log(chalk.gray('   git-ai will auto-generate a commit message.'));
  console.log('');
  console.log(chalk.cyan('💡 Tips:'));
  console.log(chalk.gray('   • Skip hook: git commit --no-verify'));
  console.log(chalk.gray('   • Remove hook: git-ai hook remove'));
}

async function removeHook(hookFile: string): Promise<void> {
  if (!existsSync(hookFile)) {
    console.log(chalk.gray('❌ No hook to remove'));
    return;
  }

  const content = readFileSync(hookFile, 'utf-8');
  if (!content.includes('git-ai')) {
    console.log(chalk.yellow('⚠️  The existing hook is not from git-ai, skipping removal'));
    return;
  }

  unlinkSync(hookFile);

  // Restore backup if exists
  const backupFile = `${hookFile}.backup`;
  if (existsSync(backupFile)) {
    const backupContent = readFileSync(backupFile, 'utf-8');
    writeFileSync(hookFile, backupContent);
    chmodSync(hookFile, 0o755);
    unlinkSync(backupFile);
    console.log(chalk.gray('   Previous hook restored from backup'));
  }

  console.log(chalk.green('✅ git-ai hook removed successfully!'));
}
