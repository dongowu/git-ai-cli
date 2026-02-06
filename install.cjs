#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

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

const key = platform + '-' + arch;
const platformKey = platformMap[key];
const npmjsRegistry = 'https://registry.npmjs.org/';

if (!platformKey) {
  console.error('Unsupported platform: ' + platform + ' ' + arch);
  process.exit(1);
}

// Try to find the binary from the platform-specific package
const packageName = '@dongowu/git-ai-cli-' + platformKey;
const nodeModulesPath = path.join(__dirname, 'node_modules');
const binaryName = platform === 'win32' ? 'git-ai.exe' : 'git-ai';
const binaryPath = path.join(nodeModulesPath, packageName, 'bin', binaryName);

function getRootPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkg.version;
  } catch (err) {
    console.warn('Warning: Failed to read package version: ' + err.message);
    return 'latest';
  }
}

function installPlatformPackageFromNpmjs(packageSpec) {
  const npmExecPath = process.env.npm_execpath;
  let command = 'npm';
  const args = [];

  if (npmExecPath && npmExecPath.endsWith('.js')) {
    command = process.execPath;
    args.push(npmExecPath);
  } else if (npmExecPath && fs.existsSync(npmExecPath)) {
    command = npmExecPath;
  }

  args.push(
    'install',
    '--no-save',
    '--no-package-lock',
    '--ignore-scripts',
    '--registry',
    npmjsRegistry,
    packageSpec
  );

  const result = spawnSync(command, args, {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  });

  return result.status === 0;
}

// Check if binary exists
if (!fs.existsSync(binaryPath)) {
  console.warn('Warning: Binary not found at ' + binaryPath);

  const packageVersion = getRootPackageVersion();
  const packageSpec = packageName + '@' + packageVersion;

  console.warn('Trying to install ' + packageSpec + ' from ' + npmjsRegistry + '...');

  const installed = installPlatformPackageFromNpmjs(packageSpec);
  if (!installed || !fs.existsSync(binaryPath)) {
    const detectedRegistry = process.env.npm_config_registry || 'unknown';
    console.error('Failed to install ' + packageSpec + '.');
    console.error('Detected npm registry: ' + detectedRegistry);
    console.error('Please retry with: npm install -g @dongowu/git-ai-cli --registry=' + npmjsRegistry);
    process.exit(1);
  }

  console.log('✅ Installed missing platform package: ' + packageSpec);
}

// Make binary executable on Unix-like systems
if (process.platform !== 'win32') {
  try {
    fs.chmodSync(binaryPath, 0o755);
  } catch (err) {
    console.warn('Warning: Could not make binary executable: ' + err.message);
  }
}

console.log('✅ git-ai binary installed for ' + platformKey);
