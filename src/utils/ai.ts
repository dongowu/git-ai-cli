import OpenAI from 'openai';
import type { AIConfig } from '../types.js';
import { runAgentLoop } from './agent.js';
import { getFileStats } from './git.js';
import chalk from 'chalk';

const DEFAULT_SYSTEM_PROMPT_EN = `You are an expert at writing Git commit messages following the Conventional Commits specification.

Based on the git diff provided, generate a concise and descriptive commit message.

Rules:
1. Use the format: <type>(<scope>): <subject>
2. Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
3. Keep the subject line under 50 characters
4. Use imperative mood ("add" not "added")
5. Don't end the subject line with a period
6. If needed, add a blank line followed by a body for more details
7. Git Flow Branch Mapping (Priority):
   - feature/* -> type: feat
   - bugfix/* -> type: fix
   - hotfix/* -> type: fix
   - release/* -> type: chore
    - docs/* -> type: docs
    - If branch name matches, infer <scope> from it (e.g. feature/login -> feat(login): ...)
    - If branch name doesn't match these patterns, ignore it and infer type/scope strictly from the code changes.

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
7. Git Flow 分支映射规则 (优先级最高):
   - feature/* -> type: feat
   - bugfix/* -> type: fix
   - hotfix/* -> type: fix
   - release/* -> type: chore
   - docs/* -> type: docs
   - 如果分支名匹配，请从中推断 <scope> (例如: feature/login -> feat(login): ...)
   - 如果分支名不符合上述标准前缀，请忽略分支名，仅依据代码变更内容(diff)来决定 type 和 scope。

只输出 commit message，不要输出其他内容。`;

const DEEPSEEK_PROMPT_ZH = `你是一个智能编程助手，专注于生成高质量的 Git 提交信息。

请仔细分析下方的 Git Diff，理解代码变更的*意图*（不仅仅是修改了什么）。

规则：
1. 严格遵循 Conventional Commits 规范: <type>(<scope>): <subject>
2. 类型(type)必须是: feat, fix, docs, style, refactor, perf, test, chore, build, ci
3. 描述(subject)需简洁有力，50字符以内，使用中文。
4. 如果变更复杂，请在 subject 后空一行，添加详细的 body 说明。
5. 专注于*为什么*变更，而不仅仅是*改了什么*。
6. Git Flow 分支映射规则 (优先级最高):
   - feature/* -> type: feat
   - bugfix/* -> type: fix
   - hotfix/* -> type: fix
   - release/* -> type: chore
   - docs/* -> type: docs
   - 如果分支名匹配，请从中推断 <scope> (例如: feature/login -> feat(login): ...)
   - 如果分支名不符合上述标准前缀，请忽略分支名，仅依据代码变更内容(diff)来决定 type 和 scope。

只输出最终的 Commit Message，不包含 Markdown 代码块或其他解释。`;

export function createAIClient(config: AIConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey || 'ollama',
    baseURL: config.baseUrl,
    timeout: 30000, // 30 second timeout
    maxRetries: 2,  // Built-in retry support
  });
}

export interface CommitMessageGenerationInput {
  diff?: string;
  diffLoader?: () => Promise<{ diff: string; truncated: boolean; ignoredFiles: string[] }>;
  stagedFiles?: string[];
  ignoredFiles?: string[];
  truncated?: boolean;
  branchName?: string;
  recentCommits?: string[];
  forceAgent?: boolean;
  quiet?: boolean;
}

