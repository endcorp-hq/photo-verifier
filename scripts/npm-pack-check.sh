#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PACKAGES=(
  "@photoverifier/sdk:packages/photoverifier-sdk"
  "@photoverifier/seeker-sdk:packages/photoverifier-seeker-sdk"
)

for entry in "${PACKAGES[@]}"; do
  name="${entry%%:*}"
  dir="${entry##*:}"
  echo "==> Building ${name}"
  pnpm --filter "${name}" build >/dev/null

  echo "==> npm pack --dry-run ${name}"
  pack_json="$(cd "${dir}" && npm pack --dry-run --json)"
  echo "${pack_json}" | node -e '
const fs = require("fs");
const raw = fs.readFileSync(0, "utf8");
const arr = JSON.parse(raw);
if (!Array.isArray(arr) || !arr[0] || !Array.isArray(arr[0].files)) {
  throw new Error("Invalid npm pack --json output");
}
const files = arr[0].files.map((f) => f.path);
const blocked = files.filter((p) =>
  /(^|\/)node_modules\//.test(p) ||
  /(^|\/)\.env/.test(p) ||
  /(^|\/).*secret/i.test(p) ||
  /(^|\/)id\.json$/.test(p) ||
  /\.(pem|key)$/i.test(p)
);
if (blocked.length) {
  console.error("Blocked files detected in tarball:\n" + blocked.join("\n"));
  process.exit(1);
}
console.log(`Tarball file count: ${files.length}`);
console.log(files.join("\n"));
'

done

echo "Pack check complete."
