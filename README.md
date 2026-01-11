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
  <a href="#-使用方式">使用方式</a> •
  <a href="#-支持的模型">支持的模型</a> •
  <a href="#english">English</a>
</p>

---

## 🚀 快速开始

```bash
# 1. 安装
npm install -g @dongowu/git-ai-cli

# 2. 配置 (选择 AI 服务商，输入 API Key)
git-ai config

# 3. 使用
git add .
git-ai
```

---

## 📖 使用方式

### 方式一：手动调用（推荐新手）

```bash
git add .                    # 暂存更改
git-ai                       # 生成消息 → 选择操作 → 提交
```

**交互选项：**
- 🚀 Commit - 使用生成的消息提交
- 📝 Edit - 编辑后提交
- 🔄 Regenerate - 重新生成
- ❌ Cancel - 取消

### 方式二：Git Hook 集成（推荐老手）

安装后，`git commit` 会自动生成消息，无需手动运行 `git-ai`：

```bash
# 一次性安装
git-ai hook install

# 之后正常使用 git
git add .
git commit                   # 自动生成消息，打开编辑器确认
```

**跳过 Hook：**
```bash
git commit -m "手动消息"      # 已有消息时自动跳过
GIT_AI_DISABLED=1 git commit  # 临时禁用
git-ai hook remove            # 永久移除
```

---

## 🛠 命令速查

| 命令 | 说明 | 使用场景 |
|------|------|----------|
| `git-ai` | 交互式生成并提交 | 日常使用 |
| `git-ai -y` | 跳过确认直接提交 | CI/CD、快速提交 |
| `git-ai -n 3` | 生成 3 条候选消息 | 选择最佳消息 |
| `git-ai msg` | 仅输出消息到 stdout | 脚本集成 |
| `git-ai msg --json` | JSON 格式输出 | 程序化处理 |
| `git-ai msg --quiet` | 静默模式（无 spinner） | Hook 调用 |
| `git-ai config` | 配置 AI 服务商 | 初始化/切换模型 |
| `git-ai hook install` | 安装 Git Hook | 集成到 git commit |
| `git-ai hook status` | 查看 Hook 状态 | 检查是否已安装 |
| `git-ai hook remove` | 移除 Hook | 禁用自动生成 |

---

## ✨ 特性

| 特性 | 描述 |
|------|------|
| 🤖 **多模型支持** | DeepSeek、通义千问、智谱GLM、Moonshot、OpenAI 等 10+ 模型 |
| 🏠 **本地部署** | 支持 Ollama、LM Studio，数据不出本机 |
| 🔍 **智能 Diff** | 自动过滤 lock 文件，Token 优化截断 |
| 🪝 **Git Hook** | 无缝集成到 git commit 流程 |
| ⚡ **一键提交** | `-y` 参数跳过确认，CI/CD 友好 |
| 🎯 **多条候选** | `-n 3` 生成多条消息供选择 |
| 📝 **规范化** | 遵循 Conventional Commits 标准 |
| 🔄 **自动重试** | 30 秒超时 + 2 次自动重试 |

---

## 🤖 支持的模型

### 国内大模型（推荐）

