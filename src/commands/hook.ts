import chalk from 'chalk';
import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync, unlinkSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOOK_NAME = 'prepare-commit-msg';
const GLOBAL_HOOKS_DIR = '.git-ai-hooks';
const HOOK_MARKER = '# git-ai-hook-start';
const HOOK_END_MARKER = '# git-ai-hook-end';

// Hook script with all protections
const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
# git-ai hook - auto-generate commit message
# To disable: GIT_AI_DISABLED=1 git commit

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Skip if disabled
if [ "$GIT_AI_DISABLED" = "1" ]; then
  exit 0
fi

# Recursion guard - skip if git-ai is already running
# (e.g., when git-ai commit calls git commit internally)
if [ "$GIT_AI_RUNNING" = "1" ]; then
  exit 0
fi

# Only run for regular commits (not merge, squash, amend, etc.)
if [ -n "$COMMIT_SOURCE" ]; then
  exit 0
fi

# Check if there's already a non-comment message
if [ -s "$COMMIT_MSG_FILE" ]; then
  EXISTING_MSG=$(grep -v "^#" "$COMMIT_MSG_FILE" | grep -v "^$" | head -1)
  if [ -n "$EXISTING_MSG" ]; then
    exit 0
  fi
fi

# Generate commit message using git-ai msg
if command -v git-ai >/dev/null 2>&1; then
  MSG=$(git-ai msg --quiet 2>/dev/null)
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ] && [ -n "$MSG" ]; then
    # Preserve existing comments, prepend AI message
    if [ -f "$COMMIT_MSG_FILE" ]; then
      COMMENTS=$(grep "^#" "$COMMIT_MSG_FILE" || true)
      printf '%s\\n\\n%s\\n' "$MSG" "$COMMENTS" > "$COMMIT_MSG_FILE"
    else
      printf '%s\\n' "$MSG" > "$COMMIT_MSG_FILE"
    fi
  fi
fi
${HOOK_END_MARKER}

`;

// Wrapper template for chaining with existing hook
const WRAPPER_TEMPLATE = `#!/bin/sh
${HOOK_MARKER}
# git-ai hook wrapper - chains with existing hook
# To disable: GIT_AI_DISABLED=1 git commit

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
SHA1="$3"

# Skip if disabled
if [ "$GIT_AI_DISABLED" = "1" ]; then
  if [ -x "__ORIGINAL_HOOK__" ]; then
    "__ORIGINAL_HOOK__" "$COMMIT_MSG_FILE" "$COMMIT_SOURCE" "$SHA1"
  fi
  exit $?
fi

# Recursion guard - skip if git-ai is already running
if [ "$GIT_AI_RUNNING" = "1" ]; then
  if [ -x "__ORIGINAL_HOOK__" ]; then
    "__ORIGINAL_HOOK__" "$COMMIT_MSG_FILE" "$COMMIT_SOURCE" "$SHA1"
  fi
  exit $?
fi

# Only run for regular commits
if [ -n "$COMMIT_SOURCE" ]; then
  if [ -x "__ORIGINAL_HOOK__" ]; then
    "__ORIGINAL_HOOK__" "$COMMIT_MSG_FILE" "$COMMIT_SOURCE" "$SHA1"
  fi
  exit $?
fi

# Check if there's already a non-comment message
if [ -s "$COMMIT_MSG_FILE" ]; then
  EXISTING_MSG=$(grep -v "^#" "$COMMIT_MSG_FILE" | grep -v "^$" | head -1)
  if [ -n "$EXISTING_MSG" ]; then
    if [ -x "__ORIGINAL_HOOK__" ]; then
      "__ORIGINAL_HOOK__" "$COMMIT_MSG_FILE" "$COMMIT_SOURCE" "$SHA1"
    fi
    exit $?
  fi
fi

# Generate commit message using git-ai msg
if command -v git-ai >/dev/null 2>&1; then
  MSG=$(git-ai msg --quiet 2>/dev/null)
  EXIT_CODE=$?

  if [ $EXIT_CODE -eq 0 ] && [ -n "$MSG" ]; then
    if [ -f "$COMMIT_MSG_FILE" ]; then
      COMMENTS=$(grep "^#" "$COMMIT_MSG_FILE" || true)
      printf '%s\\n\\n%s\\n' "$MSG" "$COMMENTS" > "$COMMIT_MSG_FILE"
    else
      printf '%s\\n' "$MSG" > "$COMMIT_MSG_FILE"
    fi
  fi
fi

# Call original hook
if [ -x "__ORIGINAL_HOOK__" ]; then
  "__ORIGINAL_HOOK__" "$COMMIT_MSG_FILE" "$COMMIT_SOURCE" "$SHA1"
  exit $?
fi
${HOOK_END_MARKER}

