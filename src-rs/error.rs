use thiserror::Error;

#[derive(Error, Debug)]
pub enum GitAiError {
    #[error("Git error: {0}")]
    Git(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("AI error: {0}")]
    Ai(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Not in git repository")]
    NotInGitRepo,

    #[error("Git not installed")]
    GitNotInstalled,

    #[error("No staged changes")]
    NoStagedChanges,

    #[error("User cancelled operation")]
    UserCancelled,

    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, GitAiError>;
