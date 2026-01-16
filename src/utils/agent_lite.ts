import OpenAI from 'openai';
import ora from 'ora';
import { execa } from 'execa';
import { getFileDiff, FileStat, isBlacklisted } from './git.js';
import { AIConfig } from '../types.js';

const AGENT_LITE_SYSTEM_PROMPT = `You are an expert at writing Git commit messages following the Conventional Commits specification.

You are given:
- the current branch name (may hint scope/type)
- a summary of changed files
- diffs for the most important changed files
- optional impact analysis from local code search (git grep)

Goal: produce a high-quality commit message that reflects the intent of the change.

Output format:
<type>(<scope>): <subject>

Rules:
1) type MUST be one of: feat, fix, docs, style, refactor, perf, test, chore, build, ci
2) subject <= 50 characters, imperative mood, no trailing period
3) If changes are complex or there is risk, add a blank line and a concise body.
4) Do NOT output markdown code blocks. Output raw text only.`;

const MAX_PRIORITY_FILES = 5;
const MAX_DIFF_CHARS_PER_FILE = 6000;
const MAX_OTHER_FILES_LIST = 12;
const MAX_SYMBOLS_TO_SEARCH = 3;
const MAX_GREP_LINES = 80;
const MAX_GREP_CHARS = 4000;

function truncateText(text: string, maxChars: number, suffix: string): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + suffix;
}

function analyzeFileImportance(stats: FileStat[]): { priority: FileStat[]; others: FileStat[] } {
  const sorted = [...stats].sort((a, b) => {
    const scoreA = a.insertions + a.deletions;
    const scoreB = b.insertions + b.deletions;
    return scoreB - scoreA;
  });

  const priority: FileStat[] = [];
  let totalLines = 0;
  for (const stat of sorted) totalLines += stat.insertions + stat.deletions;

  let accumulated = 0;
  for (const stat of sorted) {
    if (priority.length >= MAX_PRIORITY_FILES) break;
    const score = stat.insertions + stat.deletions;
    accumulated += score;
    // Keep ~80% of change volume, capped by MAX_PRIORITY_FILES
    if (accumulated <= totalLines * 0.8 || priority.length === 0) {
      priority.push(stat);
    }
  }

  return { priority, others: sorted.filter((s) => !priority.includes(s)) };
}

function extractScopeFromBranch(branchName: string): string | null {
  if (!branchName) return null;

  const patterns = [
    /^(?:feature|bugfix|hotfix|release|dev)\/([a-zA-Z0-9_-]+)/,
    /^(?:feat|fix|chore|docs)\/([a-zA-Z0-9_-]+)/,
    /^[A-Z]+-\d+/,
  ];

  for (const pattern of patterns) {
    const match = branchName.match(pattern);
    if (match) {
      return match[1].toLowerCase().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }
  }
  return null;
}

function getBranchWarning(branchName: string): string {
  if (/^hotfix\//.test(branchName)) {
    return '\nWARNING: This is a HOTFIX branch. Review carefully before committing.';
  }
  if (/^release\//.test(branchName)) {
    return '\nWARNING: This is a RELEASE branch. Review carefully before committing.';
  }
  return '';
}

type SymbolMeta = { name: string; score: number; seenAdded: boolean; seenRemoved: boolean };

