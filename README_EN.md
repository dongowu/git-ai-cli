<p align="center">
  <h1 align="center">git-ai-cli</h1>
  <p align="center">
    <strong>🤖 AI-Powered Git Assistant: Commit, Context & Report</strong>
  </p>
  <p align="center">
    🚀 <strong>DeepSeek</strong> Optimized | 🏠 <strong>Ollama</strong> Privacy First | 🧠 <strong>Context Aware</strong> | 📊 <strong>AI Reports</strong>
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
  <a href="#-usage-guide-recommended">Usage</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-command-reference">Commands</a>
</p>

---

**git-ai-cli** is more than a commit message generator. It understands diffs, enforces team rules, and generates reports, PR descriptions, and release notes.

---

## 🚀 Quick Start

```bash
# 1) Install
npm install -g @dongowu/git-ai-cli

# 2) Initialize (auto-detect local models or configure API)
git-ai init

# 3) Use
git add .
git-ai
```

---

## ✅ Usage Guide (Recommended)

1) **Install & Init**
```bash
npm install -g @dongowu/git-ai-cli
git-ai init
```

2) **Team config (recommended)**: create `.git-ai.json` in project root
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

3) **Daily commit**
```bash
git add .
git-ai
```

4) **Hook (recommended)**
```bash
git-ai hook install
# Block commit on failure (optional)
GIT_AI_HOOK_STRICT=1 git commit
# Disable fallback message (optional)
GIT_AI_HOOK_FALLBACK=0 git commit
```

5) **Scripts / CI**
```bash
git-ai msg --json
```

6) **Create branch (interactive)**
```bash
git-ai branch
```

7) **PR / Release / Report**
```bash
# PR description
git-ai pr --base main --head HEAD

# Release notes
git-ai release --from v1.0.0 --to HEAD

# Weekly report
git-ai report --days 7
```

---

## ✨ Features

- **DeepSeek/Qwen optimized**: intent-focused prompts
- **Local privacy**: Ollama / LM Studio support
- **Context aware**: branch rules, style learning, smart scope
- **Agent mode**: impact analysis for large diffs
- **Team rules**: presets + strict policy
- **Git hooks**: zero-friction commits
- **AI reports**: weekly report / PR / release notes

---

## ⚙️ Configuration

### Project-level config `.git-ai.json`
- `provider / baseUrl / model / agentModel`
- `locale`: `zh` / `en`
- `outputFormat`: `text` / `json`
- `rulesPreset`: `conventional` / `angular` / `minimal`
- `fallbackModels`: fallback list when the primary model fails
- `policy.strict`: block commit when rules are violated
- `rules`: types/scopes/length/issue rules
- `branch`: branch naming rules (types/pattern/length)

### Rules & Policy
- `issuePattern`: regex for issue IDs
- `issuePlacement`: `scope | subject | footer`
- `requireIssue`: enforce issue id
- `policy.strict`: block commit when invalid
- `branch.pattern`: branch template (e.g., `{type}/{issue?}{name}`)
- `branch.types`: branch type list
- `branch.issueSeparator`: issue separator (default `-`)
- `branch.nameMaxLength`: max length for name

### CLI config
```bash
# Show effective config
git-ai config get --json

# Preset / policy / fallback
git-ai config set rulesPreset conventional
git-ai config set policy '{"strict":true}'
git-ai config set fallbackModels "deepseek-chat,qwen-turbo"

# Rules (JSON or @file)
git-ai config set rules '{"types":["feat","fix"]}'
git-ai config set rules @rules.json --local

# Branch rules
git-ai config set branch '{"types":["feat","fix"],"pattern":"{type}/{issue?}{name}"}'
```

---

## 🛠 Command Reference

| Command | Description |
|--------|-------------|
| `git-ai init` | Initialize config |
| `git-ai config get/set/describe` | Config management |
| `git-ai` / `git-ai commit` | Interactive commit |
| `git-ai -a` | Agent mode |
| `git-ai msg` | Message only (scripts/hooks) |
| `git-ai branch` | Create branch interactively |
| `git-ai hook install/remove` | Hook management |
| `git-ai report` | Weekly report |
| `git-ai pr` | PR description |
| `git-ai release` | Release notes |

---

## ⚡ Environment Variables

- `GIT_AI_PROVIDER` / `GIT_AI_BASE_URL` / `GIT_AI_MODEL` / `GIT_AI_AGENT_MODEL`
- `GIT_AI_API_KEY` (also `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`)
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

## 🧩 Ignore File `.git-aiignore`

```text
package-lock.json
dist/
*.min.js
```

Also compatible with `.opencommitignore`.

---

## ❓Troubleshooting

**1) 401 / Invalid API key**
- `git-ai config get --json --local`
- Check env overrides

**2) Diff truncated**
- Ignore large files via `.git-aiignore`
- Or set `GIT_AI_MAX_DIFF_CHARS`

**3) Agent falls back**
- Set `GIT_AI_DEBUG=1` to see reasons

---

## 🤖 Supported Models

| Type | Provider | Notes | Setup |
|------|----------|------|-------|
| **Local** | **Ollama** | Offline & private | `git-ai init` auto-detect |
| | **LM Studio** | Good compatibility | Manual URL |
| **CN** | **DeepSeek** | High value | API Key |
| | **Qwen** | Long context | API Key |
| | **Zhipu/Moonshot** | Popular in CN | API Key |
| **Global** | **OpenAI** | Baseline GPT-4o | API Key |

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by git-ai team
  <br>
  <sub>🤖 Generated by git-ai 🚀</sub>
</p>
