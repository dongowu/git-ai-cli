# Changelog

All notable changes to this project will be documented in this file.

## [2.0.1] - 2026-02-06

### 🛠 Installation Reliability

- **npmjs Fallback for Platform Binary**: `install.cjs` now auto-installs the missing platform package from `https://registry.npmjs.org/` when mirror registries do not have `@dongowu/git-ai-cli-*` artifacts.
- **Better Error Guidance**: Installation now prints detected registry and an explicit retry command when fallback install fails.

## [2.0.0] - 2026-02-06

### 🦀 Rust Rewrite Upgrade (v1.0.21 -> v2.0.0)

- **Core Runtime Migration**: Rebuilt the CLI from TypeScript/Node.js to Rust for faster startup and lower runtime overhead.
- **Distribution Upgrade**: Introduced a lightweight npm wrapper with platform-specific binaries (Linux/macOS/Windows).
- **Feature Parity**: Preserved existing commit/config/hook/report workflows while modernizing internals.

### ✨ Current Service Capability Enhancements

- **Copilot Guardian Mode**: Added optional deep impact analysis and risk hints via GitHub Copilot CLI.
- **Agent-lite Improvements**: Kept smart diff and impact-oriented commit generation in the Rust release path.
- **Rust CI Alignment**: Updated CI pipeline for Rust toolchain checks (format/lint/test flows).

### 📦 Release Notes Scope

- This release baseline starts from `v2.0.0` (Rust edition default).
- To generate functional descriptions between tags locally, use:
  - `git-ai report --from-last-tag`
  - `git-ai report --from-tag <prev_tag> --to-ref <local_tag_or_ref>`

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
