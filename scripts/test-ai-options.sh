#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ai_test_dir=$(mktemp -d)
trap 'rm -rf "$ai_test_dir"' EXIT
pnpm --dir workers exec tsc --project tsconfig.json --noEmit false --module commonjs --moduleResolution node --outDir "$ai_test_dir"
node "$ai_test_dir/workers/src/exam.test.js"
node "$ai_test_dir/workers/src/export.test.js"
node scripts/test-ai-options.cjs "$ai_test_dir"
cargo test -p exameow-core --test ai_options
