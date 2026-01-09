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
import { createAIClient, generateCommitMessage } from '../utils/ai.js';

type ActionChoice = 'commit' | 'edit' | 'regenerate' | 'cancel';

export async function runCommit(): Promise<void> {
  // Environment checks
  if (!(await isGitInstalled())) {
    console.error(chalk.red('❌ Git is not installed. Please install git first.'));
    process.exit(1);
  }

  if (!(await isInGitRepo())) {
    console.error(chalk.red('❌ Not in a git repository.'));
    process.exit(1);
  }

  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    console.error(chalk.red('❌ No staged changes found.'));
    console.log(chalk.gray('   Use `git add <files>` to stage your changes first.'));
    process.exit(1);
  }

  // Check config
  const config = getConfig();
  if (!config) {
    console.error(chalk.red('❌ Configuration not found.'));
    console.log(chalk.gray('   Run `git ai config` to set up your AI provider.'));
    process.exit(1);
  }

  // Show staged files
  console.log(chalk.cyan('\n📁 Staged files:'));
  stagedFiles.forEach((file) => {
    console.log(chalk.gray(`   ${file}`));
  });

  // Get filtered diff
  const { diff, truncated } = await getFilteredDiff();

  if (truncated) {
    console.log(chalk.yellow('\n⚠️  Diff was truncated due to size limits.'));
  }

  // Create AI client
  const client = createAIClient(config);

  let commitMessage = await generateWithSpinner(client, diff, config);

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
      commitMessage = await generateWithSpinner(client, diff, config);
    } else {
      console.log(chalk.gray('\n👋 Commit cancelled.\n'));
      break;
    }
  }
}

async function generateWithSpinner(
  client: ReturnType<typeof createAIClient>,
  diff: string,
  config: ReturnType<typeof getConfig> & object
): Promise<string> {
  const spinner = ora({
    text: 'Generating commit message...',
    color: 'cyan',
  }).start();

  try {
    const message = await generateCommitMessage(client, diff, config);
    spinner.succeed('Commit message generated!');
    return message;
  } catch (error) {
    spinner.fail('Failed to generate commit message');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(`\n❌ Error: ${errorMessage}`));
    process.exit(1);
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
    console.error(chalk.red(`\n❌ Error: ${errorMessage}`));
    process.exit(1);
  }
}
