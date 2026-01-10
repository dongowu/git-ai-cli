import inquirer from 'inquirer';
import chalk from 'chalk';
import { setConfig, getConfigPath } from '../utils/config.js';
import { PROVIDER_PRESETS, type AIConfig } from '../types.js';

export async function runConfig(): Promise<void> {
  console.log(chalk.cyan('\n🔧 Git AI Configuration\n'));

  const providerChoices = Object.entries(PROVIDER_PRESETS).map(([key, preset]) => ({
    name: preset.name,
    value: key,
  }));

  const { provider } = await inquirer.prompt<{ provider: string }>([
    {
      type: 'list',
      name: 'provider',
      message: 'Select your AI provider:',
      choices: providerChoices,
    },
  ]);

  const preset = PROVIDER_PRESETS[provider];
  let baseUrl = preset.baseUrl;
  let apiKey = '';

  if (provider === 'custom') {
    const customAnswers = await inquirer.prompt<{ baseUrl: string }>([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Enter the API base URL:',
        validate: (input: string) =>
          input.trim() ? true : 'Base URL is required',
      },
    ]);
    baseUrl = customAnswers.baseUrl;
  }

  if (preset.requiresKey) {
    const keyAnswer = await inquirer.prompt<{ apiKey: string }>([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your API Key:',
        mask: '*',
        validate: (input: string) =>
          input.trim() ? true : 'API Key is required',
      },
    ]);
    apiKey = keyAnswer.apiKey;
  }

  const { model } = await inquirer.prompt<{ model: string }>([
    {
      type: 'input',
      name: 'model',
      message: 'Enter the model name:',
      default: preset.defaultModel,
    },
  ]);

  const { locale } = await inquirer.prompt<{ locale: 'zh' | 'en' }>([
    {
      type: 'list',
      name: 'locale',
      message: 'Select output language for commit messages:',
      choices: [
        { name: 'English', value: 'en' },
        { name: '中文', value: 'zh' },
      ],
    },
  ]);

  const { configurePrompt } = await inquirer.prompt<{ configurePrompt: boolean }>([
    {
      type: 'confirm',
      name: 'configurePrompt',
      message: 'Would you like to configure a custom system prompt?',
      default: false,
    },
  ]);

  let customPrompt: string | undefined;
  if (configurePrompt) {
    const promptAnswer = await inquirer.prompt<{ customPrompt: string }>([
      {
        type: 'editor',
        name: 'customPrompt',
        message: 'Enter your custom system prompt:',
      },
    ]);
    customPrompt = promptAnswer.customPrompt.trim() || undefined;
  }

  const config: AIConfig = {
    provider,
    apiKey,
    baseUrl,
    model,
    locale,
    customPrompt,
  };

  setConfig(config);

  console.log(chalk.green('\n✅ Configuration saved successfully!'));
  console.log(chalk.gray(`   Config file: ${getConfigPath()}`));
  console.log(chalk.cyan('\n💡 You can now use `git-ai` to generate commit messages.\n'));
}
