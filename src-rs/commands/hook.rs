use crate::error::Result;
use std::fs;
use std::path::PathBuf;

pub async fn run(action: String, global: bool) -> Result<()> {
    match action.as_str() {
        "install" => run_install(global).await,
        "remove" => run_remove(global).await,
        "status" => run_status(global).await,
        _ => Err(crate::error::GitAiError::InvalidArgument(
            format!("Unknown hook action: {}", action),
        )),
    }
}

async fn run_install(global: bool) -> Result<()> {
    let hook_path = if global {
        get_global_hook_path()?
    } else {
        get_local_hook_path()?
    };

    // Create hook directory if needed
    if let Some(parent) = hook_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to create hook directory: {}", e)))?;
    }

    // Generate hook script (platform-specific)
    let hook_script = if cfg!(windows) {
        generate_hook_script_windows()
    } else {
        generate_hook_script_bash()
    };

    // Check if hook already exists
    if hook_path.exists() {
        let existing = fs::read_to_string(&hook_path)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to read existing hook: {}", e)))?;

        if existing.contains("git-ai") {
            println!("✅ Git hook already installed at {}", hook_path.display());
            return Ok(());
        }

        // Backup existing hook
        let backup_path = format!("{}.original", hook_path.display());
        fs::copy(&hook_path, &backup_path)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to backup hook: {}", e)))?;
        println!("📦 Backed up existing hook to {}", backup_path);
    }

    // Write hook script
    fs::write(&hook_path, hook_script)
        .map_err(|e| crate::error::GitAiError::Other(format!("Failed to write hook: {}", e)))?;

    // Make hook executable (Unix-like systems)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&hook_path, perms)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to make hook executable: {}", e)))?;
    }

    println!("✅ Git hook installed successfully at {}", hook_path.display());
    println!("   Hook will run before each commit to generate messages");

    Ok(())
}

async fn run_remove(global: bool) -> Result<()> {
    let hook_path = if global {
        get_global_hook_path()?
    } else {
        get_local_hook_path()?
    };

    if !hook_path.exists() {
        println!("ℹ️  Git hook not found at {}", hook_path.display());
        return Ok(());
    }

    // Check if there's a backup
    let backup_path = format!("{}.original", hook_path.display());
    if PathBuf::from(&backup_path).exists() {
        fs::copy(&backup_path, &hook_path)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to restore backup: {}", e)))?;
        fs::remove_file(&backup_path)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to remove backup: {}", e)))?;
        println!("✅ Git hook removed and original hook restored");
    } else {
        fs::remove_file(&hook_path)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to remove hook: {}", e)))?;
        println!("✅ Git hook removed successfully");
    }

    Ok(())
}

async fn run_status(global: bool) -> Result<()> {
    let hook_path = if global {
        get_global_hook_path()?
    } else {
        get_local_hook_path()?
    };

    if hook_path.exists() {
        let content = fs::read_to_string(&hook_path)
            .map_err(|e| crate::error::GitAiError::Other(format!("Failed to read hook: {}", e)))?;

        if content.contains("git-ai") {
            println!("✅ Git hook is installed at {}", hook_path.display());
            println!("   Type: prepare-commit-msg");
            println!("   Status: Active");
        } else {
            println!("⚠️  Hook exists but doesn't contain git-ai");
        }
    } else {
        println!("❌ Git hook is not installed");
        println!("   Run 'git-ai hook install' to install it");
    }

    Ok(())
}

fn get_local_hook_path() -> Result<PathBuf> {
    let git_dir = std::process::Command::new("git")
        .arg("rev-parse")
        .arg("--git-dir")
        .output()
        .map_err(|e| crate::error::GitAiError::Git(format!("Failed to get git dir: {}", e)))?;

    if !git_dir.status.success() {
        return Err(crate::error::GitAiError::NotInGitRepo);
    }

    let git_dir_str = String::from_utf8_lossy(&git_dir.stdout).trim().to_string();
    Ok(PathBuf::from(git_dir_str).join("hooks").join("prepare-commit-msg"))
}

