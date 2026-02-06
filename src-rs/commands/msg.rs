use crate::error::Result;
use crate::utils::{ConfigManager, GitManager};
use crate::utils::ai::{AIClient, PromptTemplates};
use crate::types::CommitMessageOutput;

pub async fn run(
    num: usize,
    json_output: bool,
    quiet: bool,
    locale_override: Option<String>,
) -> Result<()> {
    // Get staged files
    let staged_files = GitManager::get_staged_files()?;
    if staged_files.is_empty() {
        return Err(crate::error::GitAiError::NoStagedChanges);
    }

    // Get config
    let config = ConfigManager::get_merged_config()?;

    // Determine locale
    let locale = locale_override.unwrap_or(config.locale.clone());

    // Get diff
    let diff = GitManager::get_staged_diff()?;
    if diff.is_empty() {
        return Err(crate::error::GitAiError::NoStagedChanges);
    }

    // Truncate diff if needed
    let max_diff_chars = std::env::var("GIT_AI_MAX_DIFF_CHARS")
        .ok()
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(5000);

    let (truncated_diff, truncated) = if diff.len() > max_diff_chars {
        (diff[..max_diff_chars].to_string(), true)
    } else {
        (diff, false)
    };

    // Get branch name and recent commits
    let branch_name = GitManager::get_current_branch().ok();
    let recent_commits = GitManager::get_recent_commits(5).ok();

    // Create AI client
    let ai_client = AIClient::new(config.clone())?;

    // Generate system and user prompts
    let system_prompt = PromptTemplates::get_system_prompt(
        &locale,
        &config.provider,
        config.custom_prompt.as_deref(),
    );

    let user_prompt = PromptTemplates::get_user_prompt(
        &truncated_diff,
        branch_name.as_deref(),
        recent_commits.as_deref(),
    );

    // Generate messages
    let messages = if num > 1 {
        ai_client
            .generate_multiple_messages(&system_prompt, &user_prompt, num)
            .await?
    } else {
        vec![ai_client
            .generate_commit_message(&system_prompt, &user_prompt)
            .await?]
    };

    // Output results
    if json_output {
        let output = CommitMessageOutput {
            messages,
            staged_files,
            truncated,
            ignored_files: vec![],
        };
        println!("{}", serde_json::to_string_pretty(&output)?);
    } else if !quiet {
        for (i, msg) in messages.iter().enumerate() {
            if i > 0 {
                println!("---END---");
            }
            println!("{}", msg);
        }
    } else {
        for msg in messages {
            println!("{}", msg);
        }
    }

    Ok(())
}
