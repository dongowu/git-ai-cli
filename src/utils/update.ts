import https from 'node:https';
import { createRequire } from 'node:module';
import chalk from 'chalk';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

const REGISTRY_URL = 'https://registry.npmjs.org/@dongowu/git-ai-cli/latest';

export async function checkUpdate(): Promise<void> {
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
              printUpdateMessage(current, latest);
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
