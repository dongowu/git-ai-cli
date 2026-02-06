#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

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
  console.error(`Error: Unsupported platform: ${platform} ${arch}`);
  process.exit(1);
}

// Find the binary from the platform-specific package
const packageName = `@dongowu/git-ai-cli-${platformKey}`;
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
const binaryName = platform === 'win32' ? 'git-ai.exe' : 'git-ai';
const binaryPath = path.join(nodeModulesPath, packageName, 'bin', binaryName);

// Check if binary exists
if (!fs.existsSync(binaryPath)) {
  console.error(`Error: Binary not found at ${binaryPath}`);
  console.error(`Please ensure the ${packageName} package is installed.`);
  process.exit(1);
}

// Spawn the binary with all arguments
const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  shell: false,
});

// Forward exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle errors
child.on('error', (err) => {
  console.error(`Error executing binary: ${err.message}`);
  process.exit(1);
});
