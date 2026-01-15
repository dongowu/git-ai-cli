# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-01-16

### 🚀 Agent & Intelligence (Major Update)

- **🤖 Agent Mode**: Introduced a powerful Agent Loop capable of using tools.
  - **Smart Diff**: No more truncated diffs! If a change is too large, the Agent automatically requests specific file contents to understand the core logic.
  - **Impact Analysis**: The Agent can now search the codebase (`git grep`) to find usages of changed functions/APIs, actively looking for potential breaking changes.
  - **Auto-Activation**: Automatically triggers Agent Mode when diffs are truncated or when working on critical branches (`release/*`, `hotfix/*`, `main`).
- **cli**: Added `-a, --agent` flag to manually force Agent Mode for deep analysis.

### ✨ Features

- **Git Flow Integration**: Enhanced logic to perform stricter checks on production-bound branches.
- **Hook Stability**: Improved Git Hook performance with "Quiet Agent" mode, ensuring no console noise during `git commit`.

### ⚡ Improvements

- **Reliability**: Better handling of large repositories and massive refactors.

---

## [1.0.16] - 2026-01-14

### ✨ Features

- **Style Learning**: Automatically analyzes your recent 10 commits to mimic your personal style (emojis, casing, format).
- **Project Config**: Added support for `.git-ai.json` in project root for team-wide configuration.
- **Smart Ignore**: Added support for `.git-aiignore` to exclude specific files from AI analysis.
- **Batch Optimization**: Optimized `git-ai -n <count>` to use a single API request for multiple choices, reducing token usage.

### ⚡ Improvements

- **Performance**: Reduced API latency for multi-choice generation.
- **Docs**: Updated README with comprehensive guides for new features.

---

## [1.0.15]

- Initial release of stable features.
- Support for DeepSeek, OpenAI, and Ollama.
- Interactive mode and Git Hook integration.
