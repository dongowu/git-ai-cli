<p align="center">
  <h1 align="center">git-ai-cli</h1>
  <p align="center">
    <strong>🤖 AI-Powered Git Assistant: Commit, Context & Report</strong>
  </p>
  <p align="center">
    🚀 <strong>DeepSeek</strong> Optimized | 🏠 <strong>Ollama</strong> Privacy First | 🧠 <strong>Context Aware</strong> | 🛡️ <strong>Copilot Guardian</strong> | 📊 <strong>AI Reports</strong>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dongowu/git-ai-cli"><img src="https://img.shields.io/npm/v/@dongowu/git-ai-cli.svg?style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@dongowu/git-ai-cli"><img src="https://img.shields.io/npm/dm/@dongowu/git-ai-cli.svg?style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/dongowu/git-ai-cli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@dongowu/git-ai-cli.svg?style=flat-square" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@dongowu/git-ai-cli.svg?style=flat-square" alt="node version"></a>
</p>

<p align="center">
  <a href="./README.md">中文文档</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-configuration">Configuration</a>
</p>

---

**git-ai-cli** is more than just a commit message generator. It's your **AI Development Assistant**. It understands your code diffs, recognizes your branch intent, and even writes your weekly reports.

---

## 🦀 Rust Edition (Default Release)

Starting from **v2.x**, `git-ai-cli` ships the **Rust edition** by default (faster, single-binary). Install via npm (it will download the correct platform binary automatically):

```bash
npm install -g @dongowu/git-ai-cli
```

> The Rust edition currently includes **agent-lite** (impact analysis / symbol search). Advanced security/perf analysis is still being ported.

> If you need the legacy TypeScript (v1.x), pin the version explicitly.

## 🚀 Quick Start

```bash
# 1. Install
npm install -g @dongowu/git-ai-cli

# 2. Initialize (Auto-detects local models or configures API)
git-ai config

# 3. Use
git add .
git-ai
```

---

## ✨ Features

### 1. 🔒 Privacy First & Local Models
- **Ollama Zero-Config**: Automatically detects locally running Ollama models (like `llama3`, `deepseek-coder`). No manual setup required. Your data never leaves your machine.
- **DeepSeek/OpenAI**: Built-in support for popular API providers with optimized prompts.

### 2. 🧠 Context Aware
- **Style Learning**: Automatically analyzes your recent 10 commits to mimic your personal tone, format (e.g., emojis), and language style.
- **Branch Awareness**: Reads your current branch name (e.g., `feat/user-login`, `fix/JIRA-123`) to generate semantic commits with Issue IDs or scopes.

### 3. 🤖 Agent Intelligence
Evolving from a text generator to a code expert.
- **Smart Diff**: The Agent analyzes file stats and reads only the critical diffs to reduce truncation and token usage on large refactors.
- **Impact Analysis**: Changing a core API? The Agent proactively searches your codebase (`git grep`) to find usages and warns you about potential breaking changes in the commit body.
- **Git Flow Guard**: Automatically enables deep analysis on `release/*` or `hotfix/*` branches to protect production code.

### 4. 🛡️ GitHub Copilot CLI Guardian (New)
Dual-layer AI architecture: Professional commit generation + Deep code analysis.
- **Code Impact Analysis**: Uses GitHub Copilot CLI to deeply analyze the scope and potential risks of code changes
- **Risk Detection**: Automatically identifies breaking changes, potential bugs, and security vulnerabilities
- **Test Recommendations**: Intelligently suggests test scenarios and use cases
- **Affected Areas**: Analyzes which modules and files might be impacted
- **Optional Enable**: Enable on-demand via `--copilot` flag, no forced dependency

### 5. ⚙️ Engineering Ready
- **Project Config**: Create a `.git-ai.json` in your project root to share settings (model, prompts) with your team.
- **Smart Ignore**: Use `.git-aiignore` to exclude auto-generated files (like `package-lock.json`) or large files to save tokens and improve accuracy.

### 6. 🪝 Seamless Integration (Git Hook)
- **Zero Distraction**: After installing the hook, just run `git commit` (without `-m`). AI automatically fills in the message and opens your editor.
- **Compatibility**: Perfectly compatible with existing Git workflows. Supports `git commit --no-verify`.

### 7. 📊 AI Reports
- **One-Click Generation**: `git-ai report` analyzes your recent commits.
- **Value Driven**: Transforms fragmented commits into structured reports highlighting "Core Outputs", "Bug Fixes", and "Technical Improvements".

---

## ⚙️ Configuration

### Project-Level Config `.git-ai.json`
Create this file in your project root to override global settings:

```json
{
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-reasoner",
  "agentModel": "deepseek-chat",
  "locale": "en",
  "enableFooter": true
}
```

Notes:
- `model`: base generation model
- `agentModel`: Agent mode (`-a`) model (pick a tool-capable model; DeepSeek typically uses `deepseek-chat`)
- `locale`: only `zh` / `en`
- It's recommended to set `apiKey` via env vars or global config (don't commit keys into the repo)

### CLI Config (scriptable)

