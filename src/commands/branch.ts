import inquirer from 'inquirer';
import chalk from 'chalk';
import { getMergedConfig, getLocalConfigError } from '../utils/config.js';
import {
  isGitInstalled,
  isInGitRepo,
  isValidBranchName,
  branchExists,
  checkoutBranch,
  createBranch,
} from '../utils/git.js';
import type { AIConfig } from '../types.js';

type BranchOptions = {
  type?: string;
  name?: string;
  issue?: string;
  pattern?: string;
  dryRun?: boolean;
  json?: boolean;
};

type BranchResult = {
  success: boolean;
  branch?: string;
  action?: 'created' | 'checked_out' | 'dry_run' | 'skipped';
  error?: string;
  warnings?: string[];
};

const DEFAULT_BRANCH_TYPES = ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'chore', 'build', 'ci'];
const DEFAULT_PATTERN = '{type}/{issue?}{name}';
const DEFAULT_ISSUE_SEPARATOR = '-';
const DEFAULT_NAME_MAXLEN = 50;

function normalizeType(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'doc') return 'docs';
  return trimmed;
}

function extractIssue(input: string | undefined, pattern: RegExp): string | null {
  if (!input) return null;
  const match = input.match(pattern);
  return match ? match[0] : null;
}

function stripIssueFromName(name: string, issue: string): string {
  const escaped = issue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name
    .replace(new RegExp(escaped, 'g'), '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeName(input: string, maxLen: number): string {
  let out = input.trim();
  out = out.replace(/\s+/g, '-');
  out = out.replace(/[~^:?*[\]\\]/g, '-');
  out = out.replace(/@{/g, '-');
  out = out.replace(/\.{2,}/g, '.');
  out = out.replace(/\/{2,}/g, '/');
  out = out.replace(/^-+/, '').replace(/-+$/, '');
  if (out.length > maxLen) {
    out = out.slice(0, maxLen).replace(/-+$/g, '');
  }
  return out;
}

function renderPattern(pattern: string, tokens: { type: string; name: string; issue?: string }, sep: string): string {
  let out = pattern;
  const issuePrefix = tokens.issue ? `${tokens.issue}${sep}` : '';
  out = out.replace('{issue?}', issuePrefix);
  out = out.replace('{issue}', tokens.issue || '');
  out = out.replace('{type}', tokens.type);
  out = out.replace('{name}', tokens.name);
  out = out.replace(/\/{2,}/g, '/');
  out = out.replace(/-+/g, '-');
  return out.replace(/\/$/, '');
}

function buildBranchName(input: {
  type: string;
  name: string;
  issue?: string;
  pattern: string;
  issueSeparator: string;
  maxLen: number;
}): string {
  const type = normalizeType(input.type);
  const name = sanitizeName(input.name, input.maxLen);
  const issue = input.issue ? input.issue.trim() : '';
  return renderPattern(input.pattern, { type, name, issue: issue || undefined }, input.issueSeparator);
}

function resolveBranchTypes(config: Partial<AIConfig>): string[] {
  const branchTypes =
    Array.isArray(config.branch?.types) && config.branch?.types?.length
      ? config.branch.types
      : Array.isArray(config.rules?.types) && config.rules?.types?.length
        ? config.rules.types
        : DEFAULT_BRANCH_TYPES;
  return branchTypes.map((t) => normalizeType(String(t))).filter(Boolean);
}

export async function runBranch(options: BranchOptions = {}): Promise<void> {
  if (!(await isGitInstalled())) {
    const msg = 'Git is not installed.';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  if (!(await isInGitRepo())) {
    const msg = 'Not in a git repository.';
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  const config = getMergedConfig();
  const warnings: string[] = [];
  const localConfigError = getLocalConfigError();
  if (localConfigError) {
    const warning = `Failed to parse ${localConfigError.path}: ${localConfigError.error}`;
    warnings.push(warning);
    if (!options.json) {
      console.log(chalk.yellow(`⚠️  ${warning}`));
    }
  }

  const branchTypes = resolveBranchTypes(config);
  const issuePatternRaw =
    typeof config.rules?.issuePattern === 'string' && config.rules.issuePattern.trim()
      ? config.rules.issuePattern.trim()
      : '[A-Z]+-\\d+|#\\d+';
  let issuePattern = /([A-Z]+-\d+|#\d+)/;
  try {
    issuePattern = new RegExp(issuePatternRaw);
  } catch {
    // keep default
  }

  const pattern = options.pattern || config.branch?.pattern || DEFAULT_PATTERN;
  const issueSeparator = config.branch?.issueSeparator || DEFAULT_ISSUE_SEPARATOR;
  const maxLen = config.branch?.nameMaxLength || DEFAULT_NAME_MAXLEN;

  let type = options.type ? normalizeType(options.type) : '';
  let name = options.name || '';
  let issue = options.issue || '';

  if (options.json && (!type || !name)) {
    const msg = 'Missing required options for JSON mode. Provide --type and --name.';
    console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
    return;
  }

  if (!type) {
    const answer = await inquirer.prompt<{ type: string }>([
      {
        type: 'list',
        name: 'type',
        message: 'Select branch type:',
        choices: branchTypes,
      },
    ]);
    type = normalizeType(answer.type);
  } else if (!branchTypes.includes(type)) {
    const msg = `Invalid branch type: ${type}`;
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  if (!name) {
    const answer = await inquirer.prompt<{ name: string }>([
      {
        type: 'input',
        name: 'name',
        message: 'Enter feature/module name:',
        validate: (input) => (input.trim() ? true : 'Name is required'),
      },
    ]);
    name = answer.name;
  }

  const issueFromName = extractIssue(name, issuePattern);
  if (!issue && issueFromName) {
    issue = issueFromName;
    name = stripIssueFromName(name, issueFromName);
  }

  if (!issue && !options.json) {
    const answer = await inquirer.prompt<{ issue: string }>([
      {
        type: 'input',
        name: 'issue',
        message: 'Issue ID (optional, e.g. PROJ-123):',
      },
    ]);
    issue = answer.issue.trim();
  }

  if (issue) {
    const issueMatch = extractIssue(issue, issuePattern);
    if (!issueMatch) {
      const msg = `Issue ID does not match pattern: ${issuePatternRaw}`;
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
        return;
      }
      console.error(chalk.red(`❌ ${msg}`));
      process.exit(1);
    }
    issue = issueMatch;
  }

  let branchName = buildBranchName({
    type,
    name,
    issue: issue || undefined,
    pattern,
    issueSeparator,
    maxLen,
  });

  if (branchName.includes('/')) {
    const prefix = branchName.split('/')[0];
    if (prefix && (await branchExists(prefix))) {
      const altName = buildBranchName({
        type,
        name,
        issue: issue || undefined,
        pattern: '{type}-{issue?}{name}',
        issueSeparator,
        maxLen,
      });
      const msg = `Branch prefix '${prefix}' already exists.`;
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              success: false,
              error: `${msg} Try --pattern \"{type}-{issue?}{name}\" (e.g., ${altName}).`,
              warnings,
            },
            null,
            2
          )
        );
        return;
      }
      const { useAlt } = await inquirer.prompt<{ useAlt: boolean }>([
        {
          type: 'confirm',
          name: 'useAlt',
          message: `${msg} Use alternative '${altName}'?`,
          default: true,
        },
      ]);
      if (useAlt) {
        branchName = altName;
      } else {
        console.log(chalk.gray('Skipped.'));
        return;
      }
    }
  }

  if (!(await isValidBranchName(branchName))) {
    const msg = `Invalid branch name: ${branchName}`;
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: msg, warnings }, null, 2));
      return;
    }
    console.error(chalk.red(`❌ ${msg}`));
    process.exit(1);
  }

  if (options.dryRun) {
    const result: BranchResult = { success: true, branch: branchName, action: 'dry_run', warnings };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(chalk.green(`✅ Branch preview: ${branchName}`));
    }
    return;
  }

  const exists = await branchExists(branchName);
  if (exists) {
    if (options.json) {
      const result: BranchResult = {
        success: true,
        branch: branchName,
        action: 'checked_out',
        warnings,
      };
      await checkoutBranch(branchName);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const { checkout } = await inquirer.prompt<{ checkout: boolean }>([
      {
        type: 'confirm',
        name: 'checkout',
        message: `Branch already exists. Checkout ${branchName}?`,
        default: true,
      },
    ]);
    if (checkout) {
      await checkoutBranch(branchName);
      console.log(chalk.green(`✅ Switched to existing branch: ${branchName}`));
    } else {
      console.log(chalk.gray('Skipped.'));
    }
    return;
  }

  await createBranch(branchName);
  if (options.json) {
    const result: BranchResult = { success: true, branch: branchName, action: 'created', warnings };
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(chalk.green(`✅ Created and switched to branch: ${branchName}`));
}
