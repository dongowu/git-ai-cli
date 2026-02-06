use clap::{Parser, Subcommand};
use std::process;

mod commands;
mod error;
mod types;
mod utils;

use error::Result;

#[derive(Parser)]
#[command(name = "git-ai")]
#[command(about = "Generate git commit messages using AI", long_about = None)]
#[command(version = "2.0.2")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Disable update check
    #[arg(long)]
    no_update_check: bool,

    /// Auto-commit without prompting
    #[arg(short, long)]
    yes: bool,

    /// Number of message options to generate
    #[arg(short, long, default_value = "1")]
    num: usize,

    /// Override locale (zh/en)
    #[arg(short, long)]
    locale: Option<String>,

    /// Force agent mode
    #[arg(short, long)]
    agent: bool,

    /// Use GitHub Copilot CLI for enhancement
    #[arg(long)]
    copilot: bool,

    /// Output as JSON
    #[arg(long)]
    json: bool,

    /// Suppress output
    #[arg(long)]
    quiet: bool,

    /// Use local config only
    #[arg(long)]
    local: bool,

    /// Use global config only
    #[arg(long)]
    global: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Generate commit message (default)
    Commit {
        #[arg(short, long)]
        yes: bool,

        #[arg(short, long, default_value = "1")]
        num: usize,

        #[arg(short, long)]
        locale: Option<String>,

        #[arg(short, long)]
        agent: bool,

        #[arg(long)]
        copilot: bool,
    },

    /// Generate message only (for hooks/scripts)
    Msg {
        #[arg(short, long, default_value = "1")]
        num: usize,

        #[arg(long)]
        json: bool,

        #[arg(long)]
        quiet: bool,

        #[arg(short, long)]
        locale: Option<String>,
    },

    /// Configure AI provider
    Config {
        #[command(subcommand)]
        subcommand: Option<ConfigSubcommand>,

        #[arg(long)]
        local: bool,

        #[arg(long)]
        global: bool,
    },

    /// Manage git hooks
    Hook {
        #[command(subcommand)]
        subcommand: HookSubcommand,

        #[arg(short, long)]
        global: bool,
    },

    /// Generate reports from git history
    Report {
        /// Generate report by recent days (default mode)
        #[arg(long, default_value = "7")]
        days: usize,

        /// Generate release notes from latest tag to target ref
        #[arg(long)]
        from_last_tag: bool,

        /// Generate release notes from specific start tag/ref
        #[arg(long)]
        from_tag: Option<String>,

        /// End ref/tag for range mode (default: HEAD)
        #[arg(long)]
        to_ref: Option<String>,
    },
}

#[derive(Subcommand)]
enum ConfigSubcommand {
    /// Get current configuration
    Get {
        #[arg(long)]
        json: bool,

        #[arg(long)]
        local: bool,
    },

    /// Set configuration value
    Set {
        key: String,
        value: String,

        #[arg(long)]
        local: bool,
    },

    /// Describe all configuration keys
    Describe,
}

#[derive(Subcommand)]
enum HookSubcommand {
    /// Install git hook
    Install,

    /// Remove git hook
    Remove,

    /// Check hook status
    Status,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    if let Err(e) = run(cli).await {
        eprintln!("❌ Error: {}", e);
        process::exit(1);
    }
}

async fn run(cli: Cli) -> Result<()> {
    // Check if git is installed
    if !utils::GitManager::is_git_installed() {
        return Err(error::GitAiError::GitNotInstalled);
    }

    // Check if in git repository
    if !utils::GitManager::is_in_git_repo()? {
        return Err(error::GitAiError::NotInGitRepo);
    }

    match cli.command {
        Some(Commands::Commit {
            yes,
            num,
            locale,
            agent,
            copilot,
        }) => commands::commit::run(yes, num, locale, agent, copilot).await,
        Some(Commands::Msg {
            num,
            json,
            quiet,
            locale,
        }) => commands::msg::run(num, json, quiet, locale).await,
        Some(Commands::Config {
            subcommand,
            local,
            global: _,
        }) => match subcommand {
            Some(ConfigSubcommand::Get { json: _, local }) => {
                commands::config::run(Some("get".to_string()), local).await
            }
            Some(ConfigSubcommand::Set {
                key: _,
                value: _,
                local,
            }) => commands::config::run(Some("set".to_string()), local).await,
            Some(ConfigSubcommand::Describe) => {
                commands::config::run(Some("describe".to_string()), false).await
            }
            None => commands::config::run(None, local).await,
        },
        Some(Commands::Hook { subcommand, global }) => match subcommand {
            HookSubcommand::Install => commands::hook::run("install".to_string(), global).await,
            HookSubcommand::Remove => commands::hook::run("remove".to_string(), global).await,
            HookSubcommand::Status => commands::hook::run("status".to_string(), global).await,
        },
        Some(Commands::Report {
            days,
            from_last_tag,
            from_tag,
            to_ref,
        }) => commands::report::run(days, from_last_tag, from_tag, to_ref).await,
        None => {
            // Default: interactive commit
            commands::commit::run(cli.yes, cli.num, cli.locale, cli.agent, cli.copilot).await
        }
    }
}
