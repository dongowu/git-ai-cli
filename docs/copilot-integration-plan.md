# GitHub Copilot CLI 集成方案

## 方案概述

将 GitHub Copilot CLI 作为 git-ai-cli 的"智能增强层"，而不是简单的 AI provider 替代。

## 集成架构

```
┌─────────────────────────────────────────────────────────────┐
│                      git-ai-cli                              │
├─────────────────────────────────────────────────────────────┤
│  Stage 1: 基础生成 (现有功能)                                │
│  ├── DeepSeek/Ollama/OpenAI 生成 commit message             │
│  ├── 风格学习 (分析最近 10 次提交)                           │
│  └── 分支感知 (读取分支名)                                   │
├─────────────────────────────────────────────────────────────┤
│  Stage 2: Copilot CLI 智能增强 (新功能) ⭐                   │
│  ├── 代码影响分析                                            │
│  │   └── gh copilot explain "分析这些代码变更的影响"         │
│  ├── Commit message 质量检查                                 │
│  │   └── gh copilot suggest "优化这个 commit message"       │
│  ├── 相关 Issue/PR 关联                                      │
│  │   └── gh copilot 搜索相关的 GitHub issues               │
│  └── 代码审查建议                                            │
│      └── gh copilot 检查潜在问题                            │
└─────────────────────────────────────────────────────────────┘
```

## 实现步骤

### 1. 添加 Copilot CLI 检测

```rust
// src-rs/utils/copilot.rs
pub struct CopilotCLI;

impl CopilotCLI {
    /// 检查 GitHub Copilot CLI 是否可用
    pub fn is_available() -> bool {
        Command::new("gh")
            .arg("copilot")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// 使用 Copilot CLI 分析代码变更
    pub async fn analyze_changes(diff: &str) -> Result<String> {
        let prompt = format!(
            "分析以下 git diff 的影响和潜在问题：\n\n{}",
            diff
        );

        let output = Command::new("gh")
            .arg("copilot")
            .arg("explain")
            .arg(&prompt)
            .output()
            .await?;

        Ok(String::from_utf8(output.stdout)?)
    }

    /// 使用 Copilot CLI 优化 commit message
    pub async fn enhance_message(message: &str, diff: &str) -> Result<String> {
        let prompt = format!(
            "优化这个 commit message，使其更清晰准确：\n\n{}\n\n基于以下代码变更：\n{}",
            message, diff
        );

        let output = Command::new("gh")
            .arg("copilot")
            .arg("suggest")
            .arg(&prompt)
            .output()
            .await?;

        Ok(String::from_utf8(output.stdout)?)
    }
}
```

### 2. 在 commit 命令中集成

```rust
// src-rs/commands/commit.rs

pub async fn run(
    yes: bool,
    num: usize,
    locale_override: Option<String>,
    agent: bool,
) -> Result<()> {
    // ... 现有代码 ...

    // Stage 1: 使用现有 AI 生成基础 commit message
    let base_messages = ai_client.generate_multiple_messages(
        &system_prompt,
        &user_prompt,
        num,
    ).await?;

    // Stage 2: 如果 Copilot CLI 可用，进行智能增强
    let enhanced_messages = if CopilotCLI::is_available() {
        println!("🤖 使用 GitHub Copilot CLI 进行智能增强...");

        let mut enhanced = Vec::new();
        for msg in base_messages {
            // 分析代码影响
            let analysis = CopilotCLI::analyze_changes(&truncated_diff).await?;

            // 优化 commit message
            let enhanced_msg = CopilotCLI::enhance_message(&msg, &analysis).await?;

            enhanced.push(enhanced_msg);
        }
        enhanced
    } else {
        base_messages
    };

    // ... 继续现有的选择和提交流程 ...
}
```

### 3. 添加 Copilot 增强模式

```rust
// 在 main.rs 中添加新的命令行选项
#[derive(Parser)]
struct Cli {
    // ... 现有选项 ...

    /// 使用 GitHub Copilot CLI 增强
    #[arg(long)]
    copilot: bool,
}
```

## 使用示例

### 基础模式（现有功能）
```bash
git-ai
# 使用 DeepSeek/Ollama 生成 commit message
```

### Copilot 增强模式（新功能）
```bash
git-ai --copilot
# 1. 使用 DeepSeek 生成基础 message
# 2. 使用 GitHub Copilot CLI 分析代码影响
# 3. 使用 GitHub Copilot CLI 优化 message
# 4. 展示增强后的结果
```

### Agent + Copilot 模式（终极模式）
```bash
git-ai --agent --copilot
# 1. Agent 模式深度分析代码
# 2. 生成详细的 commit message
# 3. Copilot CLI 进行质量检查和优化
# 4. 关联相关的 GitHub issues/PRs
```

## 优势

1. **差异化价值**：不是简单替换，而是增强现有功能
2. **展示 Copilot CLI 能力**：充分利用其代码理解和 GitHub 集成能力
3. **符合比赛精神**：展示如何用 Copilot CLI 改进开发流程
4. **用户选择**：用户可以选择是否启用 Copilot 增强
5. **更好的故事**：比赛文章可以写"如何用 Copilot CLI 让 AI commit 更智能"

## 比赛提交亮点

### 文章标题建议
"用 GitHub Copilot CLI 打造智能 Git Commit 助手：从基础生成到智能增强"

### 核心卖点
1. **双层 AI 架构**：本地模型 + Copilot CLI
2. **智能增强**：不只是生成，还有分析和优化
3. **GitHub 生态集成**：自动关联 issues/PRs
4. **开发者友好**：可选启用，不强制依赖

## 下一步

1. 实现 `src-rs/utils/copilot.rs`
2. 修改 `src-rs/commands/commit.rs` 添加增强逻辑
3. 添加命令行选项 `--copilot`
4. 测试完整流程
5. 准备演示视频和文章
