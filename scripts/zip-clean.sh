#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/_exports"
OUT_FILE="$OUT_DIR/webapptelegram-nina-clean.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.zip

cd "$ROOT"

zip -r "$OUT_FILE" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x ".git/*" \
  -x "_exports/*" \
  -x ".vercel/*" \
  -x ".turbo/*" \
  -x ".cache/*" \
  -x "supabase/.temp/*" \
  -x "supabase/.branches/*" \
  -x "app/__test__/*" \
  -x ".playwright-cli/*" \
  -x "coverage/*" \
  -x "coverage-integration/*" \
  -x "playwright-report/*" \
  -x "test-results/*" \
  -x "dist/*" \
  -x "out/*" \
  -x "build/*" \
  -x "*.zip" \
  -x "*.log" \
  -x "npm-debug.log*" \
  -x "yarn-debug.log*" \
  -x "yarn-error.log*" \
  -x ".env" \
  -x ".env.local" \
  -x ".env.production" \
  -x ".env.development" \
  -x ".env.*.local" \
  -x ".env 2.example" \
  -x ".DS_Store" \
  -x "**/.DS_Store" \
  -x "*.tsbuildinfo" \
  -x "__MACOSX/*" \
  -x "*/__MACOSX/*" \
  -x "._*" \
  -x "*/._*" \
  -x "* 2.*" \
  -x "* 2/*"

bash "$ROOT/scripts/verify-clean-zip.sh" "$OUT_FILE"

echo "$OUT_FILE"
