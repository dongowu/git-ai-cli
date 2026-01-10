<p align="center">
  <h1 align="center">git-ai-cli</h1>
  <p align="center">
    <strong>AI-powered Git commit message generator</strong>
  </p>
  <p align="center">
    极速、隐私优先、支持任意模型的 Git 智能提交助手
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
  <a href="#-特性">特性</a> •
  <a href="#-支持的模型">支持的模型</a> •
  <a href="#english">English</a>
</p>

---

## 演示

```bash
$ git add .
$ git-ai

📁 Staged files:
   src/utils/ai.ts
   src/commands/commit.ts

✨ Generated commit message:

   feat(ai): add multi-model support for commit generation

? What would you like to do?
❯ 🚀 Commit
  📝 Edit
  🔄 Regenerate
  ❌ Cancel
```

---

## 🚀 快速开始

```bash
# 安装
npm install -g @dongowu/git-ai-cli

# 配置 (选择 AI 服务商，输入 API Key)
git-ai config

# 使用
git add .
git-ai
```

## ✨ 特性

| 特性 | 描述 |
|------|------|
| 🤖 **多模型支持** | DeepSeek、通义千问、智谱GLM、Moonshot、OpenAI 等 10+ 模型 |
| 🏠 **本地部署** | 支持 Ollama、LM Studio，数据不出本机 |
| 🔍 **智能 Diff** | 自动过滤 lock 文件，Token 优化截断 |
| 💬 **交互式** | 提交 / 编辑 / 重新生成 / 取消 |
| ⚡ **一键提交** | `-y` 参数跳过确认，CI/CD 友好 |
| 🎯 **多条候选** | `-n 3` 生成多条消息供选择 |
| 🪝 **Git Hook** | 自动集成到 git commit 流程 |
| 📝 **规范化** | 遵循 Conventional Commits 标准 |
| 🌍 **中英双语** | 支持中文和英文输出 |

## 🤖 支持的模型

### 国内大模型（推荐）

| 服务商 | 默认模型 | 获取 API Key |
|--------|----------|--------------|
| **DeepSeek** (深度求索) | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| **Qwen** (通义千问) | `qwen-turbo` | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/) |
| **Zhipu** (智谱 GLM) | `glm-4-flash` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| **Moonshot** (月之暗面) | `moonshot-v1-8k` | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| **Baichuan** (百川) | `Baichuan4` | [platform.baichuan-ai.com](https://platform.baichuan-ai.com/) |
| **Yi** (零一万物) | `yi-lightning` | [platform.lingyiwanwu.com](https://platform.lingyiwanwu.com/) |
| **SiliconFlow** (硅基流动) | `Qwen2.5-7B` | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/) |

### 国际大模型

| 服务商 | 默认模型 | 获取 API Key |
|--------|----------|--------------|
| **OpenAI** | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com/) |

### 本地部署（无需 API Key）

| 服务商 | 默认模型 | 说明 |
|--------|----------|------|
| **Ollama** | `qwen2.5:7b` | [ollama.ai](https://ollama.ai/) |
| **LM Studio** | `local-model` | [lmstudio.ai](https://lmstudio.ai/) |

## ⚙️ 配置

### 配置命令

```bash
git-ai config
```

交互式配置：
1. 选择 AI 服务商
2. 输入 API Key（本地模型跳过）
3. 选择模型
4. 选择输出语言（中文/英文）
5. 可选：自定义 System Prompt

### 配置文件位置

| 系统 | 路径 |
|------|------|
| macOS | `~/Library/Preferences/git-ai-cli-nodejs/config.json` |
| Linux | `~/.config/git-ai-cli-nodejs/config.json` |
| Windows | `%APPDATA%/git-ai-cli-nodejs/Config/config.json` |

## 🔧 高级功能

### 命令行选项

```bash
# 一键提交（跳过确认，CI/CD 友好）
git-ai -y
git-ai --yes

# 生成多条候选消息
git-ai -n 3
git-ai --num 3

# 组合使用
git-ai -y -n 3    # 生成 3 条，自动选择第一条提交

# Hook 模式（供 git hook 调用，仅输出消息）
git-ai --hook
```

### Git Hook 集成

自动集成到 `git commit` 流程，无需手动运行 `git-ai`：

```bash
# 安装 hook
git-ai hook install

# 查看状态
git-ai hook status

# 移除 hook
git-ai hook remove
```

安装后，直接运行 `git commit`（不带 `-m`）会自动生成 commit message：

```bash
git add .
git commit    # 自动调用 git-ai 生成消息
```

> 💡 跳过 hook: `git commit --no-verify`

### 自动忽略的文件

以下文件会自动从 Diff 分析中排除，避免浪费 Token：

- **Lock 文件**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`
- **压缩文件**: `*.min.js`, `*.min.css`, `*.map`
- **构建产物**: `dist/`, `build/`, `.next/`

### 自定义 Prompt

在配置时选择「自定义 System Prompt」，可以：
- 强制添加 Emoji 前缀
- 使用特定语言
- 遵循团队规范

---

## English

### Installation

```bash
npm install -g @dongowu/git-ai-cli
```

### Quick Start

```bash
# Configure AI provider
git-ai config

# Generate commit message
git add .
git-ai
```

### Features

- **Multi-model**: DeepSeek, Qwen, Zhipu GLM, Moonshot, OpenAI, and 10+ more
- **Local deployment**: Ollama, LM Studio - keep your data private
- **Smart diff**: Auto-filter lock files, token optimization
- **Interactive**: Commit / Edit / Regenerate / Cancel
- **One-click commit**: `-y` flag for CI/CD pipelines
- **Multiple choices**: `-n 3` to generate multiple options
- **Git Hook**: Auto-integrate with `git commit`
- **Conventional Commits**: Standard commit message format

### CLI Options

```bash
# Auto commit (skip confirmation)
git-ai -y

# Generate multiple choices
git-ai -n 3

# Hook mode (for git hooks, outputs message only)
git-ai --hook

# Git Hook
git-ai hook install   # Install hook
git-ai hook remove    # Remove hook
git-ai hook status    # Check status
```

### Workflow

```
┌─────────────────┐
│   git add .     │
└────────┬────────┘
         ▼
┌─────────────────┐
│    git-ai       │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Analyze Diff   │
└────────┬────────┘
         ▼
┌─────────────────┐
│  AI Generate    │
└────────┬────────┘
         ▼
┌─────────────────────────────┐
│  Choose Action:             │
│  • Commit                   │
│  • Edit                     │
│  • Regenerate               │
│  • Cancel                   │
└─────────────────────────────┘
```

---

## 🤝 Contributing

欢迎贡献代码！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ for developers who hate writing commit messages
</p>