fn get_global_hook_path() -> Result<PathBuf> {
    // Get git config core.hooksPath
    let output = std::process::Command::new("git")
        .arg("config")
        .arg("--global")
        .arg("core.hooksPath")
        .output()
        .map_err(|e| crate::error::GitAiError::Git(format!("Failed to get hooks path: {}", e)))?;

    if output.status.success() {
        let hooks_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !hooks_path.is_empty() {
            return Ok(PathBuf::from(hooks_path).join("prepare-commit-msg"));
        }
    }

    // Fallback to ~/.config/git-ai-cli/hooks
    let config_dir = dirs::config_dir()
        .ok_or_else(|| crate::error::GitAiError::Config("Cannot determine config directory".to_string()))?;
    Ok(config_dir.join("git-ai-cli").join("hooks").join("prepare-commit-msg"))
}

fn generate_hook_script_bash() -> String {
    r#"#!/bin/bash
# Git hook for git-ai-cli
# This hook automatically generates commit messages using AI

# Skip if disabled
if [ "$GIT_AI_DISABLED" = "1" ]; then
    exit 0
fi

# Skip if already running (recursion guard)
if [ "$GIT_AI_RUNNING" = "1" ]; then
    exit 0
fi

# Skip for merge commits
if grep -q "^Merge " "$1"; then
    exit 0
fi

# Skip for squash commits
if grep -q "^# This is a combination of" "$1"; then
    exit 0
fi

# Skip for amend commits
if grep -q "^# Please enter the commit message for your changes" "$1"; then
    exit 0
fi

# Skip if message already exists
if [ -s "$1" ] && ! grep -q "^# Please enter the commit message" "$1"; then
    exit 0
fi

# Generate message
export GIT_AI_RUNNING=1
MESSAGE=$(git-ai msg --quiet 2>/dev/null)

if [ -n "$MESSAGE" ]; then
    # Prepend generated message to commit file
    {
        echo "$MESSAGE"
        echo ""
        cat "$1"
    } > "$1.tmp"
    mv "$1.tmp" "$1"
fi

exit 0
"#.to_string()
}

fn generate_hook_script_windows() -> String {
    // Using concat! to avoid raw string issues with special characters
    [
        "@echo off\r\n",
        "REM Git hook for git-ai-cli\r\n",
        "REM This hook automatically generates commit messages using AI\r\n",
        "\r\n",
        "REM Skip if disabled\r\n",
        "if \"%GIT_AI_DISABLED%\"==\"1\" exit /b 0\r\n",
        "\r\n",
        "REM Skip if already running (recursion guard)\r\n",
        "if \"%GIT_AI_RUNNING%\"==\"1\" exit /b 0\r\n",
        "\r\n",
        "REM Skip for merge commits\r\n",
        "findstr /B /C:\"Merge \" \"%~1\" >nul 2>&1\r\n",
        "if %errorlevel%==0 exit /b 0\r\n",
        "\r\n",
        "REM Skip for squash commits\r\n",
        "findstr /B \"# This is a combination\" \"%~1\" >nul 2>&1\r\n",
        "if %errorlevel%==0 exit /b 0\r\n",
        "\r\n",
        "REM Skip for amend commits\r\n",
        "findstr /B \"# Please enter the commit message\" \"%~1\" >nul 2>&1\r\n",
        "if %errorlevel%==0 exit /b 0\r\n",
        "\r\n",
        "REM Check if message already exists\r\n",
        "for %%A in (\"%~1\") do set size=%%~zA\r\n",
        "if %size% gtr 0 (\r\n",
        "    findstr /B \"# Please enter the commit message\" \"%~1\" >nul 2>&1\r\n",
        "    if %errorlevel% neq 0 exit /b 0\r\n",
        ")\r\n",
        "\r\n",
        "REM Generate message\r\n",
        "set GIT_AI_RUNNING=1\r\n",
        "for /f \"delims=\" %%i in ('git-ai msg --quiet 2^>nul') do set MESSAGE=%%i\r\n",
        "\r\n",
        "if not \"%MESSAGE%\"==\"\" (\r\n",
        "    REM Prepend generated message to commit file\r\n",
        "    echo %MESSAGE%> \"%~1.tmp\"\r\n",
        "    echo.>> \"%~1.tmp\"\r\n",
        "    type \"%~1\" >> \"%~1.tmp\"\r\n",
        "    move /y \"%~1.tmp\" \"%~1\" >nul\r\n",
        ")\r\n",
        "\r\n",
        "exit /b 0\r\n",
    ].concat().to_string()
}
