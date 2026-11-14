#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

for migration in supabase/migrations/*.sql; do
  echo "Applying ${migration}"
  psql "${DATABASE_URL}" --set ON_ERROR_STOP=1 --file "${migration}"
done

echo "Supabase migrations applied."
