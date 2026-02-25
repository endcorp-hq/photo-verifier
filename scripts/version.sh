#!/bin/bash
# Version management script for Citizen Science SDK
# Usage: ./scripts/version.sh <major|minor|patch>

set -e

# Get current version from core package
CURRENT_VERSION=$(node -p "require('./packages/core/package.json').version")

# Parse version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"

# Update based on argument
case "$1" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Usage: $0 <major|minor|patch>"
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION"

# Update all package.json files
for pkg in packages/core packages/blockchain packages/photoverifier-sdk; do
  if [ -f "$pkg/package.json" ]; then
    node -i -e "const pkg = require('./$pkg/package.json'); pkg.version = '$NEW_VERSION'; console.log(JSON.stringify(pkg, null, 2))" > "$pkg/package.json.tmp" && mv "$pkg/package.json.tmp" "$pkg/package.json"
    echo "Updated $pkg/package.json"
  fi
done

# Update on-chain Anchor programs
for prog in on-chain/photo-verifier on-chain/photo-proof-compressed; do
  if [ -f "$prog/programs/photo-verifier/Cargo.toml" ]; then
    sed -i '' "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$prog/programs/photo-verifier/Cargo.toml"
    echo "Updated $prog/Cargo.toml"
  fi
done

echo "Version updated to $NEW_VERSION"
echo "Don't forget to:"
echo "  1. git add -A"
echo "  2. git commit -m 'chore: bump version to $NEW_VERSION'"
echo "  3. git tag v$NEW_VERSION"
echo "  4. git push --follow-tags"
