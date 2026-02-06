use crate::error::Result;
use crate::utils::{ConfigManager, GitManager};
use crate::utils::ai::{AIClient, PromptTemplates};
use dialoguer::Select;
use indicatif::ProgressBar;

pub async fn run(
    yes: bool,
    num: usize,
    locale_override: Option<String>,
    agent: bool,
) -> Result<()> {
    // Get staged files
    let staged_files = GitManager::get_staged_files()?;
    if staged_files.is_empty() {
        eprintln!("No staged changes. Stage files with 'git add' first.");
        return Err(crate::error::GitAiError::NoStagedChanges);
    }

    // Show staged files
    println!("\n📝 Staged files:");
    for file in &staged_files {
        println!("  • {}", file);
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

    // Show progress
    let pb = ProgressBar::new_spinner();
    pb.set_message("🤖 Generating commit message...");
    pb.enable_steady_tick(std::time::Duration::from_millis(100));

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

    pb.finish_and_clear();

    // Interactive loop
    let mut current_messages = messages;
    loop {
        // Show messages
        println!("\n✨ Generated commit message(s):\n");
        for (i, msg) in current_messages.iter().enumerate() {
            if i > 0 {
                println!("---");
            }
            println!("{}", msg);
        }

        if yes {
            // Auto-commit mode
            let message = current_messages[0].clone();
            GitManager::commit(&message)?;
            println!("\n✅ Commit created successfully!");
            return Ok(());
        }

        // Show options
        println!("\n📋 Options:");
        let options = vec!["Commit", "Edit", "Regenerate", "Cancel"];
        let selection = Select::new()
            .items(&options)
            .default(0)
            .interact()
            .map_err(|e| crate::error::GitAiError::Other(format!("Selection failed: {}", e)))?;

        match selection {
            0 => {
                // Commit
                let message = current_messages[0].clone();
                GitManager::commit(&message)?;
                println!("\n✅ Commit created successfully!");
                return Ok(());
            }
            1 => {
                // Edit
                println!("\n✏️  Opening editor to edit commit message...");
                let edited_message = edit_message(&current_messages[0])?;
                if !edited_message.trim().is_empty() {
                    GitManager::commit(&edited_message)?;
                    println!("\n✅ Commit created successfully!");
                    return Ok(());
                } else {
                    println!("\n❌ Empty commit message, cancelled");
                    return Err(crate::error::GitAiError::UserCancelled);
                }
            }
            2 => {
                // Regenerate
                let pb = ProgressBar::new_spinner();
                pb.set_message("🤖 Regenerating commit message...");
                pb.enable_steady_tick(std::time::Duration::from_millis(100));

                current_messages = if num > 1 {
                    ai_client
                        .generate_multiple_messages(&system_prompt, &user_prompt, num)
                        .await?
                } else {
                    vec![ai_client
                        .generate_commit_message(&system_prompt, &user_prompt)
                        .await?]
                };

                pb.finish_and_clear();
                // Continue loop with new messages
            }
            3 => {
                // Cancel
                println!("\n❌ Commit cancelled");
                return Err(crate::error::GitAiError::UserCancelled);
            }
            _ => {}
        }
    }
}

fn edit_message(original: &str) -> Result<String> {
    use std::io::Write;

    // Create a temporary file
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join("git-ai-commit-msg.txt");

    // Write original message to temp file
    let mut file = std::fs::File::create(&temp_file)
        .map_err(|e| crate::error::GitAiError::Other(format!("Failed to create temp file: {}", e)))?;
    file.write_all(original.as_bytes())
        .map_err(|e| crate::error::GitAiError::Other(format!("Failed to write temp file: {}", e)))?;
    drop(file);

    // Get editor from environment or use default
    let editor = std::env::var("EDITOR")
        .or_else(|_| std::env::var("VISUAL"))
        .unwrap_or_else(|_| {
            if cfg!(windows) {
                "notepad".to_string()
            } else {
                "vi".to_string()
            }
        });

    // Open editor
    let status = std::process::Command::new(&editor)
        .arg(&temp_file)
        .status()
        .map_err(|e| crate::error::GitAiError::Other(format!("Failed to open editor: {}", e)))?;

    if !status.success() {
        return Err(crate::error::GitAiError::Other("Editor exited with error".to_string()));
    }

    // Read edited message
    let edited = std::fs::read_to_string(&temp_file)
        .map_err(|e| crate::error::GitAiError::Other(format!("Failed to read edited file: {}", e)))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_file);

    Ok(edited)
}
