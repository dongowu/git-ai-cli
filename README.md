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
  <a href="#-快速开始">快速开始</a> •
  <a href="#-核心特性">核心特性</a> •
  <a href="#-git-flow-最佳实践">Git Flow</a> •
  <a href="#-智能周报">智能周报</a> •
  <a href="#english">English</a>
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
- **分支感知**：AI 会读取当前分支名（如 `feat/user-login`, `fix/JIRA-123`）。
- **语义生成**：结合分支语义，生成包含 Issue ID 或功能模块的规范提交信息。

### 3. 🪝 无感集成 (Git Hook)
- **零打扰**：安装 Hook 后，只需执行 `git commit`（不带 `-m`），AI 自动填充消息并打开编辑器。
- **兼容性**：完美兼容现有 Git 工作流，支持 `git commit --no-verify` 跳过。

### 4. 📊 智能周报 (AI Report)
- **一键生成**：`git-ai report` 自动分析你最近的代码提交。
- **价值导向**：将零碎的 Commit 转化为结构化的“核心产出”、“问题修复”和“技术优化”报告。

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
| `git-ai` | | 交互式生成并提交 |
| `git-ai -y` | | 跳过确认直接提交 |
| `git-ai -n 3` | | 生成 3 条候选消息 |
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

## English

### Installation

```bash
npm install -g @dongowu/git-ai-cli
```

### Features

- **Context Aware**: Understands your Git branch (e.g., `feat/login`) to generate semantically correct commits.
- **Privacy First**: Seamless support for local **Ollama** models.
- **Git Hooks**: `git-ai hook install` integrates AI directly into your `git commit` workflow.
- **AI Reports**: `git-ai report` turns your commit history into professional weekly reports.

### Usage

**1. Setup**
```bash
git-ai init
```

**2. Commit**
```bash
git add .
git-ai
```

**3. Generate Report**
```bash
git-ai report
```

### Git Hook Integration (Recommended)

```bash
git-ai hook install --global
```
Now just run `git commit` as usual, and AI will handle the rest!

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by git-ai team
  <br>
  <sub>🤖 Generated by git-ai 🚀</sub>
</p>