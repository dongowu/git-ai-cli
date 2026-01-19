import chalk from 'chalk';
import ora from 'ora';
import { getConfig, getLocalConfigError } from '../utils/config.js';
import {
  isGitInstalled,
  isInGitRepo,
  getStagedFiles,
  getFilteredDiff,
  getBranchName,
  getRecentCommits,
} from '../utils/git.js';
import {
  createAIClient,
  generateCommitMessage,
  validateCommitRules,
  type CommitMessageGenerationInput,
} from '../utils/ai.js';

export interface MsgOptions {
  json?: boolean;
  quiet?: boolean;
  num?: number;
  locale?: string;
}

export interface MsgResult {
  success: boolean;
  message?: string;
  messages?: string[];
  error?: string;
  warnings?: string[];
  metadata?: {
    stagedFiles: string[];
    truncated: boolean;
    ignoredFiles: string[];
  };
}

function getMsgDelimiter(): string {
  const raw = (process.env.GIT_AI_MSG_DELIM || '').trim();
  return raw || '<<<GIT_AI_END>>>';
}

function exitWithError(message: string, options: MsgOptions): never {
  if (options.json) {
    const result: MsgResult = { success: false, error: message };
    console.log(JSON.stringify(result, null, 2));
  } else if (!options.quiet) {
    console.error(chalk.red(`❌ ${message}`));
  }
  process.exit(1);
}

export async function runMsg(options: MsgOptions = {}): Promise<void> {
  const { json = false, quiet = false, num = 1, locale } = options;

  // Environment checks
  if (!(await isGitInstalled())) {
    exitWithError('Git is not installed.', options);
  }

  if (!(await isInGitRepo())) {
    exitWithError('Not in a git repository.', options);
  }

  const stagedFiles = await getStagedFiles();
  if (stagedFiles.length === 0) {
    exitWithError('No staged changes found. Use `git add <files>` first.', options);
  }

  // Check config
  const config = getConfig();
  if (!config) {
    const localError = getLocalConfigError();
    const suffix = localError
      ? ` Invalid local config at ${localError.path}: ${localError.error}`
      : ' Run `git-ai config` first.';
    exitWithError(`Configuration not found.${suffix}`, options);
  }
  const localConfigError = getLocalConfigError();
  const warnings: string[] = [];
  if (localConfigError) {
    const warning = `Failed to parse ${localConfigError.path}: ${localConfigError.error}`;
    warnings.push(warning);
    if (!json && !quiet) {
      console.log(chalk.yellow(`⚠️  ${warning}`));
    }
  }
  const rulesIssues = validateCommitRules(config.rules);
  if (rulesIssues.errors.length || rulesIssues.warnings.length) {
    const warning = `Rules config issues: ${[...rulesIssues.errors, ...rulesIssues.warnings].join(
      '; '
    )}`;
    warnings.push(warning);
    if (!json && !quiet) {
      console.log(chalk.yellow(`⚠️  ${warning}`));
    }
  }

  // Override locale if provided
  if (locale && (locale === 'zh' || locale === 'en')) {
    config.locale = locale as 'zh' | 'en';
  }
  if (json && process.env.GIT_AI_ENABLE_FOOTER === undefined) {
    config.enableFooter = false;
  }

  // Get filtered diff
  const { diff, truncated, ignoredFiles } = await getFilteredDiff(stagedFiles);
  const branchName = await getBranchName();
  const recentCommits = await getRecentCommits(10);

  // Create AI client
  const client = createAIClient(config);
  const input: CommitMessageGenerationInput = {
    diff,
    stagedFiles,
    ignoredFiles,
    truncated,
    branchName,
    recentCommits,
    quiet: options.quiet,
  };

  // Generate message(s)
  try {
    let spinner: ReturnType<typeof ora> | null = null;

    if (!quiet && !json) {
      spinner = ora({
        text: num > 1 ? `Generating ${num} commit messages...` : 'Generating commit message...',
        color: 'cyan',
      }).start();
    }

    if (num > 1) {
      // Generate multiple messages
      const messages = await generateCommitMessage(client, input, config, num);
      const unique = [...new Set(messages)];

      if (spinner) {
        spinner.stop();
      }

      if (json) {
        const result: MsgResult = {
          success: true,
          messages: unique,
          warnings: warnings.length ? warnings : undefined,
          metadata: { stagedFiles, truncated, ignoredFiles },
        };
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Plain output: use a safer delimiter for multi-line messages
        const delimiter = getMsgDelimiter();
        const hasDelimiter = unique.some((msg) => msg.includes(delimiter));
        if (hasDelimiter) {
          console.error(
            chalk.yellow(
              `⚠️  Message contains delimiter "${delimiter}". Use --json for safe parsing.`
            )
          );
        }
        unique.forEach((msg, i) => {
          console.log(msg);
          if (i < unique.length - 1) {
            console.log(delimiter);
          }
        });
      }
    } else {
      // Single message
      const messages = await generateCommitMessage(client, input, config);
      const message = messages[0];

      if (spinner) {
        spinner.stop();
      }

      if (json) {
        const result: MsgResult = {
          success: true,
          message,
          warnings: warnings.length ? warnings : undefined,
          metadata: { stagedFiles, truncated, ignoredFiles },
        };
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Plain output
        console.log(message);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    exitWithError(errorMessage, options);
  }
}
