import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getLocalConfigError } from '../utils/config.js';
import { isGitInstalled, isInGitRepo, getCommitsBetween, getLastTag } from '../utils/git.js';
import { createAIClient, generateReleaseNotes } from '../utils/ai.js';

type ReleaseOptions = { from?: string; to?: string; json?: boolean };

export async function runRelease(options: ReleaseOptions = {}): Promise<void> {
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

  const from = options.from?.trim() || (await getLastTag());
  const to = options.to?.trim() || 'HEAD';

  if (!from) {
    const msg = 'Unable to determine previous tag. Use --from <ref>.';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  const spinner = !options.json
    ? ora({
        text: `Collecting commits for ${from}..${to}...`,
        color: 'cyan',
      }).start()
    : null;

  const commits = await getCommitsBetween(from, to);

  if (commits.length === 0) {
    if (spinner) spinner.fail('No commits found for the selected range.');
    const msg = 'No commits found for the selected range.';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings, from, to }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    return;
  }

  if (spinner) spinner.text = `Generating release notes with ${config.model}...`;

  try {
    const client = createAIClient(config);
    const notes = await generateReleaseNotes(client, { commits, from, to }, config);

    if (spinner) spinner.succeed('Release notes generated!');

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            notes,
            warnings: warnings.length ? warnings : undefined,
            from,
            to,
            commitCount: commits.length,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(chalk.gray('\n──────────────────────────────────────────────────────────'));
    console.log(notes);
    console.log(chalk.gray('──────────────────────────────────────────────────────────\n'));
  } catch (error) {
    if (spinner) spinner.fail('Failed to generate release notes');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: errorMessage, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${errorMessage}`));
  }
}
