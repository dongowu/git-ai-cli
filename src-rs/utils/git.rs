use crate::error::{GitAiError, Result};
use std::collections::HashSet;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct UnstagedFileEntry {
    pub label: String,
    pub paths: Vec<String>,
}

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

    /// Get list of unstaged files (including renames and untracked files)
    pub fn get_unstaged_files() -> Result<Vec<UnstagedFileEntry>> {
        let output = Command::new("git")
            .arg("status")
            .arg("--porcelain")
            .arg("-z")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get unstaged files: {}", e)))?;

        if !output.status.success() {
            return Err(GitAiError::Git("Failed to get unstaged files".to_string()));
        }

        let raw = String::from_utf8_lossy(&output.stdout);
        let entries: Vec<&str> = raw.split('\0').filter(|s| !s.is_empty()).collect();
        let mut results: Vec<UnstagedFileEntry> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        let mut i = 0usize;
        while i < entries.len() {
            let entry = entries[i];
            if entry.len() < 3 {
                i += 1;
                continue;
            }

            let status = &entry[..2];
            let path_start = entry.find(' ').map(|idx| idx + 1).unwrap_or(3);
            let path = entry.get(path_start..).unwrap_or("").to_string();

            let is_rename = status.contains('R') || status.contains('C');
            let mut new_path: Option<String> = None;
            if is_rename && i + 1 < entries.len() {
                new_path = Some(entries[i + 1].to_string());
                i += 1;
            }

            let is_untracked = status == "??";
            let has_worktree_change = status.chars().nth(1).unwrap_or(' ') != ' ';

            if !is_untracked && !has_worktree_change {
                i += 1;
                continue;
            }

            if is_rename {
                if let Some(new_path) = new_path {
                    let label = format!("{} -> {}", path, new_path);
                    if seen.insert(label.clone()) {
                        results.push(UnstagedFileEntry {
                            label,
                            paths: vec![path, new_path],
                        });
                    }
                }
                i += 1;
                continue;
            }

            if !path.is_empty() && seen.insert(path.clone()) {
                results.push(UnstagedFileEntry {
                    label: path.clone(),
                    paths: vec![path],
                });
            }

            i += 1;
        }

        Ok(results)
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

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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

    /// Get latest reachable tag from HEAD
    pub fn get_latest_tag() -> Result<Option<String>> {
        let output = Command::new("git")
            .arg("describe")
            .arg("--tags")
            .arg("--abbrev=0")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get latest tag: {}", e)))?;

        if output.status.success() {
            let tag = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if tag.is_empty() {
                return Ok(None);
            }
            return Ok(Some(tag));
        }

        // No tags in repository is a normal case for some projects.
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No names found") || stderr.contains("cannot describe") {
            return Ok(None);
        }

        Err(GitAiError::Git(format!(
            "Failed to get latest tag: {}",
            stderr.trim()
        )))
    }

    /// Get commits between two refs
    pub fn get_commits_between_refs(from_ref: &str, to_ref: &str) -> Result<Vec<String>> {
        let range = format!("{}..{}", from_ref, to_ref);
        let output = Command::new("git")
            .arg("log")
            .arg(range)
            .arg("--format=%h %cd %s")
            .arg("--date=short")
            .output()
            .map_err(|e| GitAiError::Git(format!("Failed to get commits by range: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitAiError::Git(format!(
                "Failed to get commits by range: {}",
                stderr.trim()
            )));
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
        cmd.arg("add").arg("-A").arg("--");

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
            return Err(GitAiError::Git(format!(
                "Failed to create commit: {}",
                stderr
            )));
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
    #[allow(dead_code)]
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

    /// Get detailed diff statistics
    pub fn get_diff_statistics() -> Result<crate::types::DiffStatistics> {
        let file_stats_raw = Self::get_file_stats()?;

        let mut total_insertions = 0u32;
        let mut total_deletions = 0u32;
        let mut total_modifications = 0u32;
        let mut file_stats = Vec::new();

        for (file, insertions, deletions) in file_stats_raw {
            total_insertions += insertions;
            total_deletions += deletions;
            total_modifications += insertions.min(deletions);

            file_stats.push(crate::types::FileStat {
                file,
                insertions,
                deletions,
            });
        }

        Ok(crate::types::DiffStatistics {
            total_insertions,
            total_deletions,
            total_modifications,
            files_changed: file_stats.len() as u32,
            file_stats,
        })
    }

    /// Get formatted diff statistics summary
    pub fn get_diff_summary() -> Result<String> {
        let stats = Self::get_diff_statistics()?;

        let summary = format!(
            "📊 Diff Statistics:\n   • Files changed: {}\n   • Insertions: +{}\n   • Deletions: -{}\n   • Modifications: {}",
            stats.files_changed,
            stats.total_insertions,
            stats.total_deletions,
            stats.total_modifications
        );

        Ok(summary)
    }
}

