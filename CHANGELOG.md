# Changelog

All notable changes to this project will be documented in this file.

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
