#!/bin/bash
# Local publish script for testing npm package installation

set -e

echo "Building Rust binary..."
cargo build --release

echo "Copying binary to platform package..."
PLATFORM=""
BINARY=""

case "$(uname -s)" in
  Linux*)
    PLATFORM="linux-x64"
    BINARY="git-ai"
    ;;
  Darwin*)
    if [ "$(uname -m)" = "arm64" ]; then
      PLATFORM="darwin-arm64"
    else
      PLATFORM="darwin-x64"
    fi
    BINARY="git-ai"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="win32-x64"
    BINARY="git-ai.exe"
    ;;
  *)
    echo "Unsupported platform"
    exit 1
    ;;
esac

echo "Platform: $PLATFORM"

# Copy binary to platform package
mkdir -p npm-platform/$PLATFORM/bin
cp target/release/$BINARY npm-platform/$PLATFORM/bin/

echo "Publishing platform package locally..."
cd npm-platform/$PLATFORM
npm pack
cd ../..

echo "Publishing main package locally..."
cd npm
npm pack
cd ..

echo ""
echo "✅ Packages created successfully!"
echo ""
echo "To test installation:"
echo "  npm install -g ./npm-platform/$PLATFORM/*.tgz"
echo "  npm install -g ./npm/*.tgz"
echo ""
echo "Or test locally:"
echo "  cd npm && npm link"
