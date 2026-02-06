use crate::error::{GitAiError, Result};
use std::process::Command;

pub struct GitManager;

impl GitManager {
    /// Check if git is installed
    pub fn is_git_installed() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    /// Check if we're in a git repository
    pub fn is_in_git_repo() -> Result<bool> {
        let output = Command::new("git")
            .arg("rev-parse")
            .arg("--git-dir")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to check git repo: {}", e)))?;

        Ok(output.status.success())
    }

    /// Get staged diff
    pub fn get_staged_diff() -> Result<String> {
        let output = Command::new("git")
            .arg("diff")
            .arg("--cached")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get staged diff: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get staged diff".to_string()));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Get list of staged files
    pub fn get_staged_files() -> Result<Vec<String>> {
        let output = Command::new("git")
            .arg("diff")
            .arg("--cached")
            .arg("--name-only")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get staged files: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get staged files".to_string()));
        }

        let files = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|s| s.to_string())
            .collect();

        Ok(files)
    }

    /// Get list of unstaged files
    pub fn get_unstaged_files() -> Result<Vec<String>> {
        let output = Command::new("git")
            .arg("diff")
            .arg("--name-only")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get unstaged files: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get unstaged files".to_string()));
        }

        let files = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|s| s.to_string())
            .collect();

        Ok(files)
    }

    /// Get current branch name
    pub fn get_current_branch() -> Result<String> {
        let output = Command::new("git")
            .arg("rev-parse")
            .arg("--abbrev-ref")
            .arg("HEAD")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get branch name: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get branch name".to_string()));
        }

        Ok(String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string())
    }

    /// Get recent commits
    pub fn get_recent_commits(count: usize) -> Result<Vec<String>> {
        let output = Command::new("git")
            .arg("log")
            .arg(format!("-{}", count))
            .arg("--format=%h %cd %s")
            .arg("--date=short")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get recent commits: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get recent commits".to_string()));
        }

        let commits = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|s| s.to_string())
            .collect();

        Ok(commits)
    }

    /// Get commits from last N days
    pub fn get_commits_by_days(days: usize) -> Result<Vec<String>> {
        let output = Command::new("git")
            .arg("log")
            .arg(format!("--since={}d", days))
            .arg("--format=%h %cd %s")
            .arg("--date=short")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get commits: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get commits".to_string()));
        }

        let commits = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|s| s.to_string())
            .collect();

        Ok(commits)
    }

    /// Stage files
    pub fn add_files(files: &[String]) -> Result<()> {
        let mut cmd = Command::new("git");
        cmd.arg("add");

        for file in files {
            cmd.arg(file);
        }

        let output = cmd
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to stage files: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to stage files".to_string()));
        }

        Ok(())
    }

    /// Create a commit
    pub fn commit(message: &str) -> Result<()> {
        let output = Command::new("git")
            .arg("commit")
            .arg("-m")
            .arg(message)
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to create commit: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitAiError::Git(format!("Failed to create commit: {}", stderr)));
        }

        Ok(())
    }

    /// Search code using git grep
    pub fn search_code(pattern: &str) -> Result<Vec<String>> {
        let output = Command::new("git")
            .arg("grep")
            .arg("-n")
            .arg(pattern)
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to search code: {}", e)))?;

        // git grep returns non-zero if no matches found, which is not an error
        let results = String::from_utf8_lossy(&output.stdout)
            .lines()
            .take(50) // Limit to 50 results
            .map(|s| s.to_string())
            .collect();

        Ok(results)
    }

    /// Get file diff
    pub fn get_file_diff(file: &str) -> Result<String> {
        let output = Command::new("git")
            .arg("diff")
            .arg("--cached")
            .arg(file)
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get file diff: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get file diff".to_string()));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Get file statistics (insertions/deletions)
    pub fn get_file_stats() -> Result<Vec<(String, u32, u32)>> {
        let output = Command::new("git")
            .arg("diff")
            .arg("--cached")
            .arg("--numstat")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get file stats: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get file stats".to_string()));
        }

        let stats = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let insertions = parts[0].parse::<u32>().unwrap_or(0);
                    let deletions = parts[1].parse::<u32>().unwrap_or(0);
                    let file = parts[2].to_string();
                    Some((file, insertions, deletions))
                } else {
                    None
                }
            })
            .collect();

        Ok(stats)
    }
}
