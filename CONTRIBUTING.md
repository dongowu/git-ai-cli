# Contributing to git-ai-cli

感谢你对 git-ai-cli 的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/your-username/git-ai-cli.git
cd git-ai-cli

# 安装依赖
npm install

# 开发模式（自动编译）
npm run dev

# 本地链接测试
npm link
```

## 项目结构

```
src/
├── cli.ts           # CLI 入口
├── types.ts         # 类型定义 & Provider 预设
├── commands/
│   ├── config.ts    # 配置命令
│   └── commit.ts    # 提交命令
└── utils/
    ├── config.ts    # 配置读写
    ├── git.ts       # Git 操作
    └── ai.ts        # AI 调用
```

## 添加新的 AI Provider

1. 在 `src/types.ts` 的 `PROVIDER_PRESETS` 中添加配置：

```typescript
yourprovider: {
  name: 'YourProvider (显示名称)',
  baseUrl: 'https://api.example.com/v1',
  defaultModel: 'model-name',
  requiresKey: true,
},
```

2. 确保该 Provider 兼容 OpenAI API 格式

## 提交规范

请使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具链

示例：
```
feat(provider): add Qwen support
fix(git): handle empty diff correctly
docs: update README with new providers
```

## Pull Request 流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feat/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feat/amazing-feature`)
5. 创建 Pull Request

## 问题反馈

- 使用 GitHub Issues 报告 Bug
- 提供复现步骤和环境信息
- 如有可能，附上错误日志

## 许可证

贡献的代码将采用 MIT 许可证。
