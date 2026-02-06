use crate::error::Result;
use crate::utils::ConfigManager;
use crate::types::{AIConfig, get_provider_presets};
use dialoguer::{Select, Input, Confirm};

pub async fn run(
    subcommand: Option<String>,
    local: bool,
) -> Result<()> {
    match subcommand.as_deref() {
        Some("get") => run_get(local).await,
        Some("set") => {
            eprintln!("Config set requires key and value arguments");
            Err(crate::error::GitAiError::InvalidArgument(
                "Usage: git-ai config set <key> <value>".to_string(),
            ))
        }
        Some("describe") => run_describe().await,
        None => run_wizard(local).await,
        Some(cmd) => Err(crate::error::GitAiError::InvalidArgument(
            format!("Unknown config subcommand: {}", cmd),
        )),
    }
}

async fn run_get(local: bool) -> Result<()> {
    let config = if local {
        ConfigManager::read_local_config()?
    } else {
        ConfigManager::get_merged_config()?
    };

    println!("Current configuration:");
    println!("  Provider: {}", config.provider);
    println!("  Model: {}", config.model);
    println!("  Locale: {}", config.locale);
    if let Some(agent_model) = &config.agent_model {
        println!("  Agent Model: {}", agent_model);
    }
    if let Some(custom_prompt) = &config.custom_prompt {
        println!("  Custom Prompt: {} chars", custom_prompt.len());
    }
    println!("  Enable Footer: {}", config.enable_footer.unwrap_or(true));

    Ok(())
}

async fn run_describe() -> Result<()> {
    println!("Available configuration keys:");
    println!();
    println!("  provider          - AI provider name (required)");
    println!("  api_key           - API authentication key");
    println!("  base_url          - API endpoint base URL");
    println!("  model             - Model name for basic mode");
    println!("  agent_model       - Separate model for agent mode");
    println!("  locale            - Output language (zh/en)");
    println!("  custom_prompt     - Custom system prompt");
    println!("  enable_footer     - Add footer to messages (true/false)");
    println!();
    println!("Environment variables:");
    println!("  GIT_AI_PROVIDER   - Override provider");
    println!("  GIT_AI_API_KEY    - Override API key");
    println!("  GIT_AI_BASE_URL   - Override base URL");
    println!("  GIT_AI_MODEL      - Override model");
    println!("  GIT_AI_LOCALE     - Override locale");
    println!();
    println!("Configuration files:");
    println!("  Global: ~/.config/git-ai-cli/config.json");
    println!("  Local:  .git-ai.json (in project root)");

    Ok(())
}

async fn run_wizard(local: bool) -> Result<()> {
    println!("\n🔧 Git-AI Configuration Wizard\n");

    let presets = get_provider_presets();
    let mut provider_names: Vec<&str> = presets.keys().copied().collect();
    provider_names.sort();

    // Select provider
    println!("Select AI provider:");
    let provider_idx = Select::new()
        .items(&provider_names)
        .default(0)
        .interact()
        .map_err(|e| crate::error::GitAiError::Other(format!("Selection failed: {}", e)))?;

    let provider_key = provider_names[provider_idx];
    let preset = &presets[provider_key];

    let mut config = AIConfig {
        provider: provider_key.to_string(),
        ..Default::default()
    };

    // Get API key if required
    if preset.requires_key {
        let api_key: String = Input::new()
            .with_prompt("Enter API key")
            .interact()
            .map_err(|e| crate::error::GitAiError::Other(format!("Input failed: {}", e)))?;
        config.api_key = api_key;
    }

    // Set base URL
    config.base_url = preset.base_url.clone();

    // Get model
    let model: String = Input::new()
        .with_prompt(&format!("Enter model name (default: {})", preset.default_model))
        .default(preset.default_model.clone())
        .interact()
        .map_err(|e| crate::error::GitAiError::Other(format!("Input failed: {}", e)))?;
    config.model = model;

    // Get locale
    let locale_options = vec!["English", "中文"];
    let locale_idx = Select::new()
        .with_prompt("Select language")
        .items(&locale_options)
        .default(0)
        .interact()
        .map_err(|e| crate::error::GitAiError::Other(format!("Selection failed: {}", e)))?;

    config.locale = if locale_idx == 0 { "en" } else { "zh" }.to_string();

    // Ask for custom prompt
    let use_custom = Confirm::new()
        .with_prompt("Use custom system prompt?")
        .default(false)
        .interact()
        .map_err(|e| crate::error::GitAiError::Other(format!("Confirmation failed: {}", e)))?;

    if use_custom {
        let custom_prompt: String = Input::new()
            .with_prompt("Enter custom system prompt")
            .interact()
            .map_err(|e| crate::error::GitAiError::Other(format!("Input failed: {}", e)))?;
        config.custom_prompt = Some(custom_prompt);
    }

    // Ask for footer
    let enable_footer = Confirm::new()
        .with_prompt("Add footer to commit messages?")
        .default(true)
        .interact()
        .map_err(|e| crate::error::GitAiError::Other(format!("Confirmation failed: {}", e)))?;

    config.enable_footer = Some(enable_footer);

    // Save configuration
    if local {
        ConfigManager::write_local_config(&config)?;
        println!("\n✅ Local configuration saved to .git-ai.json");
    } else {
        ConfigManager::write_global_config(&config)?;
        println!("\n✅ Global configuration saved");
    }

    println!("\nConfiguration complete! You can now use git-ai.");

    Ok(())
}
