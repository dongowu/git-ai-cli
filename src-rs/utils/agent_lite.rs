use crate::error::Result;
use crate::utils::GitManager;
use regex::Regex;

pub struct AgentLite;

impl AgentLite {
    /// Analyze file importance based on insertions and deletions
    pub fn analyze_file_importance(
        stats: &[(String, u32, u32)],
    ) -> Vec<(String, u32)> {
        let mut importance: Vec<(String, u32)> = stats
            .iter()
            .map(|(file, insertions, deletions)| {
                let score = insertions + deletions;
                (file.clone(), score)
            })
            .collect();

        importance.sort_by(|a, b| b.1.cmp(&a.1));
        importance.truncate(5); // Top 5 files
        importance
    }

    /// Extract candidate symbols from diff (functions, classes, types)
    pub fn extract_candidate_symbols(diff: &str) -> Vec<String> {
        let mut symbols = Vec::new();

        // Match function definitions
        let func_regex = Regex::new(r"(?:^|\n)\+.*(?:fn|function|def|async fn)\s+(\w+)\s*\(")
            .unwrap();
        for cap in func_regex.captures_iter(diff) {
            if let Some(name) = cap.get(1) {
                symbols.push(name.as_str().to_string());
            }
        }

        // Match class/struct definitions
        let class_regex = Regex::new(r"(?:^|\n)\+.*(?:class|struct|interface|type)\s+(\w+)")
            .unwrap();
        for cap in class_regex.captures_iter(diff) {
            if let Some(name) = cap.get(1) {
                symbols.push(name.as_str().to_string());
            }
        }

        // Remove duplicates and limit to 3
        symbols.sort();
        symbols.dedup();
        symbols.truncate(3);
        symbols
    }

    /// Search for symbol usage in codebase
    pub async fn search_symbol_usage(symbol: &str) -> Result<Vec<String>> {
        let results = GitManager::search_code(symbol)?;
        Ok(results.iter().take(80).map(|s| s.clone()).collect())
    }

    /// Extract scope from branch name
    pub fn extract_scope_from_branch(branch_name: &str) -> Option<String> {
        // feature/user-auth -> user-auth
        if let Some(scope) = branch_name.strip_prefix("feature/") {
            return Some(scope.to_string());
        }

        // bugfix/login-error -> login-error
        if let Some(scope) = branch_name.strip_prefix("bugfix/") {
            return Some(scope.to_string());
        }

        // fix/something -> something
        if let Some(scope) = branch_name.strip_prefix("fix/") {
            return Some(scope.to_string());
        }

        None
    }

    /// Detect potential breaking changes
    pub fn detect_breaking_changes(diff: &str) -> Vec<String> {
        let mut breaking_changes = Vec::new();

        // Check for removed exports
        if diff.contains("-export ") || diff.contains("-pub ") {
            breaking_changes.push("Removed public API".to_string());
        }

        // Check for signature changes
        if diff.contains("- fn ") && diff.contains("+ fn ") {
            breaking_changes.push("Function signature changed".to_string());
        }

        // Check for database schema changes
        if diff.contains("DROP TABLE") || diff.contains("ALTER TABLE") {
            breaking_changes.push("Database schema modified".to_string());
        }

        breaking_changes
    }

    /// Run lightweight agent analysis
    pub async fn run_analysis(
        diff: &str,
        branch_name: Option<&str>,
    ) -> Result<String> {
        // Get file statistics
        let stats = GitManager::get_file_stats()?;
        let important_files = Self::analyze_file_importance(&stats);

        // Extract symbols
        let symbols = Self::extract_candidate_symbols(diff);

        // Search for symbol usage
        let mut usage_info = String::new();
        for symbol in &symbols {
            if let Ok(results) = Self::search_symbol_usage(symbol).await {
                if !results.is_empty() {
                    usage_info.push_str(&format!(
                        "\nSymbol '{}' found in {} locations",
                        symbol,
                        results.len()
                    ));
                }
            }
        }

        // Detect breaking changes
        let breaking_changes = Self::detect_breaking_changes(diff);

        // Extract scope from branch
        let scope_hint = branch_name.and_then(Self::extract_scope_from_branch);

        // Build analysis context
        let mut context = String::new();
        context.push_str("\n## Analysis Context\n");

        if !important_files.is_empty() {
            context.push_str("\nKey files modified:\n");
            for (file, score) in &important_files {
                context.push_str(&format!("- {} (impact: {})\n", file, score));
            }
        }

        if !breaking_changes.is_empty() {
            context.push_str("\nPotential breaking changes:\n");
            for change in &breaking_changes {
                context.push_str(&format!("- {}\n", change));
            }
        }

        if let Some(scope) = scope_hint {
            context.push_str(&format!("\nSuggested scope: {}\n", scope));
        }

        if !usage_info.is_empty() {
            context.push_str(&format!("\nSymbol usage:{}\n", usage_info));
        }

        Ok(context)
    }
}