export async function generateCommitMessage(
  client: OpenAI,
  input: CommitMessageGenerationInput,
  config: AIConfig,
  numChoices = 1
): Promise<string[]> {
  let diff = input.diff;
  let ignoredFiles = input.ignoredFiles;
  let truncated = input.truncated;

  const ensureDiff = async (): Promise<void> => {
    if (diff !== undefined) return;
    if (input.diffLoader) {
      const loaded = await input.diffLoader();
      diff = loaded.diff;
      truncated = loaded.truncated;
      ignoredFiles = loaded.ignoredFiles;
      return;
    }
    diff = '';
  };

  // Auto-enable Agent for critical branches in Git Flow
  const isCriticalBranch = input.branchName && /^(release|hotfix|master|main)/.test(input.branchName);
  const shouldRunAgent = (input.truncated || input.forceAgent || isCriticalBranch) && numChoices === 1;

  // Trigger Agent Mode if diff is truncated OR forced by user OR critical branch
  if (shouldRunAgent) {
    try {
      const stats = await getFileStats();
      if (stats.length > 0) {
        const agentMessage = await runAgentLoop(client, config, stats, input.branchName, input.quiet);
        return [agentMessage];
      }
    } catch (error) {
      if (!input.quiet) {
        console.error(chalk.yellow('\n⚠️  Agent mode failed, falling back to basic mode...'));
      }
    }
  }

  await ensureDiff();

  let systemPrompt = config.customPrompt;

  if (!systemPrompt) {
    const isZh = config.locale === 'zh';
    if (config.provider === 'deepseek' || config.provider === 'qwen') {
      systemPrompt = isZh ? DEEPSEEK_PROMPT_ZH : DEFAULT_SYSTEM_PROMPT_EN; // Reuse EN for now or add DeepSeek EN later
    } else {
      systemPrompt = isZh ? DEFAULT_SYSTEM_PROMPT_ZH : DEFAULT_SYSTEM_PROMPT_EN;
    }
  }

  const isZh = config.locale === 'zh';
  const lines: string[] = [];

  if (numChoices > 1) {
    // Add instruction for multiple choices
    const multiInstruction = isZh
      ? `\n请生成 ${numChoices} 个不同的 commit message 选项，每个选项用 "---" 分隔。`
      : `\nPlease generate ${numChoices} distinct commit message options, separated by "---".`;
    systemPrompt += multiInstruction;
  }

  if (input.recentCommits?.length) {
    const header = isZh
      ? '参考历史提交风格 (请模仿以下风格):'
      : 'Reference recent commits (please mimic the style):';
    // Extract subject from "hash date subject" format
    // Format is "%h %cd %s", so we take everything after the second space
    const cleanCommits = input.recentCommits
      .map((line) => {
        const parts = line.split(' ');
        if (parts.length >= 3) {
          return parts.slice(2).join(' ');
        }
        return line;
      })
      .slice(0, 10); // Limit to 10 to save tokens

    lines.push(`${header}\n${cleanCommits.map((c) => `- ${c}`).join('\n')}`);
  }

  if (input.branchName) {
    const header = isZh ? '当前分支:' : 'Current branch:';
    lines.push(`${header} ${input.branchName}`);
  }

  if (input.stagedFiles?.length) {
    const header = isZh ? '已暂存文件:' : 'Staged files:';
    lines.push(`${header}\n${input.stagedFiles.map((f) => `- ${f}`).join('\n')}`);
  }

  if (ignoredFiles?.length) {
    const header = isZh
      ? '以下文件为节省 Token 已忽略 Diff:'
      : 'Ignored files (diff omitted for token optimization):';
    lines.push(`${header}\n${ignoredFiles.map((f) => `- ${f}`).join('\n')}`);
  }

  if (truncated) {
    lines.push(
      isZh
        ? '注意：Diff 内容已因长度限制被截断。'
        : 'Note: The diff was truncated due to size limits.'
    );
  }

  const diffHeader = isZh ? 'Git Diff:' : 'Git diff:';
  lines.push(`${diffHeader}\n\n${diff || '(empty)'}`);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: lines.join('\n\n') },
    ],
    temperature: 0.7,
    max_tokens: 500 * numChoices, // Increase token limit for multiple choices
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Failed to generate commit message: empty response');
  }

  const messages = content
    .split('---')
    .map((msg) => msg.trim())
    .filter(Boolean);

  if (config.enableFooter) {
    return messages.map((msg) => `${msg}\n\n🤖 Generated by git-ai 🚀`);
  }

  return messages;
}

const REPORT_PROMPT_ZH = `你是一位资深技术专家，擅长撰写高质量的周报/日报。

请根据提供的 Git Commit 记录，整理出一份结构清晰、重点突出的工作汇报。

规则：
1. **分类汇总**：将提交记录归类（例如：✨ 新特性、🐛 问题修复、⚡️ 性能优化、📝 文档与其他）。
2. **价值导向**：不要只罗列代码变更，尝试用简练的语言描述业务价值或技术成果。
3. **格式美观**：使用 Markdown 格式，利用列表和 emoji 让阅读体验更佳。
4. **过滤噪音**：忽略无意义的测试提交或临时提交。

输出格式示例：
## 📅 工作汇报 (Time Range)

### ✨ 核心产出
- **功能 A**: 完成了...逻辑，提升了...体验
- **功能 B**: ...

### 🐛 问题修复
- 修复了...导致的崩溃问题

### 📝 其他
- ...

(结尾可加一句下周计划建议)`;

const REPORT_PROMPT_EN = `You are a senior technical lead expert at writing professional progress reports.

Based on the provided Git Commit logs, generate a structured and high-quality status report.

Rules:
1. **Categorize**: Group commits logically (e.g., ✨ Features, 🐛 Bug Fixes, ⚡️ Improvements, 📝 Other).
2. **Value-Driven**: Don't just list technical changes; briefly emphasize the value or outcome.
3. **Formatting**: Use Markdown with bullet points and emojis.
4. **Filter Noise**: Ignore trivial or "wip" commits.

Output structured markdown text only.`;

export async function generateWeeklyReport(
  client: OpenAI,
  commits: string[],
  config: AIConfig
): Promise<string> {
  const isZh = config.locale === 'zh';
  const systemPrompt = isZh ? REPORT_PROMPT_ZH : REPORT_PROMPT_EN;

  if (commits.length === 0) {
    return isZh ? '这段时间没有找到您的提交记录。' : 'No commits found for this period.';
  }

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Commit History:\n${commits.join('\n')}` },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}