function extractCandidateSymbols(diff: string): SymbolMeta[] {
  const stop = new Set([
    'data',
    'params',
    'param',
    'result',
    'value',
    'values',
    'config',
    'options',
    'option',
    'index',
    'main',
    'test',
  ]);

  const byName = new Map<string, SymbolMeta>();
  const lines = diff.split('\n');

  const matchers: Array<{ re: RegExp; weight: number }> = [
    { re: /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, weight: 5 },
    { re: /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, weight: 4 },
    { re: /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, weight: 4 },
    { re: /\binterface\s+([A-Za-z_$][\w$]*)/g, weight: 3 },
    { re: /\btype\s+([A-Za-z_$][\w$]*)\s*=/g, weight: 3 },
    { re: /\benum\s+([A-Za-z_$][\w$]*)/g, weight: 3 },
    { re: /\bclass\s+([A-Za-z_$][\w$]*)/g, weight: 2 },
    { re: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g, weight: 2 },
    { re: /\bdef\s+([A-Za-z_][\w]*)\s*\(/g, weight: 2 },
  ];

  for (const rawLine of lines) {
    if (!rawLine) continue;
    const prefix = rawLine[0];
    if (prefix !== '+' && prefix !== '-') continue;
    if (rawLine.startsWith('+++') || rawLine.startsWith('---')) continue;

    const line = rawLine.slice(1);
    const isAdded = prefix === '+';
    const isRemoved = prefix === '-';

    for (const { re, weight } of matchers) {
      // Reset lastIndex for global regex reuse per line.
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((m = re.exec(line))) {
        const name = m[1];
        if (!name || name.length < 4) continue;
        if (stop.has(name.toLowerCase())) continue;

        const existing = byName.get(name);
        const delta = weight + (isRemoved ? 2 : 0);
        if (!existing) {
          byName.set(name, {
            name,
            score: delta,
            seenAdded: isAdded,
            seenRemoved: isRemoved,
          });
        } else {
          existing.score = Math.max(existing.score, existing.score + delta);
          existing.seenAdded = existing.seenAdded || isAdded;
          existing.seenRemoved = existing.seenRemoved || isRemoved;
        }
      }
    }
  }

  return [...byName.values()].sort((a, b) => b.score - a.score);
}

async function grepWord(word: string): Promise<{ total: number; files: string[]; sample: string; truncated: boolean }> {
  try {
    const { stdout } = await execa('git', ['grep', '-n', '-w', '--', word]);
    if (!stdout) return { total: 0, files: [], sample: 'No matches found.', truncated: false };

    const lines = stdout.split('\n').filter(Boolean);
    const total = lines.length;
    const files = [...new Set(lines.map((l) => l.split(':')[0]).filter(Boolean))];

    let outLines = lines;
    let truncated = false;
    if (outLines.length > MAX_GREP_LINES) {
      outLines = outLines.slice(0, MAX_GREP_LINES);
      truncated = true;
    }

    let sample = outLines.join('\n');
    if (sample.length > MAX_GREP_CHARS) {
      sample = sample.slice(0, MAX_GREP_CHARS) + '\n...[Search output truncated]';
      truncated = true;
    }

    if (truncated) {
      sample += `\n...[${Math.max(total - outLines.length, 0)} more matches]`;
    }

    return { total, files, sample, truncated };
  } catch {
    return { total: 0, files: [], sample: 'No matches found.', truncated: false };
  }
}

function stripCodeFences(text: string): string {
  return text.replace(/^```[a-z]*\n/i, '').replace(/```$/, '').trim();
}

export async function runAgentLite(
  client: OpenAI,
  config: AIConfig,
  stats: FileStat[],
  branchName?: string,
  quiet = false,
  modelOverride?: string
): Promise<string> {
  const { priority, others } = analyzeFileImportance(stats);

  const spinner = !quiet ? ora('Agent (lite) is pre-analyzing important files...').start() : null;

  const diffCache = new Map<string, string>();
  const changedFiles = stats.map((s) => s.file);

  await Promise.all(
    priority.map(async (stat) => {
      if (isBlacklisted(stat.file)) return;
      try {
        const diff = await getFileDiff(stat.file);
        if (diff) {
          diffCache.set(
            stat.file,
            truncateText(diff, MAX_DIFF_CHARS_PER_FILE, '\n...[Diff truncated]')
          );
        }
      } catch {
        // ignore
      }
    })
  );

  if (spinner) spinner.text = 'Agent (lite) is running impact analysis...';

  const symbolMetas = extractCandidateSymbols([...diffCache.values()].join('\n\n'));
  const symbolsToSearch = symbolMetas.slice(0, MAX_SYMBOLS_TO_SEARCH);

  const grepResults: string[] = [];
  const riskNotes: string[] = [];

  for (const meta of symbolsToSearch) {
    const result = await grepWord(meta.name);
    const externalFiles = result.files.filter((f) => !changedFiles.includes(f));
    const looksRemoved = meta.seenRemoved && !meta.seenAdded;
    const risk = looksRemoved && externalFiles.length > 0;

    grepResults.push(
      `- ${meta.name}: ${result.total} match(es), files: ${result.files.slice(0, 8).join(', ')}${
        result.files.length > 8 ? ` (+${result.files.length - 8} more)` : ''
      }`
    );

    if (risk) {
      riskNotes.push(
        `- Potential breaking change: '${meta.name}' looks removed/changed but is referenced in: ${externalFiles.slice(0, 8).join(', ')}${
          externalFiles.length > 8 ? ` (+${externalFiles.length - 8} more)` : ''
        }`
      );
    }
  }

  if (spinner) spinner.text = 'Agent (lite) is generating commit message...';

  const scope = extractScopeFromBranch(branchName || '');
  const warning = getBranchWarning(branchName || '');

  const priorityDiffs = [...diffCache.entries()]
    .map(([file, diff]) => `=== ${file} ===\n${diff}`)
    .join('\n\n');

  const otherFiles = others
    .filter((s) => !isBlacklisted(s.file))
    .map((s) => s.file)
    .slice(0, MAX_OTHER_FILES_LIST);

  const userContent = `Current Branch: ${branchName || 'unknown'}${warning}
${scope ? `Inferred scope from branch: ${scope}` : ''}

Files Summary (top changed):
${stats
  .slice(0, 15)
  .map((s) => `${s.file} (+${s.insertions}, -${s.deletions})`)
  .join('\n')}${stats.length > 15 ? `\n... and ${stats.length - 15} more files` : ''}

=== Priority File Diffs ===
${priorityDiffs || '(No diffs loaded)'}

${otherFiles.length ? `=== Other Changed Files (not loaded) ===\n${otherFiles.join('\n')}` : ''}

${grepResults.length ? `=== Impact Analysis (git grep) ===\n${grepResults.join('\n')}` : ''}

${riskNotes.length ? `=== Risks ===\n${riskNotes.join('\n')}` : ''}
`;

  const response = await client.chat.completions.create({
    model: modelOverride || config.model,
    messages: [
      { role: 'system', content: AGENT_LITE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    if (spinner) spinner.fail('Agent (lite) failed: empty response.');
    throw new Error('Agent (lite) failed: empty response.');
  }

  if (spinner) spinner.stop();
  return stripCodeFences(content);
}

