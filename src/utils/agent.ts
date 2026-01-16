import OpenAI from 'openai';
import { getFileDiff, FileStat, isBlacklisted, searchCode } from './git.js';
import { AIConfig } from '../types.js';
import ora from 'ora';

const AGENT_SYSTEM_PROMPT = `You are an intelligent Git Assistant with access to tools.
Your goal is to write a high-quality Git commit message following Conventional Commits format.

Process:
1. Analyze the PRE-LOADED diffs for the most important files (already provided in the context).
2. Look for:
   - Core logic changes (new features, bug fixes)
   - API signature changes
   - Breaking changes
3. If you need additional context about function usages, use the search_code tool.
4. Synthesize a commit message based on ALL available information.

Output Format:
<type>(<scope>): <subject>

Where:
- type: feat, fix, docs, style, refactor, perf, test, chore, build, ci
- scope: the affected component/module (inferred from file paths or branch name)
- subject: concise description under 50 chars, imperative mood, no period

Optional: Add a blank line and body for detailed explanation if needed.

IMPORTANT: DO NOT use markdown code blocks (no \`\`\`). Return raw text only.
Reply with just the commit message when done.`;

const MAX_TOOL_CALLS = 10;
const MAX_TOOL_DIFF_CHARS = 5000;
const MAX_TOOL_SEARCH_CHARS = 5000;

function truncateText(text: string, maxChars: number, suffix: string): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + suffix;
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      return {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function analyzeFileImportance(stats: FileStat[]): { priority: FileStat[], others: FileStat[] } {
  const sorted = [...stats].sort((a, b) => {
    const scoreA = a.insertions + a.deletions;
    const scoreB = b.insertions + b.deletions;
    return scoreB - scoreA;
  });

  const priority: FileStat[] = [];
  let totalLines = 0;

  for (const stat of sorted) {
    totalLines += stat.insertions + stat.deletions;
  }

  let accumulated = 0;
  for (const stat of sorted) {
    const score = stat.insertions + stat.deletions;
    accumulated += score;

    if (accumulated < totalLines * 0.8 && priority.length < 5) {
      priority.push(stat);
    }
  }

  return { priority, others: sorted.slice(priority.length) };
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_file_diff',
      description: 'Get the git diff for a specific file to understand the detailed changes.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path to get diff for',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for a string or pattern across the codebase (tracked files). Useful for finding usages of a function or variable.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The string or regex pattern to search for',
          },
        },
        required: ['pattern'],
      },
    },
  },
];

