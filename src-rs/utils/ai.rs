use crate::error::{GitAiError, Result};
use crate::types::AIConfig;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub choices: Vec<Choice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct StreamChoice {
    pub delta: Delta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct StreamResponse {
    pub choices: Vec<StreamChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct Delta {
    #[serde(default)]
    pub content: Option<String>,
}

pub struct AIClient {
    client: Client,
    config: AIConfig,
}

impl AIClient {
    /// Create a new AI client
    pub fn new(config: AIConfig) -> Result<Self> {
        if config.provider.is_empty() {
            return Err(GitAiError::Config("Provider not configured".to_string()));
        }

        if config.api_key.is_empty()
            && config.provider != "ollama"
            && config.provider != "lm-studio"
        {
            return Err(GitAiError::Config("API key not configured".to_string()));
        }

        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| GitAiError::Http(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self { client, config })
    }

    /// Generate a commit message
    pub async fn generate_commit_message(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<String> {
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            },
        ];

        let request = ChatCompletionRequest {
            model: self.config.model.clone(),
            messages,
            temperature: Some(0.7),
            max_tokens: Some(500),
            stream: None,
        };

        let response = self
            .client
            .post(&format!("{}/chat/completions", self.config.base_url))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                let error_msg = format!("HTTP request failed: {}", e);
                GitAiError::Http(Self::redact_secrets(&error_msg))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            let error_msg = format!("API error ({}): {}", status, body);
            return Err(GitAiError::Ai(Self::redact_secrets(&error_msg)));
        }

        let completion: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|e| GitAiError::Ai(format!("Failed to parse response: {}", e)))?;

        if completion.choices.is_empty() {
            return Err(GitAiError::Ai("No choices in response".to_string()));
        }

        Ok(completion.choices[0].message.content.clone())
    }

    /// Generate multiple commit messages
    pub async fn generate_multiple_messages(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        count: usize,
    ) -> Result<Vec<String>> {
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "{}\n\nGenerate {} different commit messages separated by '---'.",
                    user_prompt, count
                ),
            },
        ];

        let request = ChatCompletionRequest {
            model: self.config.model.clone(),
            messages,
            temperature: Some(0.8),
            max_tokens: Some(1000),
            stream: None,
        };

        let response = self
            .client
            .post(&format!("{}/chat/completions", self.config.base_url))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .json(&request)
            .send()
            .await
            .map_err(|e| {
                let error_msg = format!("HTTP request failed: {}", e);
                GitAiError::Http(Self::redact_secrets(&error_msg))
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            let error_msg = format!("API error ({}): {}", status, body);
            return Err(GitAiError::Ai(Self::redact_secrets(&error_msg)));
        }

        let completion: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|e| GitAiError::Ai(format!("Failed to parse response: {}", e)))?;

        if completion.choices.is_empty() {
            return Err(GitAiError::Ai("No choices in response".to_string()));
        }

        let content = &completion.choices[0].message.content;
        let messages: Vec<String> = content
            .split("---")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Ok(messages)
    }

    /// Redact secrets from error messages
    fn redact_secrets(input: &str) -> String {
        let mut result = input.to_string();

        // Redact API keys (sk-... format)
        result = regex::Regex::new(r"sk-[a-zA-Z0-9]{20,}")
            .unwrap()
            .replace_all(&result, "sk-****...")
            .to_string();

        // Redact Bearer tokens
        result = regex::Regex::new(r"Bearer\s+[a-zA-Z0-9_-]{20,}")
            .unwrap()
            .replace_all(&result, "Bearer ****...")
            .to_string();

        // Redact long tokens (>24 chars)
        result = regex::Regex::new(r"([a-zA-Z0-9_-]{24,})")
            .unwrap()
            .replace_all(&result, |caps: &regex::Captures| {
                let token = &caps[1];
                if token.len() > 6 {
                    format!("{}****{}", &token[..3], &token[token.len() - 3..])
                } else {
                    "****".to_string()
                }
            })
            .to_string();

        result
    }
}

/// System prompts for different locales and providers
pub struct PromptTemplates;

impl PromptTemplates {
    pub fn get_system_prompt(locale: &str, provider: &str, custom_prompt: Option<&str>) -> String {
        if let Some(custom) = custom_prompt {
            return custom.to_string();
        }

        match locale {
            "zh" => Self::get_chinese_prompt(provider),
            _ => Self::get_english_prompt(provider),
        }
    }

    fn get_english_prompt(provider: &str) -> String {
        match provider {
            "deepseek" => {
                r#"You are an expert git commit message generator. Generate clear, concise commit messages following Conventional Commits format.

Rules:
1. Use format: <type>(<scope>): <subject>
2. Types: feat, fix, docs, style, refactor, perf, test, chore
3. Subject: imperative mood, lowercase, no period
4. Keep subject under 50 characters
5. Add body if needed (wrapped at 72 chars)
6. Add footer for breaking changes

Focus on the intent and impact of changes, not just the mechanics."#
                    .to_string()
            }
            _ => {
                r#"You are an expert git commit message generator. Generate clear, concise commit messages following Conventional Commits format.

Rules:
1. Use format: <type>(<scope>): <subject>
2. Types: feat, fix, docs, style, refactor, perf, test, chore
3. Subject: imperative mood, lowercase, no period
4. Keep subject under 50 characters
5. Add body if needed (wrapped at 72 chars)
6. Add footer for breaking changes"#
                    .to_string()
            }
        }
    }

    fn get_chinese_prompt(provider: &str) -> String {
        match provider {
            "deepseek" => {
                r#"你是一个专业的 Git 提交信息生成器。生成清晰、简洁的提交信息，遵循 Conventional Commits 格式。

规则：
1. 格式：<type>(<scope>): <subject>
2. 类型：feat（功能）、fix（修复）、docs（文档）、style（样式）、refactor（重构）、perf（性能）、test（测试）、chore（杂务）
3. 主题：使用祈使语气，小写，无句号
4. 主题长度不超过 50 个字符
5. 如需要可添加正文（每行 72 字符）
6. 破坏性变更需添加页脚

重点关注变更的意图和影响，而不仅仅是机制。"#
                    .to_string()
            }
            _ => {
                r#"你是一个专业的 Git 提交信息生成器。生成清晰、简洁的提交信息，遵循 Conventional Commits 格式。

规则：
1. 格式：<type>(<scope>): <subject>
2. 类型：feat（功能）、fix（修复）、docs（文档）、style（样式）、refactor（重构）、perf（性能）、test（测试）、chore（杂务）
3. 主题：使用祈使语气，小写，无句号
4. 主题长度不超过 50 个字符
5. 如需要可添加正文（每行 72 字符）
6. 破坏性变更需添加页脚"#
                    .to_string()
            }
        }
    }

    pub fn get_user_prompt(
        diff: &str,
        branch_name: Option<&str>,
        recent_commits: Option<&[String]>,
    ) -> String {
        let mut prompt = format!(
            "Generate a commit message for the following changes:\n\n```diff\n{}\n```",
            diff
        );

        if let Some(branch) = branch_name {
            prompt.push_str(&format!("\n\nBranch: {}", branch));
        }

        if let Some(commits) = recent_commits {
            if !commits.is_empty() {
                prompt.push_str("\n\nRecent commits:\n");
                for commit in commits.iter().take(5) {
                    prompt.push_str(&format!("- {}\n", commit));
                }
            }
        }

        prompt
    }
}
