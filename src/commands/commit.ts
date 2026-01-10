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
}

function exitWithError(message: string, hint?: string): never {
  console.error(chalk.red(`❌ ${message}`));
  if (hint) {
    console.log(chalk.gray(`   ${hint}`));
  }
  process.exit(1);
}

export async function runCommit(options: CommitOptions = {}): Promise<void> {
  const { autoCommit = false, numChoices = 1 } = options;

  // Environment checks
  if (!(await isGitInstalled())) {
    exitWithError('Git is not installed. Please install git first.');
  }

  if (!(await isInGitRepo())) {
    exitWithError('Not in a git repository.');
  }

  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    exitWithError(
      'No staged changes found.',
      'Use `git add <files>` to stage your changes first.'
    );
  }

  // Check config
  const config = getConfig();
  if (!config) {
    exitWithError('Configuration not found.', 'Run `git-ai config` to set up your AI provider.');
  }

  // Show staged files
  console.log(chalk.cyan('\n📁 Staged files:'));
  stagedFiles.forEach((file) => {
    console.log(chalk.gray(`   ${file}`));
  });

  // Get filtered diff
  const { diff, truncated, ignoredFiles } = await getFilteredDiff(stagedFiles);

  if (ignoredFiles.length > 0) {
    const preview = ignoredFiles.slice(0, 8).join(', ');
    const more = ignoredFiles.length > 8 ? ` (+${ignoredFiles.length - 8} more)` : '';
    console.log(chalk.gray(`\n🧹 Ignored from diff (token optimization): ${preview}${more}`));
  }

  if (truncated) {
    console.log(chalk.yellow('\n⚠️  Diff was truncated due to size limits.'));
  }

  // Create AI client
  const client = createAIClient(config);
  const input: CommitMessageGenerationInput = { diff, stagedFiles, ignoredFiles, truncated };

  // Generate commit message(s)
  let commitMessage: string;

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
    const message = await generateCommitMessage(client, input, config);
    spinner.succeed('Commit message generated!');
    return message;
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
    const promises = Array.from({ length: count }, () =>
      generateCommitMessage(client, input, config)
    );
    const messages = await Promise.all(promises);
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
