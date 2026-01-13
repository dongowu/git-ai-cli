import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../utils/config.js';
import {
  isGitInstalled,
  isInGitRepo,
  getStagedFiles,
  getFilteredDiff,
  getBranchName,
} from '../utils/git.js';
import {
  createAIClient,
  generateCommitMessage,
  type CommitMessageGenerationInput,
} from '../utils/ai.js';

export interface MsgOptions {
  json?: boolean;
  quiet?: boolean;
  num?: number;
}

export interface MsgResult {
  success: boolean;
  message?: string;
  messages?: string[];
  error?: string;
  metadata?: {
    stagedFiles: string[];
    truncated: boolean;
    ignoredFiles: string[];
  };
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
  const { json = false, quiet = false, num = 1 } = options;

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
    exitWithError('Configuration not found. Run `git-ai config` first.', options);
  }

  // Get filtered diff
  const { diff, truncated, ignoredFiles } = await getFilteredDiff(stagedFiles);
  const branchName = await getBranchName();

  // Create AI client
  const client = createAIClient(config);
  const input: CommitMessageGenerationInput = { diff, stagedFiles, ignoredFiles, truncated, branchName };

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
      const promises = Array.from({ length: num }, () =>
        generateCommitMessage(client, input, config)
      );
      const messages = await Promise.all(promises);
      const unique = [...new Set(messages)];

      if (spinner) {
        spinner.stop();
      }

      if (json) {
        const result: MsgResult = {
          success: true,
          messages: unique,
          metadata: { stagedFiles, truncated, ignoredFiles },
        };
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Plain output: use delimiter for multi-line message safety
        // Each message separated by ---END---
        unique.forEach((msg, i) => {
          console.log(msg);
          if (i < unique.length - 1) {
            console.log('---END---');
          }
        });
      }
    } else {
      // Single message
      const message = await generateCommitMessage(client, input, config);

      if (spinner) {
        spinner.stop();
      }

      if (json) {
        const result: MsgResult = {
          success: true,
          message,
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
