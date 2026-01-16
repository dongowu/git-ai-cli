#!/usr/bin/env node

// Suppress punycode deprecation warning (node 21+)
const originalEmit = process.emit;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.emit = function (name: any, data: any, ...args: any[]) {
  if (
    name === 'warning' &&
    typeof data === 'object' &&
    data?.name === 'DeprecationWarning' &&
    data?.message?.includes('punycode')
  ) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return originalEmit.apply(process, [name, data, ...args] as any);
} as any;

import { cac } from 'cac';
import chalk from 'chalk';
import { createRequire } from 'node:module';
import { runConfig } from './commands/config.js';
import { runConfigDescribe, runConfigGet, runConfigSet } from './commands/config_manage.js';
import { runCommit } from './commands/commit.js';
import { runMsg } from './commands/msg.js';
import { runHook } from './commands/hook.js';
import { runReport } from './commands/report.js';
import { checkUpdate } from './utils/update.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };

const cli = cac('git-ai');

// Default command (backward compatible) - interactive commit
cli
  .command('', 'Generate AI-powered commit message (interactive)')
  .option('-y, --yes', 'Skip confirmation and commit directly')
  .option('-n, --num <count>', 'Generate multiple commit messages to choose from', { default: 1 })
  .option('-l, --locale <locale>', 'Override locale (zh/en)')
  .option('-a, --agent', 'Use Agent mode for deep analysis and impact checking')
  .option('--hook', '[deprecated] Use `git-ai msg` instead')
  .action(async (options: { yes?: boolean; num?: number; hook?: boolean; locale?: string; agent?: boolean }) => {
    try {
      // Deprecated --hook redirects to msg command behavior
      if (options.hook) {
        const { runMsg } = await import('./commands/msg.js');
        await runMsg({ quiet: true, locale: options.locale });
        return;
      }

      await runCommit({
        autoCommit: options.yes ?? false,
        numChoices: Math.min(Math.max(Number(options.num) || 1, 1), 5),
        locale: options.locale,
        agentMode: options.agent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Error: ${message}\n`));
      process.exit(1);
    }
  });

// Explicit commit subcommand
cli
  .command('commit', 'Generate and commit with AI message (interactive)')
  .option('-y, --yes', 'Skip confirmation and commit directly')
  .option('-n, --num <count>', 'Generate multiple commit messages to choose from', { default: 1 })
  .option('-l, --locale <locale>', 'Override locale (zh/en)')
  .option('-a, --agent', 'Use Agent mode for deep analysis and impact checking')
  .action(async (options: { yes?: boolean; num?: number; locale?: string; agent?: boolean }) => {
    try {
      await runCommit({
        autoCommit: options.yes ?? false,
        numChoices: Math.min(Math.max(Number(options.num) || 1, 1), 5),
        locale: options.locale,
        agentMode: options.agent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Error: ${message}\n`));
      process.exit(1);
    }
  });

// Message-only command (for hooks and scripts)
cli
  .command('msg', 'Generate commit message only (stdout, for hooks/scripts)')
  .option('-n, --num <count>', 'Generate multiple messages', { default: 1 })
  .option('--json', 'Output as JSON')
  .option('--quiet', 'Suppress spinner and colors')
  .option('-l, --locale <locale>', 'Override locale (zh/en)')
  .action(async (options: { num?: number; json?: boolean; quiet?: boolean; locale?: string }) => {
    try {
      await runMsg({
        num: Math.min(Math.max(Number(options.num) || 1, 1), 5),
        json: options.json ?? false,
        quiet: options.quiet ?? false,
        locale: options.locale,
      });
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: String(error) }));
      } else if (!options.quiet) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(chalk.red(`\n❌ Error: ${message}\n`));
      }
      process.exit(1);
    }
  });

cli
  .command('config [action] [key] [value]', 'Configure AI provider settings')
  .alias('init')
  .option('--json', 'Output as JSON (for get/set/describe)')
  .option('--local', 'Use local .git-ai.json (for get/set)')
  .action(
    async (
      action?: string,
      key?: string,
      value?: string,
      options?: { json?: boolean; local?: boolean }
    ) => {
      try {
        const act = (action || '').trim();
        if (!act) {
          await runConfig();
          return;
        }

        if (act === 'get') {
          runConfigGet({ json: options?.json, local: options?.local });
          return;
        }

        if (act === 'describe') {
          runConfigDescribe({ json: options?.json });
          return;
        }

        if (act === 'set') {
          if (!key || value === undefined) {
            throw new Error('Usage: git-ai config set <key> <value>');
          }
          runConfigSet(key, value, { json: options?.json, local: options?.local });
          return;
        }

        throw new Error(`Unknown config action: ${act}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(chalk.red(`\n? Error: ${message}\n`));
        process.exit(1);
      }
    }
  );
cli
  .command('hook <action>', 'Manage Git hooks (install/remove/status)')
  .option('-g, --global', 'Apply to global Git hooks (all repositories)')
  .action(async (action: string, options: { global?: boolean }) => {
    try {
      await runHook(action, { global: options.global });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Error: ${message}\n`));
      process.exit(1);
    }
  });

cli
  .command('report', 'Generate AI-powered weekly/daily reports from git history')
  .option('--days <number>', 'Number of days to analyze')
  .action(async (options: { days?: number }) => {
    try {
      await runReport({ days: options.days ? Number(options.days) : undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Error: ${message}\n`));
      process.exit(1);
    }
  });

cli.help();
cli.version(pkg.version || '0.0.0');

// Check for updates asynchronously
checkUpdate().then(() => {
  cli.parse();
});

