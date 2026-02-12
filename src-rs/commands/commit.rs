use crate::error::Result;
use crate::utils::agent_lite::AgentLite;
use crate::utils::ai::{AIClient, PromptTemplates};
use crate::utils::{ConfigManager, CopilotCLI, GitManager};
use dialoguer::{MultiSelect, Select};
use indicatif::ProgressBar;
use std::collections::HashSet;

pub async fn run(
    yes: bool,
    num: usize,
    locale_override: Option<String>,
    agent: bool,
    copilot: bool,
) -> Result<()> {
    // Get staged files (offer interactive staging if empty)
    let mut staged_files = GitManager::get_staged_files()?;
    if staged_files.is_empty() {
        let unstaged_files = GitManager::get_unstaged_files()?;
        if unstaged_files.is_empty() {
            eprintln!("No changes found. Stage files with 'git add' first.");
            return Err(crate::error::GitAiError::NoStagedChanges);
        }

        println!("⚠️  No staged changes found.");
        let labels: Vec<String> = unstaged_files.iter().map(|f| f.label.clone()).collect();
        let selections = MultiSelect::new()
            .with_prompt("Select files to stage")
            .items(&labels)
            .interact()
            .map_err(|e| crate::error::GitAiError::Other(format!("Selection failed: {}", e)))?;

        if selections.is_empty() {
            println!("No files selected. Exiting.");
            return Err(crate::error::GitAiError::UserCancelled);
        }

        let mut all_paths: Vec<String> = Vec::new();
        for idx in selections {
            all_paths.extend(unstaged_files[idx].paths.clone());
        }

        let mut seen: HashSet<String> = HashSet::new();
        let mut unique_paths: Vec<String> = Vec::new();
        for path in all_paths {
            if seen.insert(path.clone()) {
                unique_paths.push(path);
            }
        }

        GitManager::add_files(&unique_paths)?;
        staged_files = GitManager::get_staged_files()?;
        println!("✅ Staged {} file(s).", unique_paths.len());

        if staged_files.is_empty() {
            return Err(crate::error::GitAiError::NoStagedChanges);
        }
    }

    // Show staged files with line stats as a table
    let file_stats = GitManager::get_file_stats().unwrap_or_default();
    let stats_map: std::collections::HashMap<&str, (u32, u32)> = file_stats
        .iter()
        .map(|(f, ins, del)| (f.as_str(), (*ins, *del)))
        .collect();

    let mut total_insertions: u32 = 0;
    let mut total_deletions: u32 = 0;

    // Calculate column width based on longest filename
    let file_col_width = staged_files
        .iter()
        .map(|f| f.len())
        .max()
        .unwrap_or(4)
        .max(4) // min width = "File".len()
        + 2; // padding

    let ins_col = 10usize; // "Insertions" header
    let del_col = 10usize; // "Deletions" header

    println!("\n📝 Staged changes:\n");
    // Top border
    println!(
        "  ┌{:─<file_w$}┬{:─<ins_w$}┬{:─<del_w$}┐",
        "",
        "",
        "",
        file_w = file_col_width,
        ins_w = ins_col,
        del_w = del_col
    );
    // Header
    println!(
        "  │{:<file_w$}│{:^ins_w$}│{:^del_w$}│",
        " File",
        "Inserted",
        "Deleted",
        file_w = file_col_width,
        ins_w = ins_col,
        del_w = del_col
    );
    // Header separator
    println!(
        "  ├{:─<file_w$}┼{:─<ins_w$}┼{:─<del_w$}┤",
        "",
        "",
        "",
        file_w = file_col_width,
        ins_w = ins_col,
        del_w = del_col
    );
    // File rows
    for file in &staged_files {
        let (ins, del) = stats_map.get(file.as_str()).copied().unwrap_or((0, 0));
        total_insertions += ins;
        total_deletions += del;
        println!(
            "  │ {:<file_w$}│\x1b[32m{:^ins_w$}\x1b[0m│\x1b[31m{:^del_w$}\x1b[0m│",
            file,
            format!("+{}", ins),
            format!("-{}", del),
            file_w = file_col_width - 1,
            ins_w = ins_col,
            del_w = del_col
        );
    }
    // Total separator
    println!(
        "  ├{:─<file_w$}┼{:─<ins_w$}┼{:─<del_w$}┤",
        "",
        "",
        "",
        file_w = file_col_width,
        ins_w = ins_col,
        del_w = del_col
    );
    // Total row
    println!(
        "  │ {:<file_w$}│\x1b[32m{:^ins_w$}\x1b[0m│\x1b[31m{:^del_w$}\x1b[0m│",
        format!("Total ({} files)", staged_files.len()),
        format!("+{}", total_insertions),
        format!("-{}", total_deletions),
        file_w = file_col_width - 1,
        ins_w = ins_col,
        del_w = del_col
    );
    // Bottom border
    println!(
        "  └{:─<file_w$}┴{:─<ins_w$}┴{:─<del_w$}┘",
        "",
        "",
        "",
        file_w = file_col_width,
        ins_w = ins_col,
        del_w = del_col
    );

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

    let (truncated_diff, _truncated) = if diff.len() > max_diff_chars {
        // Find a valid UTF-8 char boundary to avoid panicking on multi-byte chars
        let mut end = max_diff_chars;
        while !diff.is_char_boundary(end) {
            end -= 1;
        }
        (diff[..end].to_string(), true)
    } else {
        (diff, false)
    };

    // Get branch name and recent commits
    let branch_name = GitManager::get_current_branch().ok();
    let recent_commits = GitManager::get_recent_commits(10).ok();

    // Create AI client
    let ai_client = AIClient::new(config.clone())?;

    // Generate system and user prompts
    let system_prompt = PromptTemplates::get_system_prompt(
        &locale,
        &config.provider,
        config.custom_prompt.as_deref(),
    );

    let mut user_prompt = PromptTemplates::get_user_prompt(
        &truncated_diff,
        branch_name.as_deref(),
        recent_commits.as_deref(),
    );

    if agent {
        match AgentLite::run_analysis(&truncated_diff, branch_name.as_deref()).await {
            Ok(context) => {
                if !context.trim().is_empty() {
                    user_prompt.push_str("\n\n");
                    user_prompt.push_str(&context);
                }
            }
            Err(err) => {
                eprintln!("⚠️  Agent-lite failed, falling back to basic mode: {}", err);
            }
        }
    }

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
        vec![
            ai_client
                .generate_commit_message(&system_prompt, &user_prompt)
                .await?,
        ]
    };

    pb.finish_and_clear();

    // Stage 2: GitHub Copilot CLI Deep Analysis (if enabled)
    if copilot && CopilotCLI::is_available() {
        println!("\n🔍 Analyzing code impact with GitHub Copilot CLI...\n");

        match CopilotCLI::analyze_code_impact(&truncated_diff, &staged_files).await {
            Ok(analysis) => {
                // Display impact summary
                println!("📊 Impact Analysis:");
                println!("   {}\n", analysis.impact_summary);

                // Display potential issues
                if !analysis.potential_issues.is_empty() {
                    println!("⚠️  Potential Risks:");
                    for issue in &analysis.potential_issues {
                        println!("   • {}", issue);
                    }
                    println!();
                }

                // Display affected areas
                if !analysis.affected_areas.is_empty() {
                    println!("🔗 Affected Areas:");
                    for area in &analysis.affected_areas {
                        println!("   • {}", area);
                    }
                    println!();
                }

                // Display test recommendations
                if !analysis.test_recommendations.is_empty() {
                    println!("✅ Test Recommendations:");
                    for test in &analysis.test_recommendations {
                        println!("   • {}", test);
                    }
                    println!();
                }

                // Ask user if they want to continue
                if !analysis.potential_issues.is_empty() {
                    println!("⚠️  Warning: Potential issues detected. Review carefully before committing.\n");
                }
            }
            Err(e) => {
                eprintln!("⚠️  Copilot analysis failed: {}", e);
                eprintln!("    Continuing with commit...\n");
            }
        }
    } else if copilot {
        eprintln!("⚠️  GitHub Copilot CLI not available.");
        eprintln!("    Install with: gh auth login");
        eprintln!("    Continuing without analysis...\n");
    }

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
                    vec![
                        ai_client
                            .generate_commit_message(&system_prompt, &user_prompt)
                            .await?,
                    ]
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
    let mut file = std::fs::File::create(&temp_file).map_err(|e| {
        crate::error::GitAiError::Other(format!("Failed to create temp file: {}", e))
    })?;
    file.write_all(original.as_bytes()).map_err(|e| {
        crate::error::GitAiError::Other(format!("Failed to write temp file: {}", e))
    })?;
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
        return Err(crate::error::GitAiError::Other(
            "Editor exited with error".to_string(),
        ));
    }

    // Read edited message
    let edited = std::fs::read_to_string(&temp_file).map_err(|e| {
        crate::error::GitAiError::Other(format!("Failed to read edited file: {}", e))
    })?;

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_file);

    Ok(edited)
}
