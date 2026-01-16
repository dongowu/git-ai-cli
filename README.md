<p align="center">
  <h1 align="center">git-ai-cli</h1>
  <p align="center">
    <strong>🤖 AI-Powered Git Assistant: Commit, Context & Report</strong>
  </p>
  <p align="center">
    🚀 <strong>DeepSeek</strong> 深度优化 | 🏠 <strong>Ollama</strong> 隐私优先 | 🧠 <strong>分支感知</strong> | 📊 <strong>智能周报</strong>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dongowu/git-ai-cli"><img src="https://img.shields.io/npm/v/@dongowu/git-ai-cli.svg?style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@dongowu/git-ai-cli"><img src="https://img.shields.io/npm/dm/@dongowu/git-ai-cli.svg?style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/dongowu/git-ai-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@dongowu/git-ai-cli.svg?style=flat-square" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@dongowu/git-ai-cli.svg?style=flat-square" alt="node version"></a>
</p>

<p align="center">
  <a href="./README_EN.md">English</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-核心特性">核心特性</a> •
  <a href="#-git-flow-最佳实践">Git Flow</a> •
  <a href="#-智能周报">智能周报</a>
</p>

---

**git-ai-cli** 不仅仅是一个 Commit Message 生成器，它是你的**全能 AI 开发助手**。它能读懂你的代码 Diff，看懂你的分支意图，甚至帮你写好周报。

---

## 🚀 快速开始

```bash
# 1. 安装
npm install -g @dongowu/git-ai-cli

# 2. 初始化 (自动探测本地模型或配置 API)
git-ai init

# 3. 使用
git add .
git-ai
```

---

## ✨ 核心特性

### 1. 🇨🇳 极致本土化 & 隐私优先
- **DeepSeek/Qwen 深度优化**：内置专家级提示词，针对中文代码语境优化，不只是翻译 Diff，而是理解“意图”。
- **Ollama 零配置**：自动探测本地运行的 Ollama 模型（如 `llama3`, `deepseek-coder`），无需手动输入模型名。数据完全不出网，绝对安全。

### 2. 🧠 上下文感知 (Context Aware)
- **风格学习**：自动分析您最近的 10 次提交记录，模仿您的语气、格式（如 Emoji 使用习惯）和语言风格。
- **分支感知**：读取当前分支名（如 `feat/user-login`, `fix/JIRA-123`），生成包含 Issue ID 或功能模块的规范提交信息。

### 3. 🤖 Agent 智能体 (New)
从单纯的“文本生成”进化为“智能代码专家”。
- **Smart Diff**: 遇到超大变更不再瞎编。Agent 会自动分析统计数据，只读取核心文件的代码，大幅降低 Token 限制带来的影响。
- **影响分析 (Impact Analysis)**: 修改了核心 API？Agent 会主动**搜索整个代码库**（`git grep`），检查调用方是否同步修改，并在 Commit Body 中提示潜在风险。
- **Git Flow 护航**: 在 `release/*` 或 `hotfix/*` 分支上自动开启深度检查，守卫生产环境。

### 4. ⚙️ 工程化配置 (Project Config)
- **项目级配置**：支持在项目根目录创建 `.git-ai.json`，团队统一共享模型和 Prompt 配置（优先级 > 全局配置）。
- **智能忽略**：支持 `.git-aiignore` 文件，排除自动生成文件（如 `package-lock.json`）或大文件，节省 Token 并提高准确性。

### 4. 🪝 无感集成 (Git Hook)
- **零打扰**：安装 Hook 后，只需执行 `git commit`（不带 `-m`），AI 自动填充消息并打开编辑器。
- **兼容性**：完美兼容现有 Git 工作流，支持 `git commit --no-verify` 跳过。

### 4. 📊 智能周报 (AI Report)
- **一键生成**：`git-ai report` 自动分析你最近的代码提交。
- **价值导向**：将零碎的 Commit 转化为结构化的“核心产出”、“问题修复”和“技术优化”报告。

---

## ⚙️ 高级配置

### 项目级配置文件 `.git-ai.json`
在项目根目录创建此文件，可覆盖全局设置，方便团队统一规范：

```json
{
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-reasoner",
  "agentModel": "deepseek-chat",
  "locale": "zh",
  "enableFooter": true
}
```

说明：
- `model`：基础模式生成提交信息的模型
- `agentModel`：Agent 模式（`-a`）专用模型（建议选择稳定支持 tools 的模型；DeepSeek 常用 `deepseek-chat`）
- `locale`：仅支持 `zh` / `en`
- `apiKey` 建议通过环境变量或全局配置设置，不要提交到仓库

### 命令行配置（可脚本化）

