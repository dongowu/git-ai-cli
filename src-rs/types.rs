use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfig {
    #[serde(default)]
    pub provider: String,
    #[serde(default, alias = "apiKey")]
    pub api_key: String,
    #[serde(default, alias = "baseUrl")]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default, alias = "agentModel")]
    pub agent_model: Option<String>,
    #[serde(default)]
    pub locale: String,
    #[serde(default, alias = "customPrompt")]
    pub custom_prompt: Option<String>,
    #[serde(default, alias = "enableFooter")]
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

#[cfg(test)]
mod tests {
    use super::AIConfig;

    #[test]
    fn parse_legacy_camel_case_config_fields() {
        let raw = r#"{
            "provider": "deepseek",
            "apiKey": "legacy-key",
            "baseUrl": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
            "agentModel": "deepseek-chat",
            "locale": "zh",
            "customPrompt": "legacy",
            "enableFooter": true
        }"#;

        let cfg: AIConfig = serde_json::from_str(raw).expect("legacy config should parse");
        assert_eq!(cfg.provider, "deepseek");
        assert_eq!(cfg.api_key, "legacy-key");
        assert_eq!(cfg.base_url, "https://api.deepseek.com/v1");
        assert_eq!(cfg.model, "deepseek-chat");
        assert_eq!(cfg.agent_model.as_deref(), Some("deepseek-chat"));
        assert_eq!(cfg.locale, "zh");
        assert_eq!(cfg.custom_prompt.as_deref(), Some("legacy"));
        assert_eq!(cfg.enable_footer, Some(true));
    }
}
