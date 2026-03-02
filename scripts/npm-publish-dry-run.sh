#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGES=(
  "packages/photoverifier-sdk"
  "packages/photoverifier-seeker-sdk"
)

for dir in "${PACKAGES[@]}"; do
  echo "==> npm publish --dry-run ${dir}"
  (
    cd "$dir"
    npm publish --dry-run --access public
  )
done

echo "Publish dry-run complete."
