export interface AIConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  locale: 'zh' | 'en';
  customPrompt?: string;
}

export interface ProviderPreset {
  name: string;
  baseUrl: string;
  defaultModel: string;
  requiresKey: boolean;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  // 国内大模型 (推荐)
  deepseek: {
    name: 'DeepSeek (深度求索)',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
  },
  qwen: {
    name: 'Qwen (通义千问)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    requiresKey: true,
  },
  zhipu: {
    name: 'Zhipu (智谱 GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    requiresKey: true,
  },
  moonshot: {
    name: 'Moonshot (月之暗面 Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    requiresKey: true,
  },
  baichuan: {
    name: 'Baichuan (百川)',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    defaultModel: 'Baichuan4',
    requiresKey: true,
  },
  yi: {
    name: 'Yi (零一万物)',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    defaultModel: 'yi-lightning',
    requiresKey: true,
  },
  // 国际大模型
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
  },
  silicon: {
    name: 'SiliconFlow (硅基流动)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    requiresKey: true,
  },
  // 本地部署
  ollama: {
    name: 'Ollama (本地部署)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:7b',
    requiresKey: false,
  },
  lmstudio: {
    name: 'LM Studio (本地部署)',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    requiresKey: false,
  },
  // 自定义
  custom: {
    name: 'Custom (自定义)',
    baseUrl: '',
    defaultModel: '',
    requiresKey: true,
  },
};

export const DIFF_BLACKLIST = [
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '*.min.js',
  '*.min.css',
  '*.map',
  'dist/',
  'build/',
  '.next/',
];

export const MAX_DIFF_LENGTH = 5000;
