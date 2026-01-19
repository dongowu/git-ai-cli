import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getLocalConfigError } from '../utils/config.js';
import { isGitInstalled, isInGitRepo, getRecentCommits, getCommitsInRange } from '../utils/git.js';
import { createAIClient, generateWeeklyReport, validateCommitRules } from '../utils/ai.js';

type ReportOptions = { days?: number; from?: string; to?: string; json?: boolean };

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t);
}

export async function runReport(options: ReportOptions = {}): Promise<void> {
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
    const localError = getLocalConfigError();
    const suffix = localError
      ? ` Invalid local config at ${localError.path}: ${localError.error}`
      : ' Run `git-ai config` first.';
    console.error(chalk.red(`❌ Configuration not found.${suffix}`));
    process.exit(1);
  }
  const localConfigError = getLocalConfigError();
  const warnings: string[] = [];
  if (localConfigError) {
    const warning = `Failed to parse ${localConfigError.path}: ${localConfigError.error}`;
    warnings.push(warning);
    if (!options.json) {
      console.log(chalk.yellow(`⚠️  ${warning}`));
    }
  }
  const rulesIssues = validateCommitRules(config.rules);
  if (rulesIssues.errors.length || rulesIssues.warnings.length) {
    const warning = `Rules config issues: ${[...rulesIssues.errors, ...rulesIssues.warnings].join(
      '; '
    )}`;
    warnings.push(warning);
    if (!options.json) {
      console.log(chalk.yellow(`⚠️  ${warning}`));
    }
  }

  let days = options.days;
  const from = options.from?.trim();
  const to = options.to?.trim();

  if (from && !isValidDate(from)) {
    const msg = `Invalid --from date: ${from} (expected YYYY-MM-DD)`;
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  if (to && !isValidDate(to)) {
    const msg = `Invalid --to date: ${to} (expected YYYY-MM-DD)`;
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  if (!from && !to && !days) {
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

  const rangeLabel =
    from || to
      ? `range ${from || '...'} → ${to || 'today'}`
      : `last ${days} days`;

  const spinner = !options.json
    ? ora({
        text: `Fetching git commits for the ${rangeLabel}...`,
        color: 'cyan',
      }).start()
    : null;

  const commits =
    from || to
      ? await getCommitsInRange({ since: from, until: to })
      : await getRecentCommits(days as number);

  if (commits.length === 0) {
    if (spinner) {
      spinner.fail('No commits found for the selected period.');
      console.log(chalk.gray('   Try selecting a wider date range or check your user.name config.'));
    }
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: 'No commits found for the selected period.',
            warnings: warnings.length ? warnings : undefined,
            range: { from: from || null, to: to || null, days: from || to ? null : days },
          },
          null,
          2
        )
      );
    }
    return;
  }

  if (spinner) {
    spinner.text = `Analyzing ${commits.length} commits with ${config.model}...`;
  }

  try {
    const client = createAIClient(config);
    const report = await generateWeeklyReport(client, commits, config);
    
    if (spinner) {
      spinner.succeed('Report generated!');
    }
    
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            report,
            warnings: warnings.length ? warnings : undefined,
            range: { from: from || null, to: to || null, days: from || to ? null : days },
            commitCount: commits.length,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(chalk.gray('\n──────────────────────────────────────────────────────────'));
    console.log(report);
    console.log(chalk.gray('──────────────────────────────────────────────────────────\n'));
    
    console.log(chalk.green('✨ Tip: You can copy the text above to your weekly report tool.'));

  } catch (error) {
    if (spinner) {
      spinner.fail('Failed to generate report');
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (options.json) {
      console.log(
        JSON.stringify(
          { success: false, error: errorMessage, warnings: warnings.length ? warnings : undefined },
          null,
          2
        )
      );
      return;
    }
    console.error(chalk.red(`❌ ${errorMessage}`));
  }
}
