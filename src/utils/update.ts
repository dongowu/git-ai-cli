import https from 'node:https';
import { createRequire } from 'node:module';
import chalk from 'chalk';
import Conf from 'conf';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

const REGISTRY_URL = 'https://registry.npmjs.org/@dongowu/git-ai-cli/latest';
const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

type UpdateCache = {
  lastChecked?: number;
  lastNotifiedVersion?: string;
};

const updateCache = new Conf<UpdateCache>({
  projectName: 'git-ai-cli',
  configName: 'update',
});

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}

function getCheckIntervalMs(): number {
  const rawHours = process.env.GIT_AI_UPDATE_INTERVAL_HOURS;
  const parsed = rawHours ? Number.parseInt(rawHours, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed * 60 * 60 * 1000;
  }
  return DEFAULT_CHECK_INTERVAL_MS;
}

function shouldSkipUpdateCheck(): boolean {
  const disabled =
    parseBooleanEnv(process.env.GIT_AI_DISABLE_UPDATE) ??
    parseBooleanEnv(process.env.GIT_AI_NO_UPDATE);
  if (disabled) return true;

  if (process.env.CI) return true;

  // Avoid noisy output in non-interactive contexts (hooks, pipes, CI).
  if (!process.stdout.isTTY) return true;

  return false;
}

export async function checkUpdate(options: { allow?: boolean } = {}): Promise<void> {
  if (options.allow === false) return;
  if (shouldSkipUpdateCheck()) return;

  const now = Date.now();
  const intervalMs = getCheckIntervalMs();
  const lastChecked = updateCache.get('lastChecked');
  if (lastChecked && now - lastChecked < intervalMs) return;

  // Mark as checked before the network call to avoid repeated attempts on failure.
  updateCache.set('lastChecked', now);

  return new Promise((resolve) => {
    const req = https.get(REGISTRY_URL, { timeout: 1000 }, (res) => {
      if (res.statusCode !== 200) {
        resolve();
        return;
      }

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const { version: latest } = JSON.parse(data);
          const current = packageJson.version;

          if (latest && current && latest !== current) {
            // Simple semantic version check (naive but works for distinct releases)
            if (isNewer(latest, current)) {
              const lastNotified = updateCache.get('lastNotifiedVersion');
              if (lastNotified !== latest) {
                printUpdateMessage(current, latest);
                updateCache.set('lastNotifiedVersion', latest);
              }
            }
          }
        } catch {
          // Ignore parsing errors
        }
        resolve();
      });
    });

    req.on('error', () => resolve());
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
  });
}

function isNewer(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (l[i] > c[i]) return true;
    if (l[i] < c[i]) return false;
  }
  return false;
}

function printUpdateMessage(current: string, latest: string) {
  const boxWidth = 50;
  const msg = `Update available ${chalk.gray(current)} → ${chalk.green(latest)}`;
  const cmd = `npm install -g @dongowu/git-ai-cli`;
  
  console.log('\n' + chalk.yellow('┌' + '─'.repeat(boxWidth) + '┐'));
  console.log(chalk.yellow('│') + center(' ', boxWidth) + chalk.yellow('│'));
  console.log(chalk.yellow('│') + center(msg, boxWidth) + chalk.yellow('│'));
  console.log(chalk.yellow('│') + center('Run ' + chalk.cyan(cmd) + ' to update', boxWidth) + chalk.yellow('│'));
  console.log(chalk.yellow('│') + center(' ', boxWidth) + chalk.yellow('│'));
  console.log(chalk.yellow('└' + '─'.repeat(boxWidth) + '┘') + '\n');
}

function center(str: string, width: number): string {
  // Strip ansi codes for length calculation
  // eslint-disable-next-line no-control-regex
  const visibleLen = str.replace(new RegExp('\\x1b\\[\\d+m', 'g'), '').length;
  const padding = Math.max(0, width - visibleLen);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}
