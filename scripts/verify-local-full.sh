#!/usr/bin/env bash
set -euo pipefail

npm run supabase:start
npm run supabase:reset
npm run supabase:wait
npm run test:db
npm run supabase:lint
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run test:integration:coverage
npm run db:performance
npm run build
npm run test:e2e:build
npm run test:e2e
npm audit --audit-level=high

echo "Rebuilding the database a second time from empty local state..."
npm run supabase:reset
npm run supabase:wait
npm run test:db
npm run test:integration

echo "Local production-like verification completed successfully."
