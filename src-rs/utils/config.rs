use crate::error::{GitAiError, Result};
use crate::types::AIConfig;
use dirs::config_dir;
use std::fs;
use std::path::PathBuf;

pub struct ConfigManager;

impl ConfigManager {
    /// Get the global config directory
    pub fn get_global_config_dir() -> Result<PathBuf> {
        let config_dir = config_dir()
            .ok_or_else(|| GitAiError::Config("Cannot determine config directory".to_string()))?;
        Ok(config_dir.join("git-ai-cli"))
    }

    /// Get the global config file path
    pub fn get_global_config_path() -> Result<PathBuf> {
        let dir = Self::get_global_config_dir()?;
        Ok(dir.join("config.json"))
    }

    /// Get the local config file path (.git-ai.json in current directory)
    pub fn get_local_config_path() -> PathBuf {
        PathBuf::from(".git-ai.json")
    }

    /// Read global config from file
    pub fn read_global_config() -> Result<AIConfig> {
        let path = Self::get_global_config_path()?;
        if !path.exists() {
            return Ok(AIConfig::default());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| GitAiError::Config(format!("Failed to read global config: {}", e)))?;
        let config: AIConfig = serde_json::from_str(&content)
            .map_err(|e| GitAiError::Config(format!("Invalid global config JSON: {}", e)))?;
        Ok(config)
    }

    /// Read local config from file
    pub fn read_local_config() -> Result<AIConfig> {
        let path = Self::get_local_config_path();
        if !path.exists() {
            return Ok(AIConfig::default());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| GitAiError::Config(format!("Failed to read local config: {}", e)))?;
        let config: AIConfig = serde_json::from_str(&content)
            .map_err(|e| GitAiError::Config(format!("Invalid local config JSON: {}", e)))?;
        Ok(config)
    }

    /// Read config from environment variables
    pub fn read_env_config() -> AIConfig {
        let mut config = AIConfig::default();

        // Provider
        if let Ok(provider) = std::env::var("GIT_AI_PROVIDER") {
            config.provider = provider;
        } else if let Ok(provider) = std::env::var("OCO_AI_PROVIDER") {
            config.provider = provider;
        }

        // API Key
        if let Ok(api_key) = std::env::var("GIT_AI_API_KEY") {
            config.api_key = api_key;
        } else if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
            config.api_key = api_key;
        } else if let Ok(api_key) = std::env::var("DEEPSEEK_API_KEY") {
            config.api_key = api_key;
        }

        // Base URL
        if let Ok(base_url) = std::env::var("GIT_AI_BASE_URL") {
            config.base_url = base_url;
        }

        // Model
        if let Ok(model) = std::env::var("GIT_AI_MODEL") {
            config.model = model;
        }

        // Agent Model
        if let Ok(agent_model) = std::env::var("GIT_AI_AGENT_MODEL") {
            config.agent_model = Some(agent_model);
        }

        // Locale
        if let Ok(locale) = std::env::var("GIT_AI_LOCALE") {
            config.locale = locale;
        }

        // Custom Prompt
        if let Ok(custom_prompt) = std::env::var("GIT_AI_CUSTOM_PROMPT") {
            config.custom_prompt = Some(custom_prompt);
        }

        // Enable Footer
        if let Ok(enable_footer) = std::env::var("GIT_AI_ENABLE_FOOTER") {
            config.enable_footer = Some(matches!(
                enable_footer.to_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            ));
        }

        config
    }

    /// Merge configs with priority: env > local > global
    pub fn get_merged_config() -> Result<AIConfig> {
        let global = Self::read_global_config()?;
        let local = Self::read_local_config()?;
        let env = Self::read_env_config();

        let mut merged = global;

        // Merge local config
        if !local.provider.is_empty() {
            merged.provider = local.provider;
        }
        if !local.api_key.is_empty() {
            merged.api_key = local.api_key;
        }
        if !local.base_url.is_empty() {
            merged.base_url = local.base_url;
        }
        if !local.model.is_empty() {
            merged.model = local.model;
        }
        if local.agent_model.is_some() {
            merged.agent_model = local.agent_model;
        }
        if !local.locale.is_empty() && local.locale != "en" {
            merged.locale = local.locale;
        }
        if local.custom_prompt.is_some() {
            merged.custom_prompt = local.custom_prompt;
        }
        if local.enable_footer.is_some() {
            merged.enable_footer = local.enable_footer;
        }

        // Merge env config (highest priority)
        if !env.provider.is_empty() {
            merged.provider = env.provider;
        }
        if !env.api_key.is_empty() {
            merged.api_key = env.api_key;
        }
        if !env.base_url.is_empty() {
            merged.base_url = env.base_url;
        }
        if !env.model.is_empty() {
            merged.model = env.model;
        }
        if env.agent_model.is_some() {
            merged.agent_model = env.agent_model;
        }
        if !env.locale.is_empty() && env.locale != "en" {
            merged.locale = env.locale;
        }
        if env.custom_prompt.is_some() {
            merged.custom_prompt = env.custom_prompt;
        }
        if env.enable_footer.is_some() {
            merged.enable_footer = env.enable_footer;
        }

        Ok(merged)
    }

    /// Get validated config (provider is required)
    #[allow(dead_code)]
    pub fn get_config() -> Result<AIConfig> {
        let config = Self::get_merged_config()?;
        if config.provider.is_empty() {
            return Err(GitAiError::Config(
                "Provider not configured. Run 'git-ai config' to set up.".to_string(),
            ));
        }
        Ok(config)
    }

    /// Write global config
    pub fn write_global_config(config: &AIConfig) -> Result<()> {
        let dir = Self::get_global_config_dir()?;
        fs::create_dir_all(&dir)
            .map_err(|e| GitAiError::Config(format!("Failed to create config directory: {}", e)))?;

        let path = dir.join("config.json");
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| GitAiError::Config(format!("Failed to serialize config: {}", e)))?;

        fs::write(&path, json)
            .map_err(|e| GitAiError::Config(format!("Failed to write config: {}", e)))?;

        Ok(())
    }

    /// Write local config
    pub fn write_local_config(config: &AIConfig) -> Result<()> {
        let path = Self::get_local_config_path();
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| GitAiError::Config(format!("Failed to serialize config: {}", e)))?;

        fs::write(&path, json)
            .map_err(|e| GitAiError::Config(format!("Failed to write config: {}", e)))?;

        Ok(())
    }

    /// Clear global config
    #[allow(dead_code)]
    pub fn clear_global_config() -> Result<()> {
        let path = Self::get_global_config_path()?;
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| GitAiError::Config(format!("Failed to delete config: {}", e)))?;
        }
        Ok(())
    }

    /// Redact secrets from a string (for error messages)
    #[allow(dead_code)]
    pub fn redact_secrets(input: &str) -> String {
        let mut result = input.to_string();

        // Redact API keys (sk-... format)
        result = regex::Regex::new(r"sk-[a-zA-Z0-9]{20,}")
            .unwrap()
            .replace_all(&result, "sk-****...")
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
