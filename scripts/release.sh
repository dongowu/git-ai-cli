#!/bin/bash
# release.sh - 自动发布脚本

set -e

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 获取版本类型
VERSION_TYPE=${1:-patch}

echo -e "${GREEN}🚀 Starting release...${NC}"

# 1. 构建
echo -e "${YELLOW}📦 Building...${NC}"
npm run build

# 2. 更新版本
echo -e "${YELLOW}📝 Bumping ${VERSION_TYPE} version...${NC}"
npm version $VERSION_TYPE

# 3. 推送到 GitHub
echo -e "${YELLOW}📤 Pushing to GitHub...${NC}"
git push
git push --tags

# 4. 发布到 npm
echo -e "${YELLOW}📦 Publishing to npm...${NC}"
read -p "Enter OTP code: " OTP
npm publish --access=public --otp=$OTP

echo -e "${GREEN}✅ Release complete!${NC}"