exit 0
`;

function getGlobalHooksPath(): string {
  return join(homedir(), GLOBAL_HOOKS_DIR);
}

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

async function getGlobalCoreHooksPath(): Promise<string | null> {
  try {
    const { stdout } = await execa('git', ['config', '--global', '--get', 'core.hooksPath']);
    return stdout.trim();
  } catch {
    return null;
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

function isGitAiHook(content: string): boolean {
  // Only match our specific marker to avoid false positives
  return content.includes(HOOK_MARKER);
}

export interface HookOptions {
  global?: boolean;
}

export async function runHook(action: string, options: HookOptions = {}): Promise<void> {
  if (!['install', 'remove', 'status'].includes(action)) {
    console.error(chalk.red(`❌ Unknown action: ${action}`));
    console.log(chalk.gray('   Available actions: install, remove, status'));
    process.exit(1);
  }

  const isGlobal = options.global ?? false;

  if (isGlobal) {
    // Global hook management
    const globalHooksPath = getGlobalHooksPath();
    const hookFile = join(globalHooksPath, HOOK_NAME);

    if (action === 'status') {
      await showGlobalStatus(hookFile, globalHooksPath);
    } else if (action === 'install') {
      await installGlobalHook(hookFile, globalHooksPath);
    } else if (action === 'remove') {
      await removeGlobalHook(hookFile, globalHooksPath);
    }
  } else {
    // Local hook management (existing behavior)
    if (!(await isInGitRepo())) {
      console.error(chalk.red('❌ Not in a git repository.'));
      console.log(chalk.gray('   Use --global to install hook for all repositories.'));
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
}

async function showStatus(hookFile: string): Promise<void> {
  if (existsSync(hookFile)) {
    const content = readFileSync(hookFile, 'utf-8');
    if (isGitAiHook(content)) {
      console.log(chalk.green('✅ git-ai hook is installed'));
      console.log(chalk.gray(`   Location: ${hookFile}`));

      // Check if it's a wrapper
      const originalHook = `${hookFile}.original`;
      if (existsSync(originalHook)) {
        console.log(chalk.cyan('   Mode: Wrapper (chained with original hook)'));
      } else {
        console.log(chalk.cyan('   Mode: Standalone'));
      }
    } else {
      console.log(chalk.yellow('⚠️  A prepare-commit-msg hook exists but is not from git-ai'));
      console.log(chalk.gray(`   Location: ${hookFile}`));
      console.log(chalk.gray('   Run `git-ai hook install` to add git-ai (will chain with existing hook)'));
    }
  } else {
    console.log(chalk.gray('❌ git-ai hook is not installed'));
  }
}

async function installHook(hookFile: string, hooksPath: string): Promise<void> {
  // Ensure hooks directory exists
  if (!existsSync(hooksPath)) {
    await execa('mkdir', ['-p', hooksPath]);
  }

  // Check if hook already exists
  if (existsSync(hookFile)) {
    const content = readFileSync(hookFile, 'utf-8');

    if (isGitAiHook(content)) {
      // Already has git-ai, update it
      console.log(chalk.yellow('⚠️  git-ai hook already installed, updating...'));

      // Check if there's an original hook
      const originalHook = `${hookFile}.original`;
      if (existsSync(originalHook)) {
        // Re-create wrapper with updated script
        const wrapper = WRAPPER_TEMPLATE.replace(/__ORIGINAL_HOOK__/g, originalHook);
        writeFileSync(hookFile, wrapper);
        chmodSync(hookFile, 0o755);
        console.log(chalk.green('✅ git-ai hook updated (wrapper mode)'));
      } else {
        writeFileSync(hookFile, HOOK_SCRIPT);
        chmodSync(hookFile, 0o755);
        console.log(chalk.green('✅ git-ai hook updated'));
      }
      return;
    }

    // Existing non-git-ai hook - use wrapper mode
    const originalHook = `${hookFile}.original`;

    // Backup original
    writeFileSync(originalHook, content);
    chmodSync(originalHook, 0o755);
    console.log(chalk.gray(`   Original hook saved to: ${originalHook}`));

    // Install wrapper
    const wrapper = WRAPPER_TEMPLATE.replace(/__ORIGINAL_HOOK__/g, originalHook);
    writeFileSync(hookFile, wrapper);
    chmodSync(hookFile, 0o755);

    console.log(chalk.green('✅ git-ai hook installed (wrapper mode)'));
    console.log(chalk.cyan('   Your original hook will still be executed after git-ai'));
  } else {
    // No existing hook - install standalone
    writeFileSync(hookFile, HOOK_SCRIPT);
    chmodSync(hookFile, 0o755);
    console.log(chalk.green('✅ git-ai hook installed'));
  }

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
  if (!isGitAiHook(content)) {
    console.log(chalk.yellow('⚠️  The existing hook is not from git-ai, skipping removal'));
    return;
  }

  // Check for original hook
  const originalHook = `${hookFile}.original`;

  if (existsSync(originalHook)) {
    // Restore original hook
    const originalContent = readFileSync(originalHook, 'utf-8');
    writeFileSync(hookFile, originalContent);
    chmodSync(hookFile, 0o755);
    unlinkSync(originalHook);
    console.log(chalk.green('✅ git-ai hook removed'));
    console.log(chalk.gray('   Original hook restored'));
  } else {
    // Just remove the hook
    unlinkSync(hookFile);
    console.log(chalk.green('✅ git-ai hook removed'));
  }
}

// ==================== Global Hook Functions ====================

async function showGlobalStatus(hookFile: string, globalHooksPath: string): Promise<void> {
  const currentGlobalPath = await getGlobalCoreHooksPath();

  if (existsSync(hookFile) && currentGlobalPath === globalHooksPath) {
    const content = readFileSync(hookFile, 'utf-8');
    if (isGitAiHook(content)) {
      console.log(chalk.green('✅ git-ai global hook is installed'));
      console.log(chalk.gray(`   Location: ${hookFile}`));
      console.log(chalk.gray(`   core.hooksPath: ${globalHooksPath}`));
    } else {
      console.log(chalk.yellow('⚠️  Global hook exists but is not from git-ai'));
    }
  } else if (currentGlobalPath) {
    console.log(chalk.yellow('⚠️  Global core.hooksPath is set to a different location'));
    console.log(chalk.gray(`   Current: ${currentGlobalPath}`));
    console.log(chalk.gray(`   Expected: ${globalHooksPath}`));
  } else {
    console.log(chalk.gray('❌ git-ai global hook is not installed'));
  }
}

async function installGlobalHook(hookFile: string, globalHooksPath: string): Promise<void> {
  // Create global hooks directory if not exists
  if (!existsSync(globalHooksPath)) {
    mkdirSync(globalHooksPath, { recursive: true });
  }

  // Check if there's already a global hooks path configured
  const currentGlobalPath = await getGlobalCoreHooksPath();
  if (currentGlobalPath && currentGlobalPath !== globalHooksPath) {
    console.log(chalk.yellow('⚠️  Global core.hooksPath is already set to:'));
    console.log(chalk.gray(`   ${currentGlobalPath}`));
    console.log(chalk.yellow('   This will override it. Existing hooks may stop working.'));
    console.log('');
  }

  // Check if hook file already exists
  if (existsSync(hookFile)) {
    const content = readFileSync(hookFile, 'utf-8');
    if (isGitAiHook(content)) {
      console.log(chalk.yellow('⚠️  Global hook already installed, updating...'));
    }
  }

  // Write hook script
  writeFileSync(hookFile, HOOK_SCRIPT);
  chmodSync(hookFile, 0o755);

  // Set global core.hooksPath
  await execa('git', ['config', '--global', 'core.hooksPath', globalHooksPath]);

  console.log(chalk.green('✅ git-ai global hook installed'));
  console.log(chalk.gray(`   Location: ${hookFile}`));
  console.log(chalk.gray(`   core.hooksPath: ${globalHooksPath}`));
  console.log('');
  console.log(chalk.cyan('📝 How it works:'));
  console.log(chalk.gray('   All git repositories will now use git-ai to'));
  console.log(chalk.gray('   auto-generate commit messages when you run `git commit`.'));
  console.log('');
  console.log(chalk.cyan('💡 Tips:'));
  console.log(chalk.gray('   • Skip hook: git commit --no-verify'));
  console.log(chalk.gray('   • Disable temporarily: GIT_AI_DISABLED=1 git commit'));
  console.log(chalk.gray('   • Remove global hook: git-ai hook remove --global'));
  console.log('');
  console.log(chalk.yellow('⚠️  Note: Local repository hooks (.git/hooks) will be ignored'));
  console.log(chalk.gray('   when global core.hooksPath is set.'));
}

async function removeGlobalHook(hookFile: string, globalHooksPath: string): Promise<void> {
  const currentGlobalPath = await getGlobalCoreHooksPath();

  if (!currentGlobalPath) {
    console.log(chalk.gray('❌ No global hook configured'));
    return;
  }

  if (currentGlobalPath !== globalHooksPath) {
    console.log(chalk.yellow('⚠️  Global core.hooksPath points to a different location:'));
    console.log(chalk.gray(`   ${currentGlobalPath}`));
    console.log(chalk.gray('   Not removing to avoid breaking other hooks.'));
    return;
  }

  if (!existsSync(hookFile)) {
    // Just unset the config
    await execa('git', ['config', '--global', '--unset', 'core.hooksPath']);
    console.log(chalk.green('✅ Global core.hooksPath removed'));
    return;
  }

  const content = readFileSync(hookFile, 'utf-8');
  if (!isGitAiHook(content)) {
    console.log(chalk.yellow('⚠️  The global hook is not from git-ai, skipping removal'));
    return;
  }

  // Remove hook file
  unlinkSync(hookFile);

  // Unset global core.hooksPath
  await execa('git', ['config', '--global', '--unset', 'core.hooksPath']);

  console.log(chalk.green('✅ git-ai global hook removed'));
  console.log(chalk.gray('   Local repository hooks will now work again.'));
}
