#!/usr/bin/env node

import { cac } from 'cac';
import chalk from 'chalk';
import { createRequire } from 'node:module';
import { runConfig } from './commands/config.js';
import { runCommit } from './commands/commit.js';
import { runHook } from './commands/hook.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };

const cli = cac('git-ai');

cli
  .command('', 'Generate AI-powered commit message')
  .option('-y, --yes', 'Skip confirmation and commit directly')
  .option('-n, --num <count>', 'Generate multiple commit messages to choose from', { default: 1 })
  .option('--hook', 'Hook mode: output only the commit message (for git hooks)')
  .action(async (options: { yes?: boolean; num?: number; hook?: boolean }) => {
    try {
      await runCommit({
        autoCommit: options.yes ?? false,
        numChoices: Math.min(Math.max(Number(options.num) || 1, 1), 5),
        hookMode: options.hook ?? false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!options.hook) {
        console.error(chalk.red(`\n❌ Error: ${message}\n`));
      }
      process.exit(1);
    }
  });

cli
  .command('config', 'Configure AI provider settings')
  .action(async () => {
    try {
      await runConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Error: ${message}\n`));
      process.exit(1);
    }
  });

cli
  .command('hook <action>', 'Manage Git hooks (install/remove)')
  .action(async (action: string) => {
    try {
      await runHook(action);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Error: ${message}\n`));
      process.exit(1);
    }
  });

cli.help();
cli.version(pkg.version || '0.0.0');

cli.parse();
