use crate::error::{GitAiError, Result};
use std::process::Command;
use tokio::process::Command as AsyncCommand;

/// GitHub Copilot CLI integration for deep code analysis
/// This is NOT for generating commit messages (to avoid capability overlap)
/// Instead, it provides intelligent code impact analysis and risk detection
pub struct CopilotCLI;

#[derive(Debug, Clone)]
pub struct CodeAnalysis {
    pub impact_summary: String,
    pub potential_issues: Vec<String>,
    pub affected_areas: Vec<String>,
    pub test_recommendations: Vec<String>,
}

impl CopilotCLI {
    /// Check if GitHub Copilot CLI is available
    pub fn is_available() -> bool {
        Command::new("gh")
            .arg("copilot")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Perform deep code impact analysis using Copilot CLI
    pub async fn analyze_code_impact(diff: &str, staged_files: &[String]) -> Result<CodeAnalysis> {
        if diff.is_empty() {
            return Ok(CodeAnalysis {
                impact_summary: "No changes detected".to_string(),
                potential_issues: vec![],
                affected_areas: vec![],
                test_recommendations: vec![],
            });
        }

        let files_list = staged_files.join(", ");

        let prompt = format!(
            "You are a code review expert. Analyze the following git diff and provide a structured analysis.\n\n\
             Changed files: {}\n\n\
             Git diff:\n{}\n\n\
             Please provide:\n\
             1. IMPACT: A brief summary of what changed and why it matters\n\
             2. RISKS: List potential issues, breaking changes, or bugs this might introduce\n\
             3. AFFECTED: List other files/modules that might be affected by these changes\n\
             4. TESTS: Suggest what should be tested to verify these changes\n\n\
             Format your response as:\n\
             IMPACT: [summary]\n\
             RISKS:\n\
             - [risk 1]\n\
             - [risk 2]\n\
             AFFECTED:\n\
             - [area 1]\n\
             - [area 2]\n\
             TESTS:\n\
             - [test 1]\n\
             - [test 2]",
            files_list, diff
        );

        let analysis_text = Self::run_copilot_explain(&prompt).await?;

        // Parse the structured response
        Self::parse_analysis(&analysis_text)
    }

    /// Run Copilot CLI explain command
    async fn run_copilot_explain(prompt: &str) -> Result<String> {
        let output = AsyncCommand::new("gh")
            .arg("copilot")
            .arg("explain")
            .arg(prompt)
            .output()
            .await
            .map_err(|e| GitAiError::Other(format!("Failed to run gh copilot: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(GitAiError::Other(format!("Copilot CLI failed: {}", stderr)));
        }

        let result = String::from_utf8(output.stdout)
            .map_err(|e| GitAiError::Other(format!("Invalid UTF-8 output: {}", e)))?;

        Ok(result.trim().to_string())
    }

    /// Parse the structured analysis response
    fn parse_analysis(text: &str) -> Result<CodeAnalysis> {
        let mut impact_summary = String::new();
        let mut potential_issues = Vec::new();
        let mut affected_areas = Vec::new();
        let mut test_recommendations = Vec::new();

        let mut current_section = "";

        for line in text.lines() {
            let line = line.trim();

            if line.starts_with("IMPACT:") {
                current_section = "impact";
                impact_summary = line
                    .strip_prefix("IMPACT:")
                    .unwrap_or("")
                    .trim()
                    .to_string();
            } else if line.starts_with("RISKS:") {
                current_section = "risks";
            } else if line.starts_with("AFFECTED:") {
                current_section = "affected";
            } else if line.starts_with("TESTS:") {
                current_section = "tests";
            } else if line.starts_with("- ") || line.starts_with("* ") {
                let item = line
                    .trim_start_matches("- ")
                    .trim_start_matches("* ")
                    .trim()
                    .to_string();
                if !item.is_empty() {
                    match current_section {
                        "risks" => potential_issues.push(item),
                        "affected" => affected_areas.push(item),
                        "tests" => test_recommendations.push(item),
                        _ => {}
                    }
                }
            }
        }

        // Fallback if parsing fails
        if impact_summary.is_empty() {
            impact_summary = text.lines().take(3).collect::<Vec<_>>().join(" ");
        }

        Ok(CodeAnalysis {
            impact_summary,
            potential_issues,
            affected_areas,
            test_recommendations,
        })
    }

    /// Get a simple status message about Copilot availability
    pub fn get_status_message() -> String {
        if Self::is_available() {
            "GitHub Copilot CLI available for code analysis".to_string()
        } else {
            "GitHub Copilot CLI not available (install: gh auth login)".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_copilot_availability() {
        let _ = CopilotCLI::is_available();
    }

    #[test]
    fn test_parse_analysis() {
        let text = "IMPACT: Updated authentication logic\n\
                    RISKS:\n\
                    - Breaking change in API\n\
                    - Missing error handling\n\
                    AFFECTED:\n\
                    - Login component\n\
                    - Auth service\n\
                    TESTS:\n\
                    - Test login flow\n\
                    - Test error cases";

        let analysis = CopilotCLI::parse_analysis(text).unwrap();
        assert_eq!(analysis.impact_summary, "Updated authentication logic");
        assert_eq!(analysis.potential_issues.len(), 2);
        assert_eq!(analysis.affected_areas.len(), 2);
        assert_eq!(analysis.test_recommendations.len(), 2);
    }
}
