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
  <a href="#-使用指南推荐流程">使用指南</a> •
  <a href="#-配置">配置</a> •
  <a href="#-命令速查">命令</a>
</p>

---

**git-ai-cli** 不只是 Commit Message 生成器，它是你的**全能 AI 开发助手**：理解 diff、识别分支意图、统一团队规范、自动生成周报/PR/Release Notes。

---

## 🚀 快速开始

```bash
# 1) 安装
npm install -g @dongowu/git-ai-cli

# 2) 初始化 (自动探测本地模型或配置 API)
git-ai init

# 3) 使用
git add .
git-ai
```

---

## ✅ 使用指南（推荐流程）

1) **安装与初始化**
```bash
npm install -g @dongowu/git-ai-cli
git-ai init
```

2) **团队配置（推荐）**：在项目根目录写 `.git-ai.json`
```json
{
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-reasoner",
  "agentModel": "deepseek-chat",
  "locale": "en",
  "enableFooter": false,
  "rulesPreset": "conventional",
  "fallbackModels": ["deepseek-chat", "qwen-turbo"],
  "policy": { "strict": true },
  "rules": {
    "types": ["feat", "fix", "docs", "refactor", "perf", "test", "chore", "build", "ci"],
    "maxSubjectLength": 50,
    "requireScope": false,
    "issuePattern": "[A-Z]+-\\d+",
    "issuePlacement": "footer",
    "issueFooterPrefix": "Refs",
    "requireIssue": false
  },
  "branch": {
    "types": ["feat", "fix", "docs"],
    "pattern": "{type}/{issue?}{name}",
    "issueSeparator": "-",
    "nameMaxLength": 50
  }
}
```

3) **日常提交**
```bash
git add .
git-ai
```

4) **Hook 无感集成（强烈推荐）**
```bash
git-ai hook install
# 失败阻断提交（可选）
GIT_AI_HOOK_STRICT=1 git commit
# 失败时关闭兜底（可选）
GIT_AI_HOOK_FALLBACK=0 git commit
```

5) **脚本 / CI**
```bash
git-ai msg --json
```

6) **创建分支（交互式）**
```bash
git-ai branch
```

7) **PR / Release / Report**
```bash
# PR 描述
git-ai pr --base main --head HEAD

# Release Notes
git-ai release --from v1.0.0 --to HEAD

# 周报
 git-ai report --days 7
```

---

## ✨ 核心特性

- **DeepSeek/Qwen 深度优化**：理解意图而不是简单翻译 diff
- **本地模型隐私优先**：Ollama / LM Studio 即插即用
- **上下文感知**：分支规则、提交风格学习、智能 scope
- **Agent 智能体**：大改动时自动做影响分析
- **团队规则**：规则模板 + 强校验（policy）
- **Hook 集成**：无感生成提交信息
- **AI 报告**：日报/周报/PR/Release Notes 一键生成

---

## ⚙️ 配置

### 项目级配置 `.git-ai.json`
- `provider / baseUrl / model / agentModel`
- `locale`: `zh` / `en`
- `outputFormat`: `text` / `json`
- `rulesPreset`: `conventional` / `angular` / `minimal`
- `fallbackModels`: 主模型失败时的回退模型列表
- `policy.strict`: 是否阻断不合规提交
- `rules`: 提交规范（类型、scope、长度、issue 等）
- `branch`: 分支规范（类型、pattern、长度等）

### 规则与策略
- `issuePattern`: 任务号正则（如 `PROJ-123` / `#123`）
- `issuePlacement`: `scope | subject | footer`
- `requireIssue`: 是否必须包含任务号
- `policy.strict`: 不合规则阻断提交
- `branch.pattern`: 分支模板（如 `{type}/{issue?}{name}`）
- `branch.types`: 分支类型列表
- `branch.issueSeparator`: issue 分隔符（默认 `-`）
- `branch.nameMaxLength`: 分支名长度上限

### CLI 设置（可脚本化）
```bash
# 查看当前生效配置
git-ai config get --json

# 设置规则模板 / 严格策略 / 回退模型
git-ai config set rulesPreset conventional
git-ai config set policy '{"strict":true}'
git-ai config set fallbackModels "deepseek-chat,qwen-turbo"

# 设置规则（JSON 或 @文件）
git-ai config set rules '{"types":["feat","fix"]}'
git-ai config set rules @rules.json --local

# 设置分支规则
git-ai config set branch '{"types":["feat","fix"],"pattern":"{type}/{issue?}{name}"}'
```

---

## 🛠 命令速查

| 命令 | 说明 |
|------|------|
| `git-ai init` | 初始化配置 |
| `git-ai config get/set/describe` | 配置管理 |
| `git-ai` / `git-ai commit` | 交互式提交 |
| `git-ai -a` | Agent 模式 |
| `git-ai msg` | 仅输出消息（脚本/Hook） |
| `git-ai branch` | 交互式创建分支 |
| `git-ai hook install/remove` | Git Hook 管理 |
| `git-ai report` | 生成 AI 周报 |
| `git-ai pr` | 生成 PR 描述 |
| `git-ai release` | 生成 Release Notes |

---

## ⚡ 环境变量（常用）

- `GIT_AI_PROVIDER` / `GIT_AI_BASE_URL` / `GIT_AI_MODEL` / `GIT_AI_AGENT_MODEL`
- `GIT_AI_API_KEY`（也支持 `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`）
- `GIT_AI_TIMEOUT_MS`
- `GIT_AI_MAX_DIFF_CHARS` / `GIT_AI_MAX_OUTPUT_TOKENS`
- `GIT_AI_RULES_PRESET`
- `GIT_AI_FALLBACK_MODELS`
- `GIT_AI_POLICY_STRICT`
- `GIT_AI_ISSUE_PATTERN` / `GIT_AI_ISSUE_PLACEMENT` / `GIT_AI_REQUIRE_ISSUE`
- `GIT_AI_OUTPUT_FORMAT=json`
- `GIT_AI_MSG_DELIM=<<<GIT_AI_END>>>`
- `GIT_AI_HOOK_STRICT=1` / `GIT_AI_HOOK_FALLBACK=0`
- `GIT_AI_BRANCH_PATTERN` / `GIT_AI_BRANCH_TYPES`
- `GIT_AI_BRANCH_ISSUE_SEPARATOR` / `GIT_AI_BRANCH_NAME_MAXLEN`

---

## 🧩 忽略文件 `.git-aiignore`

```text
package-lock.json
dist/
*.min.js
```

同时兼容 OpenCommit 的 `.opencommitignore`。

---

## ❓常见问题

**1) 401 / API Key 无效**
- 先看配置：`git-ai config get --json --local`
- 检查环境变量是否覆盖

**2) Diff 被截断**
- 用 `.git-aiignore` 忽略大文件
- 或设置 `GIT_AI_MAX_DIFF_CHARS`

**3) Agent 自动回退**
- 设置 `GIT_AI_DEBUG=1` 查看原因

---

## 🤖 支持的模型

| 类型 | 服务商 | 优势 | 配置方式 |
|------|--------|------|----------|
| **本地隐私** | **Ollama** | 免费、离线、隐私 | `git-ai init` 自动探测 |
| | **LM Studio** | 兼容性好 | 手动输入 URL |
| **国内高速** | **DeepSeek** | 性价比高 | API Key |
| | **通义千问** | 长文本能力强 | API Key |
| | **智谱/Moonshot** | 国内主流 | API Key |
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
