#!/bin/bash
set -e

VERSION=$1

if [ -z "$VERSION" ]; then
    echo "Usage: ./release.sh <version>"
    echo "Example: ./release.sh 1.0.197"
    exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid version format. Use semver: X.Y.Z"
    exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo ""
echo "🚀 Releasing nanocode v$VERSION"
echo ""

# Platforms
PLATFORMS=(
    "nanocode-linux-x64"
    "nanocode-linux-arm64"
    "nanocode-darwin-x64"
    "nanocode-darwin-arm64"
    "nanocode-windows-x64"
)

# Step 1: Update package.json version
echo "📝 Updating package.json version..."
tmp=$(mktemp)
jq --arg v "$VERSION" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json

# Step 2: Build all platforms
echo ""
echo "🔨 Building all platforms..."
bun run script/build.ts

# Step 3: Create dist/package.json for npm publish
echo ""
echo "📦 Creating publishable package.json..."

OPTIONAL_DEPS=""
for p in "${PLATFORMS[@]}"; do
    if [ -n "$OPTIONAL_DEPS" ]; then
        OPTIONAL_DEPS="$OPTIONAL_DEPS,"
    fi
    OPTIONAL_DEPS="$OPTIONAL_DEPS\"$p\": \"$VERSION\""
done

cat > dist/package.json <<EOF
{
  "name": "nanocode",
  "version": "$VERSION",
  "description": "AI-powered coding agent using NanoGPT",
  "author": "0xGingi",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/nanogpt-community/nanocode"
  },
  "homepage": "https://nano-gpt.com",
  "keywords": [
    "ai",
    "coding",
    "agent",
    "nanogpt",
    "nanocode",
    "cli",
    "llm"
  ],
  "bin": {
    "nanocode": "./bin/nanocode"
  },
  "files": [
    "bin"
  ],
  "optionalDependencies": {
    $OPTIONAL_DEPS
  }
}
EOF

# Step 4: Copy bin folder to dist
echo "📁 Copying bin folder..."
cp -r bin dist/

# Step 5: Update platform package.json versions
echo "📝 Updating platform package versions..."
for platform in "${PLATFORMS[@]}"; do
    pkg_path="dist/$platform/package.json"
    if [ -f "$pkg_path" ]; then
        tmp=$(mktemp)
        jq --arg v "$VERSION" '.version = $v' "$pkg_path" > "$tmp" && mv "$tmp" "$pkg_path"
    fi
done

# Step 6: Publish platform binaries
echo ""
echo "📤 Publishing platform binaries to npm..."
echo "   (You may need to authenticate in browser)"
echo ""

for platform in "${PLATFORMS[@]}"; do
    platform_dir="dist/$platform"
    if [ -d "$platform_dir" ]; then
        echo "   Publishing $platform..."
        (cd "$platform_dir" && npm publish --access public) || true
        echo "   ✅ $platform@$VERSION published (or checked)"
    fi
done

# Step 7: Publish main package
echo ""
echo "📤 Publishing main package..."
(cd dist && npm publish --access public) || true
echo "✅ nanocode@$VERSION published (or checked)!"

echo ""
echo "✨ Release complete!"
echo ""
echo "Install with:"
echo "  npm i -g nanocode@$VERSION"
echo "  # or"
echo "  bun i -g nanocode@$VERSION"
echo ""