```bash
# 查看当前生效配置（包含环境变量覆盖）
git-ai config get --json

# 设置全局配置（写入全局配置文件）
git-ai config set model deepseek-chat

# 设置项目级配置（写入当前项目 .git-ai.json）
git-ai config set agentModel deepseek-chat --local

# 查看可配置项 / 环境变量覆盖
git-ai config describe
```

### 环境变量（CI/脚本）

常用环境变量（优先级高于配置文件）：
- `GIT_AI_PROVIDER` / `GIT_AI_BASE_URL` / `GIT_AI_MODEL` / `GIT_AI_AGENT_MODEL`
- `GIT_AI_API_KEY`（也支持 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`）
- `GIT_AI_TIMEOUT_MS`（请求超时，默认 120000）
- `GIT_AI_MAX_DIFF_CHARS`（控制 diff 截断长度）
- `GIT_AI_MAX_OUTPUT_TOKENS`（控制输出 token 上限）
- `GIT_AI_DEBUG=1`（打印更详细错误）

OpenCommit 兼容变量（可直接复用）：
- `OCO_AI_PROVIDER` / `OCO_MODEL` / `OCO_API_KEY`
- `OCO_TOKENS_MAX_INPUT` / `OCO_TOKENS_MAX_OUTPUT`

### 忽略文件 `.git-aiignore`
在项目根目录创建，用于排除不想发送给 AI 的文件（语法同 `.gitignore`）：

```text
package-lock.json
dist/
*.min.js
```

同时兼容 OpenCommit 的 `.opencommitignore`（两者都会读取）。

### 常见问题

**1) 401 / API Key 无效**
- 先看生效配置：`git-ai config get --json --local`
- 再检查环境变量是否覆盖：`GIT_AI_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY / OCO_API_KEY`

**2) Diff 被截断**
- 通过 `.git-aiignore` / `.opencommitignore` 忽略大文件（lock/build/map）
- 或设置 `GIT_AI_MAX_DIFF_CHARS`（也兼容 `OCO_TOKENS_MAX_INPUT`）

**3) Agent 自动回退到基础模式**
- 设置 `GIT_AI_DEBUG=1` 可以看到回退原因（超时/限流/鉴权等）

---

## 📖 使用方式

### 场景一：交互式提交 (Interactive)

```bash
git add .
git-ai
```

### 场景二：Git Flow 最佳实践 (Hook) 🌟 推荐

这是最流畅的体验。你不需要改变任何习惯，只需一次安装：

```bash
# 在当前项目安装
git-ai hook install

# 或者全局安装（所有项目生效）
git-ai hook install --global
```

**之后只需：**
```bash
git checkout -b feature/awesome-login
# ... 写代码 ...
git add .
git commit  # ✨ AI 自动帮你写好了 "feat(login): implement awesome login logic"
```

### 场景三：生成周报 (Report)

每逢周五不想写周报？

```bash
# 生成本周日报/周报
git-ai report

# 生成最近 30 天的汇报
git-ai report --days 30
```

---

## 🛠 命令速查

| 命令 | 别名 | 说明 |
|------|------|------|
| `git-ai init` | `config` | **初始化配置**（设置模型、Key、语言） |
| `git-ai config get` | | 查看当前生效配置（支持 `--json` / `--local`） |
| `git-ai config set <key> <value>` | | 设置配置（支持 `--local` / `--json`） |
| `git-ai config describe` | | 查看可配置项与环境变量覆盖 |
| `git-ai` | | 交互式生成并提交 |
| `git-ai -a` | | **Agent 模式** (深度分析 & 影响检查) |
| `git-ai -y` | | 跳过确认直接提交 |
| `git-ai -n 3` | | 生成 3 条候选消息 |
| `git-ai -l en` | | 强制输出语言（en/zh） |
| `git-ai hook install` | | **安装 Git Hook** (支持 `--global`) |
| `git-ai hook remove` | | 移除 Git Hook |
| `git-ai report` | | **生成 AI 周报** (支持 `--days`) |
| `git-ai msg` | | 仅输出消息（供脚本调用） |

---

## 🤖 支持的模型

| 类型 | 服务商 | 优势 | 配置方式 |
|------|--------|------|----------|
| **本地隐私** | **Ollama** | 免费、离线、绝对隐私 | `git-ai init` 自动探测 |
| | **LM Studio** | 兼容性好 | 手动输入 URL |
| **国内高速** | **DeepSeek** | **性价比之王**，代码能力极强 | API Key |
| | **通义千问** | 阿里生态，长文本能力强 | API Key |
| | **智谱/Moonshot** | 国内主流模型 | API Key |
| **国际通用** | **OpenAI** | GPT-4o 基准能力 | API Key |

---



## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by git-ai team
  <br>
  <sub>🤖 Generated by git-ai 🚀</sub>
</p>
