use crate::error::{GitAiError, Result};
use crate::utils::ai::AIClient;
use crate::utils::ConfigManager;
use crate::utils::GitManager;

pub async fn run(
    days: usize,
    from_last_tag: bool,
    from_tag: Option<String>,
    to_ref: Option<String>,
) -> Result<()> {
    if from_last_tag && from_tag.is_some() {
        return Err(GitAiError::InvalidArgument(
            "--from-last-tag cannot be used together with --from-tag".to_string(),
        ));
    }

    if to_ref.is_some() && !from_last_tag && from_tag.is_none() {
        return Err(GitAiError::InvalidArgument(
            "--to-ref requires --from-last-tag or --from-tag".to_string(),
        ));
    }

    let target_ref = to_ref.unwrap_or_else(|| "HEAD".to_string());

    let (commits, scope, range_mode) = if from_last_tag {
        let latest_tag = GitManager::get_latest_tag()?.ok_or_else(|| {
            GitAiError::InvalidArgument(
                "No git tag found. Use --from-tag <tag> or fall back to --days.".to_string(),
            )
        })?;
        let commits = GitManager::get_commits_between_refs(&latest_tag, &target_ref)?;
        (commits, format!("{}..{}", latest_tag, target_ref), true)
    } else if let Some(from_tag) = from_tag {
        let commits = GitManager::get_commits_between_refs(&from_tag, &target_ref)?;
        (commits, format!("{}..{}", from_tag, target_ref), true)
    } else {
        let commits = GitManager::get_commits_by_days(days)?;
        (commits, format!("last {} days", days), false)
    };

    if range_mode {
        println!("📦 Generating release notes for {}...\n", scope);
    } else {
        println!("📊 Generating report for {}...\n", scope);
    }

    if commits.is_empty() {
        println!("No commits found in {}", scope);
        return Ok(());
    }

    println!("Found {} commits\n", commits.len());

    // Get config
    let config = ConfigManager::get_merged_config()?;

    // Create AI client
    let ai_client = AIClient::new(config.clone())?;

    // Generate report using AI
    let system_prompt = if range_mode {
        get_release_notes_system_prompt(&config.locale)
    } else {
        get_report_system_prompt(&config.locale)
    };
    let user_prompt = if range_mode {
        format!(
            "Current service: git-ai-cli (Rust 2.x).\nCommit range: {}\n\nPlease generate release notes focused on functional changes and service impact:\n\n{}",
            scope,
            commits.join("\n")
        )
    } else {
        format!(
            "Generate a structured report for the following commits:\n\n{}",
            commits.join("\n")
        )
    };

    println!("🤖 Analyzing commits...\n");

    let report = ai_client
        .generate_commit_message(&system_prompt, &user_prompt)
        .await?;

    println!("{}", report);

    Ok(())
}

fn get_release_notes_system_prompt(locale: &str) -> String {
    match locale {
        "zh" => {
            r#"你是一个专业的软件版本发布说明生成器。请根据提交记录输出清晰、可直接发布的功能描述。

请按以下结构输出：

## 📦 版本概览
- 变更范围：<from..to>
- 总提交数：X
- 发布定位：一句话说明本次版本目标

## ✨ 功能更新
- 按业务价值总结功能能力，不要逐条抄提交信息

## 🛠 稳定性与工程改进
- 包括修复、CI/CD、性能、构建链路优化

## ⚠️ 升级影响（当前服务）
- 说明可能影响使用方的行为变化
- 给出迁移/回滚建议（如有）

写作要求：
1) 以“对当前服务可感知的能力变化”为核心。
2) 避免泛泛而谈，保持专业、简洁、可读。
3) 不要编造未在提交中出现的事实。"#
                .to_string()
        }
        _ => {
            r#"You are a professional release-notes generator. Based on the commit list, produce concise and publish-ready release notes.

Use this structure:

## 📦 Release Overview
- Range: <from..to>
- Total commits: X
- Release intent: one sentence about the goal of this release

## ✨ Functional Updates
- Summarize user-facing capabilities, not raw commit-by-commit rewrites

## 🛠 Stability and Engineering
- Include fixes, CI/CD updates, performance and build-chain improvements

## ⚠️ Upgrade Impact (Current Service)
- Describe behavior changes that may affect users
- Provide migration/rollback hints when relevant

Requirements:
1) Focus on service-level impact.
2) Keep it factual, concise, and easy to scan.
3) Do not invent facts beyond the commit list."#
                .to_string()
        }
    }
}

fn get_report_system_prompt(locale: &str) -> String {
    match locale {
        "zh" => {
            r#"你是一个专业的 Git 提交报告生成器。根据提供的提交信息生成结构化的周报或日报。

请按以下格式生成报告：

## 📋 报告摘要
- 总提交数：X
- 主要功能：列出主要功能
- 修复的问题：列出修复的问题
- 其他改进：列出其他改进

## ✨ 新功能
- 功能1
- 功能2

## 🐛 Bug 修复
- 修复1
- 修复2

## 🔧 改进和优化
- 改进1
- 改进2

## 📚 文档和其他
- 项目1
- 项目2

请确保报告清晰、专业且易于理解。"#
                .to_string()
        }
        _ => {
            r#"You are a professional Git commit report generator. Generate a structured weekly or daily report based on the provided commits.

Please generate the report in the following format:

## 📋 Report Summary
- Total Commits: X
- Key Features: List main features
- Bug Fixes: List bug fixes
- Other Improvements: List other improvements

## ✨ New Features
- Feature 1
- Feature 2

## 🐛 Bug Fixes
- Fix 1
- Fix 2

## 🔧 Improvements and Optimizations
- Improvement 1
- Improvement 2

## 📚 Documentation and Other
- Item 1
- Item 2

Ensure the report is clear, professional, and easy to understand."#
                .to_string()
        }
    }
}