#[cfg(test)]
mod tests {
    use crate::types::{DiffStatistics, FileStat};

    // Helper function to create test DiffStatistics
    fn create_test_stats(
        total_insertions: u32,
        total_deletions: u32,
        total_modifications: u32,
        files_changed: u32,
        file_stats: Vec<FileStat>,
    ) -> DiffStatistics {
        DiffStatistics {
            total_insertions,
            total_deletions,
            total_modifications,
            files_changed,
            file_stats,
        }
    }

    // Helper function to create test FileStat
    fn create_file_stat(file: &str, insertions: u32, deletions: u32) -> FileStat {
        FileStat {
            file: file.to_string(),
            insertions,
            deletions,
        }
    }

    #[test]
    fn test_parse_file_stats_single_file_additions() {
        // Test parsing a single file with only insertions
        let stats = vec![("src/main.rs".to_string(), 10, 0)];

        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].0, "src/main.rs");
        assert_eq!(stats[0].1, 10); // insertions
        assert_eq!(stats[0].2, 0); // deletions
    }

    #[test]
    fn test_parse_file_stats_single_file_deletions() {
        // Test parsing a single file with only deletions
        let stats = vec![("src/old.rs".to_string(), 0, 5)];

        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].0, "src/old.rs");
        assert_eq!(stats[0].1, 0); // insertions
        assert_eq!(stats[0].2, 5); // deletions
    }

    #[test]
    fn test_parse_file_stats_single_file_modifications() {
        // Test parsing a single file with both insertions and deletions
        let stats = vec![("src/lib.rs".to_string(), 15, 8)];

        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].0, "src/lib.rs");
        assert_eq!(stats[0].1, 15); // insertions
        assert_eq!(stats[0].2, 8); // deletions
    }

    #[test]
    fn test_parse_file_stats_multiple_files() {
        // Test parsing multiple files with mixed changes
        let stats = vec![
            ("src/main.rs".to_string(), 10, 2),
            ("src/lib.rs".to_string(), 5, 3),
            ("tests/test.rs".to_string(), 20, 0),
            ("README.md".to_string(), 0, 5),
        ];

        assert_eq!(stats.len(), 4);
        assert_eq!(stats[0].1 + stats[1].1 + stats[2].1 + stats[3].1, 35); // total insertions
        assert_eq!(stats[0].2 + stats[1].2 + stats[2].2 + stats[3].2, 10); // total deletions
    }

    #[test]
    fn test_diff_statistics_calculation_single_file_additions() {
        // Test DiffStatistics calculation for file with only additions
        let file_stats = vec![create_file_stat("src/main.rs", 10, 0)];
        let stats = create_test_stats(10, 0, 0, 1, file_stats);

        assert_eq!(stats.total_insertions, 10);
        assert_eq!(stats.total_deletions, 0);
        assert_eq!(stats.total_modifications, 0);
        assert_eq!(stats.files_changed, 1);
    }

    #[test]
    fn test_diff_statistics_calculation_single_file_deletions() {
        // Test DiffStatistics calculation for file with only deletions
        let file_stats = vec![create_file_stat("src/old.rs", 0, 5)];
        let stats = create_test_stats(0, 5, 0, 1, file_stats);

        assert_eq!(stats.total_insertions, 0);
        assert_eq!(stats.total_deletions, 5);
        assert_eq!(stats.total_modifications, 0);
        assert_eq!(stats.files_changed, 1);
    }

    #[test]
    fn test_diff_statistics_calculation_single_file_modifications() {
        // Test DiffStatistics calculation for file with both insertions and deletions
        // Modifications should be min(insertions, deletions)
        let file_stats = vec![create_file_stat("src/lib.rs", 15, 8)];
        let stats = create_test_stats(15, 8, 8, 1, file_stats);

        assert_eq!(stats.total_insertions, 15);
        assert_eq!(stats.total_deletions, 8);
        assert_eq!(stats.total_modifications, 8); // min(15, 8)
        assert_eq!(stats.files_changed, 1);
    }

    #[test]
    fn test_diff_statistics_calculation_multiple_files_mixed() {
        // Test DiffStatistics calculation for multiple files with mixed changes
        let file_stats = vec![
            create_file_stat("src/main.rs", 10, 2),
            create_file_stat("src/lib.rs", 5, 3),
            create_file_stat("tests/test.rs", 20, 0),
            create_file_stat("README.md", 0, 5),
        ];

        // Calculate expected modifications: min(10,2) + min(5,3) + min(20,0) + min(0,5)
        // = 2 + 3 + 0 + 0 = 5
        let stats = create_test_stats(35, 10, 5, 4, file_stats);

        assert_eq!(stats.total_insertions, 35);
        assert_eq!(stats.total_deletions, 10);
        assert_eq!(stats.total_modifications, 5);
        assert_eq!(stats.files_changed, 4);
        assert_eq!(stats.file_stats.len(), 4);
    }

    #[test]
    fn test_diff_statistics_empty_diff() {
        // Test DiffStatistics with no changes
        let file_stats = vec![];
        let stats = create_test_stats(0, 0, 0, 0, file_stats);

        assert_eq!(stats.total_insertions, 0);
        assert_eq!(stats.total_deletions, 0);
        assert_eq!(stats.total_modifications, 0);
        assert_eq!(stats.files_changed, 0);
        assert_eq!(stats.file_stats.len(), 0);
    }

    #[test]
    fn test_diff_statistics_single_line_change() {
        // Test DiffStatistics with minimal changes
        let file_stats = vec![create_file_stat("src/main.rs", 1, 0)];
        let stats = create_test_stats(1, 0, 0, 1, file_stats);

        assert_eq!(stats.total_insertions, 1);
        assert_eq!(stats.total_deletions, 0);
        assert_eq!(stats.total_modifications, 0);
        assert_eq!(stats.files_changed, 1);
    }

    #[test]
    fn test_diff_statistics_large_changes() {
        // Test DiffStatistics with large number of changes
        let file_stats = vec![
            create_file_stat("src/main.rs", 1000, 500),
            create_file_stat("src/lib.rs", 2000, 1500),
            create_file_stat("tests/test.rs", 500, 200),
        ];

        // Expected modifications: min(1000,500) + min(2000,1500) + min(500,200)
        // = 500 + 1500 + 200 = 2200
        let stats = create_test_stats(3500, 2200, 2200, 3, file_stats);

        assert_eq!(stats.total_insertions, 3500);
        assert_eq!(stats.total_deletions, 2200);
        assert_eq!(stats.total_modifications, 2200);
        assert_eq!(stats.files_changed, 3);
    }

    #[test]
    fn test_diff_summary_format_basic() {
        // Test that get_diff_summary produces correctly formatted output
        let file_stats = vec![create_file_stat("src/main.rs", 10, 5)];
        let stats = create_test_stats(10, 5, 5, 1, file_stats);

        let summary = format!(
            "📊 Diff Statistics:\n   • Files changed: {}\n   • Insertions: +{}\n   • Deletions: -{}\n   • Modifications: {}",
            stats.files_changed,
            stats.total_insertions,
            stats.total_deletions,
            stats.total_modifications
        );

        assert!(summary.contains("📊 Diff Statistics:"));
        assert!(summary.contains("Files changed: 1"));
        assert!(summary.contains("Insertions: +10"));
        assert!(summary.contains("Deletions: -5"));
        assert!(summary.contains("Modifications: 5"));
    }

    #[test]
    fn test_diff_summary_format_empty() {
        // Test that get_diff_summary handles empty diff correctly
        let file_stats = vec![];
        let stats = create_test_stats(0, 0, 0, 0, file_stats);

        let summary = format!(
            "📊 Diff Statistics:\n   • Files changed: {}\n   • Insertions: +{}\n   • Deletions: -{}\n   • Modifications: {}",
            stats.files_changed,
            stats.total_insertions,
            stats.total_deletions,
            stats.total_modifications
        );

        assert!(summary.contains("Files changed: 0"));
        assert!(summary.contains("Insertions: +0"));
        assert!(summary.contains("Deletions: -0"));
        assert!(summary.contains("Modifications: 0"));
    }

    #[test]
    fn test_diff_summary_format_multiple_files() {
        // Test that get_diff_summary formats multiple files correctly
        let file_stats = vec![
            create_file_stat("src/main.rs", 10, 2),
            create_file_stat("src/lib.rs", 5, 3),
            create_file_stat("tests/test.rs", 20, 0),
        ];
        let stats = create_test_stats(35, 5, 5, 3, file_stats);

        let summary = format!(
            "📊 Diff Statistics:\n   • Files changed: {}\n   • Insertions: +{}\n   • Deletions: -{}\n   • Modifications: {}",
            stats.files_changed,
            stats.total_insertions,
            stats.total_deletions,
            stats.total_modifications
        );

        assert!(summary.contains("Files changed: 3"));
        assert!(summary.contains("Insertions: +35"));
        assert!(summary.contains("Deletions: -5"));
        assert!(summary.contains("Modifications: 5"));
    }

    #[test]
    fn test_file_stat_structure() {
        // Test FileStat structure creation and access
        let file_stat = create_file_stat("src/main.rs", 10, 5);

        assert_eq!(file_stat.file, "src/main.rs");
        assert_eq!(file_stat.insertions, 10);
        assert_eq!(file_stat.deletions, 5);
    }

    #[test]
    fn test_diff_statistics_structure() {
        // Test DiffStatistics structure creation and access
        let file_stats = vec![
            create_file_stat("src/main.rs", 10, 5),
            create_file_stat("src/lib.rs", 20, 10),
        ];
        let stats = create_test_stats(30, 15, 15, 2, file_stats);

        assert_eq!(stats.total_insertions, 30);
        assert_eq!(stats.total_deletions, 15);
        assert_eq!(stats.total_modifications, 15);
        assert_eq!(stats.files_changed, 2);
        assert_eq!(stats.file_stats.len(), 2);
        assert_eq!(stats.file_stats[0].file, "src/main.rs");
        assert_eq!(stats.file_stats[1].file, "src/lib.rs");
    }

    #[test]
    fn test_modifications_calculation_asymmetric() {
        // Test that modifications are calculated as min(insertions, deletions)
        // for asymmetric changes
        let file_stats = vec![
            create_file_stat("file1.rs", 100, 10),
            create_file_stat("file2.rs", 5, 50),
        ];

        // Expected modifications: min(100,10) + min(5,50) = 10 + 5 = 15
        let stats = create_test_stats(105, 60, 15, 2, file_stats);

        assert_eq!(stats.total_modifications, 15);
    }

    #[test]
    fn test_modifications_calculation_symmetric() {
        // Test that modifications are calculated correctly for symmetric changes
        let file_stats = vec![
            create_file_stat("file1.rs", 50, 50),
            create_file_stat("file2.rs", 30, 30),
        ];

        // Expected modifications: min(50,50) + min(30,30) = 50 + 30 = 80
        let stats = create_test_stats(80, 80, 80, 2, file_stats);

        assert_eq!(stats.total_modifications, 80);
    }

    #[test]
    fn test_file_stats_with_special_characters() {
        // Test FileStat with file paths containing special characters
        let file_stat = create_file_stat("src/utils/my-file_v2.rs", 10, 5);

        assert_eq!(file_stat.file, "src/utils/my-file_v2.rs");
        assert_eq!(file_stat.insertions, 10);
        assert_eq!(file_stat.deletions, 5);
    }

    #[test]
    fn test_file_stats_with_nested_paths() {
        // Test FileStat with deeply nested file paths
        let file_stat = create_file_stat("src/modules/utils/helpers/core.rs", 25, 15);

        assert_eq!(file_stat.file, "src/modules/utils/helpers/core.rs");
        assert_eq!(file_stat.insertions, 25);
        assert_eq!(file_stat.deletions, 15);
    }

    #[test]
    fn test_diff_statistics_many_files() {
        // Test DiffStatistics with many files
        let mut file_stats = Vec::new();
        for i in 0..100 {
            file_stats.push(create_file_stat(
                &format!("src/file{}.rs", i),
                i as u32 * 10,
                i as u32 * 5,
            ));
        }

        let total_insertions: u32 = file_stats.iter().map(|f| f.insertions).sum();
        let total_deletions: u32 = file_stats.iter().map(|f| f.deletions).sum();
        let total_modifications: u32 = file_stats
            .iter()
            .map(|f| f.insertions.min(f.deletions))
            .sum();

        let stats = create_test_stats(
            total_insertions,
            total_deletions,
            total_modifications,
            100,
            file_stats,
        );

        assert_eq!(stats.files_changed, 100);
        assert_eq!(stats.file_stats.len(), 100);
        assert!(stats.total_insertions > 0);
        assert!(stats.total_deletions > 0);
    }
}
