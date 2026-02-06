use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    pub provider: String,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub agent_model: Option<String>,
    #[serde(default)]
    pub locale: String,
    #[serde(default)]
    pub custom_prompt: Option<String>,
    #[serde(default)]
    pub enable_footer: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct ProviderPreset {
    pub base_url: String,
    pub default_model: String,
    pub requires_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct FileStat {
    pub file: String,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitMessageOutput {
    pub messages: Vec<String>,
    pub staged_files: Vec<String>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub ignored_files: Vec<String>,
}

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            provider: String::new(),
            api_key: String::new(),
            base_url: String::new(),
            model: String::new(),
            agent_model: None,
            locale: "en".to_string(),
            custom_prompt: None,
            enable_footer: Some(true),
        }
    }
}

pub fn get_provider_presets() -> HashMap<&'static str, ProviderPreset> {
    let mut presets = HashMap::new();

    // Domestic providers (China)
    presets.insert(
        "deepseek",
        ProviderPreset {
            base_url: "https://api.deepseek.com/v1".to_string(),
            default_model: "deepseek-chat".to_string(),
            requires_key: true,
        },
    );

    presets.insert(
        "qwen",
        ProviderPreset {
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
            default_model: "qwen-plus".to_string(),
            requires_key: true,
        },
    );

    presets.insert(
        "zhipu",
        ProviderPreset {
            base_url: "https://open.bigmodel.cn/api/paas/v4".to_string(),
            default_model: "glm-4".to_string(),
            requires_key: true,
        },
    );

    presets.insert(
        "moonshot",
        ProviderPreset {
            base_url: "https://api.moonshot.cn/v1".to_string(),
            default_model: "moonshot-v1-8k".to_string(),
            requires_key: true,
        },
    );

    // International providers
    presets.insert(
        "openai",
        ProviderPreset {
            base_url: "https://api.openai.com/v1".to_string(),
            default_model: "gpt-4-turbo".to_string(),
            requires_key: true,
        },
    );

    presets.insert(
        "siliconflow",
        ProviderPreset {
            base_url: "https://api.siliconflow.cn/v1".to_string(),
            default_model: "deepseek-ai/deepseek-v2.5".to_string(),
            requires_key: true,
        },
    );

    // Local providers
    presets.insert(
        "ollama",
        ProviderPreset {
            base_url: "http://localhost:11434/v1".to_string(),
            default_model: "llama2".to_string(),
            requires_key: false,
        },
    );

    presets.insert(
        "lm-studio",
        ProviderPreset {
            base_url: "http://localhost:1234/v1".to_string(),
            default_model: "local-model".to_string(),
            requires_key: false,
        },
    );

    presets
}
