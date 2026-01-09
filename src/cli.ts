#!/usr/bin/env node

import { cac } from 'cac';
import chalk from 'chalk';
import { runConfig } from './commands/config.js';
import { runCommit } from './commands/commit.js';

const cli = cac('git-ai');

cli
  .command('', 'Generate AI-powered commit message')
  .action(async () => {
    try {
      await runCommit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Error: ${message}\n`));
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

cli.help();
cli.version('1.0.0');

cli.parse();