| 服务商 | 默认模型 | 获取 API Key |
|--------|----------|--------------|
| **DeepSeek** | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| **Qwen** (通义千问) | `qwen-turbo` | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/) |
| **Zhipu** (智谱 GLM) | `glm-4-flash` | [open.bigmodel.cn](https://open.bigmodel.cn/) |
| **Moonshot** (月之暗面) | `moonshot-v1-8k` | [platform.moonshot.cn](https://platform.moonshot.cn/) |
| **Baichuan** (百川) | `Baichuan4` | [platform.baichuan-ai.com](https://platform.baichuan-ai.com/) |
| **Yi** (零一万物) | `yi-lightning` | [platform.lingyiwanwu.com](https://platform.lingyiwanwu.com/) |
| **SiliconFlow** | `Qwen2.5-7B` | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/) |

### 国际大模型

| 服务商 | 默认模型 | 获取 API Key |
|--------|----------|--------------|
| **OpenAI** | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com/) |

### 本地部署（无需 API Key）

| 服务商 | 默认模型 | 说明 |
|--------|----------|------|
| **Ollama** | `qwen2.5:7b` | [ollama.ai](https://ollama.ai/) |
| **LM Studio** | `local-model` | [lmstudio.ai](https://lmstudio.ai/) |

---

## ⚙️ 配置

```bash
git-ai config
```

交互式配置：
1. 选择 AI 服务商
2. 输入 API Key（本地模型跳过）
3. 选择模型
4. 选择输出语言（中文/英文）
5. 可选：自定义 System Prompt

**配置文件位置：**

| 系统 | 路径 |
|------|------|
| macOS | `~/Library/Preferences/git-ai-cli-nodejs/config.json` |
| Linux | `~/.config/git-ai-cli-nodejs/config.json` |
| Windows | `%APPDATA%/git-ai-cli-nodejs/Config/config.json` |

---

## 🪝 Git Hook 详解

### 工作原理

```
git commit (无 -m)
    ↓
prepare-commit-msg hook 触发
    ↓
git-ai msg --quiet 生成消息
    ↓
写入 COMMIT_MSG 文件
    ↓
打开编辑器确认
```

### Hook 特性

| 特性 | 说明 |
|------|------|
| **链式执行** | 已有 hook 会被保留并在 git-ai 之后执行 |
| **递归保护** | `GIT_AI_RUNNING` 环境变量防止无限循环 |
| **智能跳过** | 使用 `-m`、merge、amend 时自动跳过 |
| **手动禁用** | `GIT_AI_DISABLED=1 git commit` |

> ⚠️ **注意**: `git commit --no-verify` 不会跳过 prepare-commit-msg hook

### 脚本集成

```bash
# 获取消息用于脚本
MSG=$(git-ai msg --quiet)
git commit -m "$MSG"

# JSON 格式（含元数据）
git-ai msg --json | jq '.message'

# 多条消息（用 ---END--- 分隔）
git-ai msg -n 3 --quiet
```

---

## 🔧 自动忽略的文件

以下文件会自动从 Diff 分析中排除，节省 Token：

- **Lock 文件**: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`
- **压缩文件**: `*.min.js`, `*.min.css`, `*.map`
- **构建产物**: `dist/`, `build/`, `.next/`

---

## English

### Installation

```bash
npm install -g @dongowu/git-ai-cli
```

### Quick Start

```bash
git-ai config    # Configure AI provider
git add .
git-ai           # Generate and commit
```

### Two Ways to Use

**Manual Mode:**
```bash
git add .
git-ai           # Interactive: generate → choose action → commit
git-ai -y        # Auto commit (skip confirmation)
git-ai -n 3      # Generate 3 options to choose from
```

**Git Hook Mode:**
```bash
git-ai hook install    # One-time setup

# Then just use git normally
git add .
git commit             # Auto-generates message, opens editor
```

### Command Reference

| Command | Description |
|---------|-------------|
| `git-ai` | Interactive commit |
| `git-ai -y` | Skip confirmation |
| `git-ai -n 3` | Generate 3 options |
| `git-ai msg` | Output message only (stdout) |
| `git-ai msg --json` | JSON output with metadata |
| `git-ai msg --quiet` | Silent mode (no spinner) |
| `git-ai config` | Configure AI provider |
| `git-ai hook install` | Install Git hook |
| `git-ai hook remove` | Remove Git hook |

### Skip Hook

```bash
git commit -m "message"           # Auto-skipped when message provided
GIT_AI_DISABLED=1 git commit      # Temporarily disable
git-ai hook remove                # Permanently remove
```

> ⚠️ Note: `--no-verify` does NOT skip prepare-commit-msg hooks

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
