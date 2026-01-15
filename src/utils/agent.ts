import OpenAI from 'openai';
import { getFileDiff, getFileStats, FileStat, searchCode } from './git.js';
import { AIConfig } from '../types.js';
import chalk from 'chalk';
import ora from 'ora';

const AGENT_SYSTEM_PROMPT = `You are an intelligent Git Assistant with access to tools.
Your goal is to write a high-quality Git commit message following Conventional Commits format.

Process:
1. You will be given a list of changed files with statistics (+/- lines).
2. Analyze which files are critical to understand the change.
3. Use the 'get_file_diff' tool to read the diffs of specific files.
4. IMPORTANT: If you see changes to function signatures, exported APIs, or core logic, use 'search_code' to check if these changes might affect other parts of the project that are NOT in the current staged changes.
5. If you find potential risks (e.g., you changed a function but didn't update all call sites), mention this as a warning in the commit message body.

Rules:
- Focus on core logic and ignore large auto-generated files.
- The output format of the final message must be: <type>(<scope>): <subject> (and optional body).
- **DO NOT** use markdown code blocks (like \`\`\`). Just return the raw commit message text.
- Reply with just the commit message when you are done.
`;

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
  quiet = false
): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Current Branch: ${branchName || 'unknown'}

Staged Files Summary:
${stats.map((s) => `${s.file} (+${s.insertions}, -${s.deletions})`).join('\n')}

Please analyze these changes. If you detect breaking changes, search for usages to ensure safety.`,
    },
  ];

  const spinner = !quiet ? ora('Agent is analyzing file stats...').start() : null;
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
      });

      const message = response.choices[0]?.message;

      if (!message) {
        throw new Error('Empty response from AI');
      }

      messages.push(message);

      // Case 1: Tool Calls
      if (message.tool_calls?.length) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.function.name === 'get_file_diff') {
            if (spinner) spinner.text = `Agent is inspecting diffs...`;
            const args = JSON.parse(toolCall.function.arguments);
            const diffContent = await getFileDiff(args.path);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: diffContent || '(No diff)',
            });
          } else if (toolCall.function.name === 'search_code') {
            if (spinner) spinner.text = `Agent is searching codebase...`;
            const args = JSON.parse(toolCall.function.arguments);
            const searchResult = await searchCode(args.pattern);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: searchResult,
            });
          }
        }
        iterations++;
        continue;
      }

      // Case 2: Final Content
      if (message.content) {
        if (spinner) spinner.stop();
        // Clean up markdown code blocks if present
        return message.content
          .replace(/^```[a-z]*\n/i, '') // Remove opening ```git/bash/text
          .replace(/```$/, '')          // Remove closing ```
          .trim();
      }

    } catch (error) {
      if (spinner) spinner.fail('Agent loop failed.');
      throw error;
    }
  }

  if (spinner) spinner.fail('Agent exceeded maximum iterations.');
  return 'chore: commit (agent failed to converge)';
}