export async function runAgentLoop(
  client: OpenAI,
  config: AIConfig,
  stats: FileStat[],
  branchName?: string,
  quiet = false,
  modelOverride?: string
): Promise<string> {
  const { priority, others } = analyzeFileImportance(stats);

  const spinner = !quiet ? ora('Agent is pre-analyzing important files...').start() : null;

  const diffCache = new Map<string, string>();
  const searchCache = new Map<string, string>();

  async function loadPriorityDiffs() {
    const promises = priority.map(async (stat) => {
      if (isBlacklisted(stat.file)) return;
      try {
        const diff = await getFileDiff(stat.file);
        if (diff) {
          diffCache.set(stat.file, truncateText(diff, MAX_TOOL_DIFF_CHARS, '\n...[Diff truncated]'));
        }
      } catch {
        // ignore
      }
    });
    await Promise.all(promises);
  }

  await loadPriorityDiffs();

  if (spinner) spinner.text = 'Agent is analyzing changes...';

  const priorityDiffs = [...diffCache.entries()].map(([file, diff]) =>
    `=== ${file} ===\n${diff}`
  ).join('\n\n');

  const otherFiles = others.filter(s => !isBlacklisted(s.file)).map(s => s.file);

  const initialContent = `Current Branch: ${branchName || 'unknown'}

Files Summary (priority order):
${stats.slice(0, 15).map((s) => `${s.file} (+${s.insertions}, -${s.deletions})`).join('\n')}
${stats.length > 15 ? `... and ${stats.length - 15} more files` : ''}

=== Priority File Diffs ===
${priorityDiffs || '(No diffs loaded)'}

${otherFiles.length > 0 ? `=== Other Changed Files (not loaded) ===\n${otherFiles.slice(0, 10).join('\n')}` : ''}

Based on the above information, generate a commit message. Use tools only if you need additional context about function/variable usages that are not clear from the diffs.`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: initialContent },
  ];

  let toolCalls = 0;
  let forceFinal = false;
  let toolBudgetNotified = false;
  let firstRound = true;
  const MAX_ITERATIONS = 5;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      const response = await client.chat.completions.create({
        model: modelOverride || config.model,
        messages,
        tools,
        tool_choice: firstRound ? 'none' : (forceFinal ? 'none' : undefined),
        temperature: 0.3,
      });

      firstRound = false;
      const message = response.choices[0]?.message;

      if (!message) {
        throw new Error('Empty response from AI');
      }

      messages.push(message);

      if (message.tool_calls?.length) {
        for (const toolCall of message.tool_calls) {
          const canUseTool = toolCalls < MAX_TOOL_CALLS;

          if (toolCall.function.name === 'get_file_diff') {
            if (spinner) spinner.text = `Agent is inspecting diffs...`;

            let content = '(No diff)';
            if (!canUseTool) {
              forceFinal = true;
              content = '(Tool budget exceeded. Return final commit message.)';
            } else {
              let path = '';
              try {
                const args = parseToolArgs(toolCall.function.arguments);
                path = typeof args.path === 'string' ? args.path : '';
              } catch {
                path = '';
              }

              if (!path) {
                content = '(Invalid file path)';
              } else if (isBlacklisted(path)) {
                content = '(Diff skipped: ignored file)';
              } else if (diffCache.has(path)) {
                content = diffCache.get(path) || '(No diff)';
              } else {
                const diffContent = await getFileDiff(path);
                content = diffContent || '(No diff)';
                content = truncateText(content, MAX_TOOL_DIFF_CHARS, '\n...[Diff truncated]');
                diffCache.set(path, content);
              }
              toolCalls++;
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content,
            });
          } else if (toolCall.function.name === 'search_code') {
            if (spinner) spinner.text = `Agent is searching codebase...`;

            let content = 'No matches found.';

            if (!canUseTool) {
              forceFinal = true;
              content = '(Tool budget exceeded. Return final commit message.)';
            } else {
              let pattern = '';
              try {
                const args = parseToolArgs(toolCall.function.arguments);
                pattern = typeof args.pattern === 'string' ? args.pattern : '';
              } catch {
                pattern = '';
              }

              if (!pattern) {
                content = '(Invalid search pattern)';
              } else if (searchCache.has(pattern)) {
                content = searchCache.get(pattern) || 'No matches found.';
              } else {
                const searchResult = await searchCode(pattern);
                content = truncateText(
                  searchResult || 'No matches found.',
                  MAX_TOOL_SEARCH_CHARS,
                  '\n...[Search output truncated]'
                );
                searchCache.set(pattern, content);
              }
              toolCalls++;
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content,
            });
          }
        }

        if (forceFinal && !toolBudgetNotified) {
          messages.push({
            role: 'user',
            content: 'Tool budget reached. Please return the final commit message now.',
          });
          toolBudgetNotified = true;
        }
        continue;
      }

      if (message.content) {
        if (spinner) spinner.stop();
        return message.content
          .replace(/^```[a-z]*\n/i, '')
          .replace(/```$/, '')
          .trim();
      }
    } catch (error) {
      if (spinner) spinner.fail('Agent loop failed.');
      throw error;
    }
  }

  if (spinner) spinner.fail('Agent exceeded maximum iterations.');
  throw new Error('Agent exceeded maximum iterations.');
}