```bash
# Show effective config (includes env overrides)
git-ai config get --json

# Set global config
git-ai config set model deepseek-chat

# Set per-project config (write to .git-ai.json)
git-ai config set agentModel deepseek-chat --local

# List keys + env overrides
git-ai config describe
```

### Environment Variables (CI/Scripts)

Common env overrides (higher priority than config files):
- `GIT_AI_PROVIDER` / `GIT_AI_BASE_URL` / `GIT_AI_MODEL` / `GIT_AI_AGENT_MODEL`
- `GIT_AI_API_KEY` (also supports `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`)
- `GIT_AI_TIMEOUT_MS` (request timeout, default 120000)
- `GIT_AI_MAX_DIFF_CHARS` (diff truncation length)
- `GIT_AI_MAX_OUTPUT_TOKENS` (output token limit)
- `GIT_AI_DEBUG=1` (print more error details)

OpenCommit-compatible env vars:
- `OCO_AI_PROVIDER` / `OCO_MODEL` / `OCO_API_KEY`
- `OCO_TOKENS_MAX_INPUT` / `OCO_TOKENS_MAX_OUTPUT`

### Ignore File `.git-aiignore`
Exclude specific files from AI analysis (syntax similar to `.gitignore`):

```text
package-lock.json
dist/
*.min.js
```

Also compatible with OpenCommit's `.opencommitignore` (both will be read).

### Troubleshooting

**1) 401 / Invalid API key**
- Check effective config: `git-ai config get --json --local`
- Make sure env vars aren't overriding your key: `GIT_AI_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY / OCO_API_KEY`

**2) Diff truncated**
- Ignore large files via `.git-aiignore` / `.opencommitignore`
- Or set `GIT_AI_MAX_DIFF_CHARS` (also supports `OCO_TOKENS_MAX_INPUT`)

**3) Agent falls back to basic mode**
- Set `GIT_AI_DEBUG=1` to see the real failure reason (timeout/rate limit/auth, etc.)

---

## 📖 Usage

### Scenario 1: Interactive
```bash
git add .
git-ai
```

### Scenario 2: Copilot Guardian Mode 🌟 Recommended

```bash
git add .
git-ai --copilot
# 1. Generate professional commit message with DeepSeek/Ollama
# 2. GitHub Copilot CLI deep code impact analysis
# 3. Display risk warnings and test recommendations
# 4. Confirm and commit
```

**Output Example:**
```
✨ Generated commit message(s):

feat(auth): implement JWT token refresh mechanism

📊 Impact Analysis:
   Modified authentication flow to support automatic token refresh

⚠️  Potential Risks:
   • Breaking change: Old tokens will be invalidated
   • Session management logic needs update

🔗 Affected Areas:
   • Login component
   • API middleware
   • User session store

✅ Test Recommendations:
   • Test token expiration handling
   • Verify refresh token rotation
   • Check concurrent request handling
```

### Scenario 3: Git Hook (Recommended) 🌟
The smoothest experience. Install once, use forever.

```bash
# Install for current project
git-ai hook install

# Or install globally (for all projects)
git-ai hook install --global
```

**Then just run:**
```bash
git checkout -b feature/awesome-login
# ... write code ...
git add .
git commit  # ✨ AI generates "feat(login): implement awesome login logic"
```

### Scenario 4: Generate Reports
Hate writing weekly reports?

```bash
# Generate report for this week
git-ai report

# Generate report for the last 30 days
git-ai report --days 30

# Generate feature-focused release notes from latest tag to current ref
git-ai report --from-last-tag

# Generate release notes for a specific tag range (e.g. v1.0.21 -> v2.0.0)
git-ai report --from-tag v1.0.21 --to-ref v2.0.0
```

---

## 🛠 Command Reference

| Command | Alias | Description |
|---------|-------|-------------|
| `git-ai config` | `config` | **Initialize Config** (Provider, Key, Language) |
| `git-ai config get` | | Show effective config (supports `--json` / `--local`) |
| `git-ai config set <key> <value>` | | Set config (supports `--local` / `--json`) |
| `git-ai config describe` | | List config keys and env overrides |
| `git-ai` | | Interactive generation & commit |
| `git-ai --copilot` | | **Copilot Guardian Mode** (Code impact analysis & Risk detection) |
| `git-ai -a` | | **Agent Mode** (Deep analysis & Impact check) |
| `git-ai -a --copilot` | | **Ultimate Mode** (Agent + Copilot dual protection) |
| `git-ai -y` | | Skip confirmation and commit directly |
| `git-ai -n 3` | | Generate 3 options to choose from |
| `git-ai -l en` | | Force language (en/zh) |
| `git-ai hook install` | | **Install Git Hook** (supports `--global`) |
| `git-ai report` | | **Generate AI Report / Release Notes** (supports `--days` / `--from-last-tag` / `--from-tag --to-ref`) |
| `git-ai msg` | | Generate message only (stdout for scripts) |

---

## 📄 License

[Apache 2.0](LICENSE)

---

<p align="center">
  Made with ❤️ by git-ai team
  <br>
  <sub>🤖 Generated by git-ai 🚀</sub>
</p>
