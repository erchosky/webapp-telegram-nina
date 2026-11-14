#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_FILE="${1:-$ROOT/_exports/webapptelegram-nina-clean.zip}"

if [[ ! -f "$ZIP_FILE" ]]; then
  echo "ZIP not found: $ZIP_FILE" >&2
  exit 1
fi

FORBIDDEN_PATHS='(^|/)(node_modules|\.next|\.git|\.vercel|\.turbo|\.cache|\.temp|\.branches|coverage|coverage-integration|playwright-report|test-results|dist|out|build|__MACOSX)/|(^|/)\._|(^|/)\.env$|(^|/)\.env\.local$|(^|/)\.env\.[^/]+$|(^|/)\.DS_Store$|\.tsbuildinfo$| 2(\.|/)'
if unzip -Z1 "$ZIP_FILE" \
  | grep -E "$FORBIDDEN_PATHS" \
  | grep -Ev '(^|/)\.env\.example$' >/tmp/miniapp-forbidden-paths.txt; then
  echo "ZIP contains forbidden paths:" >&2
  cat /tmp/miniapp-forbidden-paths.txt >&2
  rm -f /tmp/miniapp-forbidden-paths.txt
  exit 1
fi
rm -f /tmp/miniapp-forbidden-paths.txt

SECRET_PATTERNS='sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|[0-9]{5,}:[A-Za-z0-9_-]{30,}'
if unzip -p "$ZIP_FILE" 2>/dev/null | LC_ALL=C grep -E "$SECRET_PATTERNS" >/tmp/miniapp-secret-hits.txt; then
  echo "ZIP may contain token-like secrets:" >&2
  cat /tmp/miniapp-secret-hits.txt >&2
  rm -f /tmp/miniapp-secret-hits.txt
  exit 1
fi
rm -f /tmp/miniapp-secret-hits.txt

if ! unzip -Z1 "$ZIP_FILE" | grep -Fx "FINAL_REPORT.md" >/dev/null; then
  echo "ZIP does not contain FINAL_REPORT.md" >&2
  exit 1
fi

echo "ZIP limpio verificado: $ZIP_FILE"
