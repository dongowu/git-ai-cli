use crate::error::Result;
use crate::utils::GitManager;
use crate::utils::ai::AIClient;
use crate::utils::ConfigManager;

pub async fn run(days: usize) -> Result<()> {
    println!("📊 Generating report for the last {} days...\n", days);

    // Get commits from the specified period
    let commits = GitManager::get_commits_by_days(days)?;

    if commits.is_empty() {
        println!("No commits found in the last {} days", days);
        return Ok(());
    }

    println!("Found {} commits\n", commits.len());

    // Get config
    let config = ConfigManager::get_merged_config()?;

    // Create AI client
    let ai_client = AIClient::new(config.clone())?;

    // Generate report using AI
    let system_prompt = get_report_system_prompt(&config.locale);
    let user_prompt = format!(
        "Generate a structured report for the following commits:\n\n{}",
        commits.join("\n")
    );

    println!("🤖 Analyzing commits...\n");

    let report = ai_client
        .generate_commit_message(&system_prompt, &user_prompt)
        .await?;

    println!("{}", report);

    Ok(())
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
