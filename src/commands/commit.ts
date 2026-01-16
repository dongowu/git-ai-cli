import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../utils/config.js';
import {
  isGitInstalled,
  isInGitRepo,
  getStagedFiles,
  getFilteredDiff,
  commit,
  getBranchName,
  getRecentCommits,
  getUnstagedFiles,
  addFiles,
} from '../utils/git.js';
import {
  createAIClient,
  generateCommitMessage,
  type CommitMessageGenerationInput,
} from '../utils/ai.js';
import type { AIConfig } from '../types.js';

type ActionChoice = 'commit' | 'edit' | 'regenerate' | 'cancel';

export interface CommitOptions {
  autoCommit?: boolean;
  numChoices?: number;
  hookMode?: boolean;
  locale?: string;
  agentMode?: boolean;
}

function exitWithError(message: string, hint?: string, silent = false): never {
  if (!silent) {
    console.error(chalk.red(`❌ ${message}`));
    if (hint) {
      console.log(chalk.gray(`   ${hint}`));
    }
  }
  process.exit(1);
}

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const { autoCommit = false, numChoices = 1, hookMode = false, locale } = options;

  // Recursion guard - prevent hook from triggering another git-ai
  if (process.env.GIT_AI_RUNNING === '1') {
    if (!hookMode) {
      console.log(chalk.yellow('⚠️  git-ai is already running (recursion prevented)'));
    }
    process.exit(0);
  }
  process.env.GIT_AI_RUNNING = '1';

  // Environment checks
  if (!(await isGitInstalled())) {
    exitWithError('Git is not installed. Please install git first.', undefined, hookMode);
  }

  if (!(await isInGitRepo())) {
    exitWithError('Not in a git repository.', undefined, hookMode);
  }

  let stagedFiles = await getStagedFiles();
  
  if (stagedFiles.length === 0) {
    // Interactive add
    const unstagedFiles = await getUnstagedFiles();
    
    if (unstagedFiles.length > 0 && !hookMode) {
      console.log(chalk.yellow('⚠️  No staged changes found.'));
      const { selectedFiles } = await inquirer.prompt<{ selectedFiles: string[] }>([
        {
          type: 'checkbox',
          name: 'selectedFiles',
          message: 'Select files to stage:',
          choices: unstagedFiles,
          pageSize: 15,
        },
      ]);

      if (selectedFiles.length > 0) {
        await addFiles(selectedFiles);
        stagedFiles = await getStagedFiles();
        console.log(chalk.green(`✅ Staged ${selectedFiles.length} files.`));
      } else {
        console.log(chalk.gray('No files selected. Exiting.'));
        process.exit(0);
      }
    } else {
      exitWithError(
        'No staged changes found.',
        'Use `git add <files>` to stage your changes first.',
        hookMode
      );
    }
  }

  // Check config
  const config = getConfig();
  if (!config) {
    exitWithError('Configuration not found.', 'Run `git-ai config` to set up your AI provider.');
  }

  // Override locale if provided
  if (locale && (locale === 'zh' || locale === 'en')) {
    config.locale = locale as 'zh' | 'en';
  }

  // Show staged files (skip in hook mode)
  if (!hookMode) {
    console.log(chalk.cyan('\n📁 Staged files:'));
    stagedFiles.forEach((file) => {
      console.log(chalk.gray(`   ${file}`));
    });
  }
  const branchName = await getBranchName();
  const recentCommits = await getRecentCommits(10); // Get last 10 commits for style reference

  let diffCache: { diff: string; truncated: boolean; ignoredFiles: string[] } | null = null;
  let diffInfoPrinted = false;

  const maybePrintDiffInfo = (ignoredFiles: string[], truncated: boolean): void => {
    if (hookMode || diffInfoPrinted) return;
    if (ignoredFiles.length > 0) {
      const preview = ignoredFiles.slice(0, 8).join(', ');
      const more = ignoredFiles.length > 8 ? ` (+${ignoredFiles.length - 8} more)` : '';
      console.log(chalk.gray(`\n📦 Ignored from diff (token optimization): ${preview}${more}`));
    }
    if (truncated) {
      console.log(chalk.yellow('\n⚠️  Diff was truncated due to size limits.'));
    }
    diffInfoPrinted = true;
  };

  const loadDiff = async (): Promise<{ diff: string; truncated: boolean; ignoredFiles: string[] }> => {
    if (!diffCache) {
      diffCache = await getFilteredDiff(stagedFiles);
      maybePrintDiffInfo(diffCache.ignoredFiles, diffCache.truncated);
    }
    return diffCache;
  };

  const shouldLazyDiff = options.agentMode && numChoices === 1;
  let diff: string | undefined;
  let ignoredFiles: string[] | undefined;
  let truncated: boolean | undefined;
  let diffLoader: CommitMessageGenerationInput['diffLoader'] | undefined;

  if (shouldLazyDiff) {
    diffLoader = loadDiff;
  } else {
    const loaded = await loadDiff();
    diff = loaded.diff;
    ignoredFiles = loaded.ignoredFiles;
    truncated = loaded.truncated;
  }

  // Create AI client
  const client = createAIClient(config);
  const input: CommitMessageGenerationInput = {
    diff,
    diffLoader,
    stagedFiles,
    ignoredFiles,
    truncated,
    branchName,
    recentCommits,
    forceAgent: options.agentMode,
  };

  // Generate commit message(s)
  let commitMessage: string;

  if (hookMode) {
    // Hook mode: silent generation, output only the message
    try {
      const messages = await generateCommitMessage(client, input, config);
      commitMessage = messages[0];
      console.log(commitMessage);
      return;
    } catch {
      process.exit(1);
    }
  }

  if (numChoices > 1) {
    // Generate multiple choices
    const messages = await generateMultipleWithSpinner(client, input, config, numChoices);
    if (autoCommit) {
      // Auto mode: use first message
      commitMessage = messages[0];
    } else {
      commitMessage = await selectFromChoices(messages);
    }
  } else {
    commitMessage = await generateWithSpinner(client, input, config);
  }

  // Auto commit mode
  if (autoCommit) {
    console.log(chalk.green('\n✨ Generated commit message:\n'));
    console.log(chalk.white.bold(`   ${commitMessage.split('\n').join('\n   ')}`));
    await performCommit(commitMessage);
    return;
  }

  // Interactive loop
  while (true) {
    console.log(chalk.green('\n✨ Generated commit message:\n'));
    console.log(chalk.white.bold(`   ${commitMessage.split('\n').join('\n   ')}`));
    console.log('');

    const { action } = await inquirer.prompt<{ action: ActionChoice }>([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🚀 Commit', value: 'commit' },
          { name: '📝 Edit', value: 'edit' },
          { name: '🔄 Regenerate', value: 'regenerate' },
          { name: '❌ Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'commit') {
      await performCommit(commitMessage);
      break;
    } else if (action === 'edit') {
      const { editedMessage } = await inquirer.prompt<{ editedMessage: string }>([
        {
          type: 'editor',
          name: 'editedMessage',
          message: 'Edit your commit message:',
          default: commitMessage,
        },
      ]);
      commitMessage = editedMessage.trim();
      if (!commitMessage) {
        console.log(chalk.yellow('⚠️  Commit message cannot be empty.'));
        continue;
      }
    } else if (action === 'regenerate') {
      if (numChoices > 1) {
        const messages = await generateMultipleWithSpinner(client, input, config, numChoices);
        commitMessage = await selectFromChoices(messages);
      } else {
        commitMessage = await generateWithSpinner(client, input, config);
      }
    } else {
      console.log(chalk.gray('\n👋 Commit cancelled.\n'));
      break;
    }
  }
}

async function selectFromChoices(messages: string[]): Promise<string> {
  if (messages.length === 1) {
    return messages[0];
  }

  const { selected } = await inquirer.prompt<{ selected: string }>([
    {
      type: 'list',
      name: 'selected',
      message: 'Select a commit message:',
      choices: messages.map((msg, i) => ({
        name: `${i + 1}. ${msg.split('\n')[0]}`,
        value: msg,
      })),
    },
  ]);

  return selected;
}

async function generateWithSpinner(
  client: ReturnType<typeof createAIClient>,
  input: CommitMessageGenerationInput,
  config: AIConfig
): Promise<string> {
  const spinner = ora({
    text: 'Generating commit message...',
    color: 'cyan',
  }).start();

  try {
    const messages = await generateCommitMessage(client, input, config);
    spinner.succeed('Commit message generated!');
    return messages[0];
  } catch (error) {
    spinner.fail('Failed to generate commit message');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    exitWithError(errorMessage);
  }
}

async function generateMultipleWithSpinner(
  client: ReturnType<typeof createAIClient>,
  input: CommitMessageGenerationInput,
  config: AIConfig,
  count: number
): Promise<string[]> {
  const spinner = ora({
    text: `Generating ${count} commit messages...`,
    color: 'cyan',
  }).start();

  try {
    // Optimized: Single request for multiple choices
    const messages = await generateCommitMessage(client, input, config, count);
    
    // Dedupe
    const unique = [...new Set(messages)];
    spinner.succeed(`Generated ${unique.length} commit message(s)!`);
    return unique;
  } catch (error) {
    spinner.fail('Failed to generate commit messages');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    exitWithError(errorMessage);
  }
}

async function performCommit(message: string): Promise<void> {
  const spinner = ora({
    text: 'Creating commit...',
    color: 'cyan',
  }).start();

  try {
    await commit(message);
    spinner.succeed('Commit created successfully!');
    console.log(chalk.green('\n🎉 Done!\n'));
  } catch (error) {
    spinner.fail('Failed to create commit');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    exitWithError(errorMessage);
  }
}

