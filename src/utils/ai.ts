import OpenAI from 'openai';
import type { AIConfig } from '../types.js';

const DEFAULT_SYSTEM_PROMPT_EN = `You are an expert at writing Git commit messages following the Conventional Commits specification.

Based on the git diff provided, generate a concise and descriptive commit message.

Rules:
1. Use the format: <type>(<scope>): <subject>
2. Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
3. Keep the subject line under 50 characters
4. Use imperative mood ("add" not "added")
5. Don't end the subject line with a period
6. If needed, add a blank line followed by a body for more details

Only output the commit message, nothing else.`;

const DEFAULT_SYSTEM_PROMPT_ZH = `你是一个专业的 Git commit message 编写专家，遵循 Conventional Commits 规范。

根据提供的 git diff，生成简洁且描述性的提交信息。

规则：
1. 使用格式: <type>(<scope>): <subject>
2. type 类型: feat, fix, docs, style, refactor, perf, test, chore, build, ci
3. subject 保持在 50 字符以内
4. 使用祈使语气
5. subject 末尾不要加句号
6. 如需要，空一行后添加 body 提供更多细节

只输出 commit message，不要输出其他内容。`;

export function createAIClient(config: AIConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey || 'ollama',
    baseURL: config.baseUrl,
    timeout: 30000, // 30 second timeout
    maxRetries: 2,  // Built-in retry support
  });
}

export interface CommitMessageGenerationInput {
  diff: string;
  stagedFiles?: string[];
  ignoredFiles?: string[];
  truncated?: boolean;
}

export async function generateCommitMessage(
  client: OpenAI,
  input: CommitMessageGenerationInput,
  config: AIConfig
): Promise<string> {
  const systemPrompt =
    config.customPrompt ||
    (config.locale === 'zh' ? DEFAULT_SYSTEM_PROMPT_ZH : DEFAULT_SYSTEM_PROMPT_EN);

  const isZh = config.locale === 'zh';
  const lines: string[] = [];

  if (input.stagedFiles?.length) {
    const header = isZh ? '已暂存文件:' : 'Staged files:';
    lines.push(`${header}\n${input.stagedFiles.map((f) => `- ${f}`).join('\n')}`);
  }

  if (input.ignoredFiles?.length) {
    const header = isZh
      ? '以下文件为节省 Token 已忽略 Diff:'
      : 'Ignored files (diff omitted for token optimization):';
    lines.push(`${header}\n${input.ignoredFiles.map((f) => `- ${f}`).join('\n')}`);
  }

  if (input.truncated) {
    lines.push(
      isZh
        ? '注意：Diff 内容已因长度限制被截断。'
        : 'Note: The diff was truncated due to size limits.'
    );
  }

  const diffHeader = isZh ? 'Git Diff:' : 'Git diff:';
  lines.push(`${diffHeader}\n\n${input.diff || '(empty)'}`);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: lines.join('\n\n') },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const message = response.choices[0]?.message?.content?.trim();
  if (!message) {
    throw new Error('Failed to generate commit message: empty response');
  }

  return message;
}
