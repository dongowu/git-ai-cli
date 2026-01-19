import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getLocalConfigError } from '../utils/config.js';
import { isGitInstalled, isInGitRepo, getCommitsBetween, getDiffStat, getDefaultBaseBranch } from '../utils/git.js';
import { createAIClient, generatePullRequestDescription } from '../utils/ai.js';

type PrOptions = { base?: string; head?: string; json?: boolean };

export async function runPr(options: PrOptions = {}): Promise<void> {
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

  const warnings: string[] = [];
  const localConfigError = getLocalConfigError();
  if (localConfigError) {
    const warning = `Failed to parse ${localConfigError.path}: ${localConfigError.error}`;
    warnings.push(warning);
    if (!options.json) {
      console.log(chalk.yellow(`⚠️  ${warning}`));
    }
  }

  const base = options.base?.trim() || (await getDefaultBaseBranch());
  const head = options.head?.trim() || 'HEAD';

  if (!base) {
    const msg = 'Unable to determine base branch. Use --base <branch>.';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  const spinner = !options.json
    ? ora({
        text: `Collecting commits for ${base}..${head}...`,
        color: 'cyan',
      }).start()
    : null;

  const commits = await getCommitsBetween(base, head);
  const diffStat = await getDiffStat(base, head);

  if (commits.length === 0) {
    if (spinner) spinner.fail('No commits found for the selected range.');
    const msg = 'No commits found for the selected range.';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings, base, head }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    return;
  }

  if (spinner) spinner.text = `Generating PR description with ${config.model}...`;

  try {
    const client = createAIClient(config);
    const description = await generatePullRequestDescription(
      client,
      { commits, diffStat: diffStat || undefined, base, head },
      config
    );

    if (spinner) spinner.succeed('PR description generated!');

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            description,
            warnings: warnings.length ? warnings : undefined,
            base,
            head,
            commitCount: commits.length,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(chalk.gray('\n──────────────────────────────────────────────────────────'));
    console.log(description);
    console.log(chalk.gray('──────────────────────────────────────────────────────────\n'));
  } catch (error) {
    if (spinner) spinner.fail('Failed to generate PR description');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: errorMessage, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${errorMessage}`));
  }
}
