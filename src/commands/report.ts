import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../utils/config.js';
import { isGitInstalled, isInGitRepo, getRecentCommits } from '../utils/git.js';
import { createAIClient, generateWeeklyReport } from '../utils/ai.js';

export async function runReport(options: { days?: number } = {}): Promise<void> {
  // Environment checks
  if (!(await isGitInstalled())) {
    console.error(chalk.red('❌ Git is not installed.'));
    process.exit(1);
  }

  if (!(await isInGitRepo())) {
    console.error(chalk.red('❌ Not in a git repository.'));
    process.exit(1);
  }

  const config = getConfig();
  if (!config) {
    console.error(chalk.red('❌ Configuration not found. Run `git-ai config` first.'));
    process.exit(1);
  }

  let days = options.days;

  if (!days) {
    const { range } = await inquirer.prompt<{ range: string }>([
      {
        type: 'list',
        name: 'range',
        message: 'Select report time range:',
        choices: [
          { name: '📅 This Week (Last 7 days)', value: '7' },
          { name: '🗓️  This Month (Last 30 days)', value: '30' },
          { name: '⏪ Yesterday (Last 1 day)', value: '1' },
          { name: '🔢 Custom', value: 'custom' },
        ],
      },
    ]);

    if (range === 'custom') {
      const { customDays } = await inquirer.prompt<{ customDays: string }>([
        {
          type: 'input',
          name: 'customDays',
          message: 'Enter number of days:',
          validate: (input) => (!isNaN(Number(input)) ? true : 'Please enter a number'),
        },
      ]);
      days = Number(customDays);
    } else {
      days = Number(range);
    }
  }

  const spinner = ora({
    text: `Fetching git commits for the last ${days} days...`,
    color: 'cyan',
  }).start();

  const commits = await getRecentCommits(days);

  if (commits.length === 0) {
    spinner.fail('No commits found for the selected period.');
    console.log(chalk.gray('   Try selecting a wider date range or check your user.name config.'));
    return;
  }

  spinner.text = `Analyzing ${commits.length} commits with ${config.model}...`;

  try {
    const client = createAIClient(config);
    const report = await generateWeeklyReport(client, commits, config);
    
    spinner.succeed('Report generated!');
    
    console.log(chalk.gray('\n──────────────────────────────────────────────────────────'));
    console.log(report);
    console.log(chalk.gray('──────────────────────────────────────────────────────────\n'));
    
    console.log(chalk.green('✨ Tip: You can copy the text above to your weekly report tool.'));

  } catch (error) {
    spinner.fail('Failed to generate report');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(`❌ ${errorMessage}`));
  }
}
