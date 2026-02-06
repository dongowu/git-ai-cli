#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Detect platform and architecture
const platform = os.platform();
const arch = os.arch();

// Map Node.js platform/arch to our naming convention
const platformMap = {
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
  'win32-x64': 'win32-x64',
};

const key = `${platform}-${arch}`;
const platformKey = platformMap[key];

if (!platformKey) {
  console.error(`Unsupported platform: ${platform} ${arch}`);
  process.exit(1);
}

// Try to find the binary from the platform-specific package
const packageName = `@dongowu/git-ai-cli-${platformKey}`;
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
const binaryPath = path.join(nodeModulesPath, packageName, 'bin', 'git-ai');

// Check if binary exists
if (!fs.existsSync(binaryPath)) {
  console.warn(`Warning: Binary not found at ${binaryPath}`);
  console.warn(`Please ensure the ${packageName} package is installed.`);
  process.exit(1);
}

// Make binary executable on Unix-like systems
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(binaryPath, 0o755);
  } catch (err) {
    console.warn(`Warning: Could not make binary executable: ${err.message}`);
  }
}

console.log(`✅ git-ai binary installed for ${platformKey}`);
