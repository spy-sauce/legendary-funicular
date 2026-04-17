#!/usr/bin/env bash
# Stage: typecheck
# Purpose: Run TypeScript type checking
# Contract: NUTRIENTS.md section 2 — DDPStageId "typecheck"
#
# Behavior:
#   - Runs `npx tsc --noEmit` in cli/
#   - If tsc not available, exits 1 (failure — this is a TS project)
#   - On type errors, exits 1
#   - On success, exits 0

set -euo pipefail

CLI_DIR="${CLI_DIR:-./cli}"

echo "[typecheck] Running TypeScript type check..."

# Check if cli directory exists
if [[ ! -d "$CLI_DIR" ]]; then
  echo "[typecheck] ERROR: cli directory not found"
  exit 1
fi

cd "$CLI_DIR"

# Check if tsconfig exists
if [[ ! -f "tsconfig.json" ]]; then
  echo "[typecheck] ERROR: tsconfig.json not found"
  exit 1
fi

# Run type check
npx tsc --noEmit

echo "[typecheck] Type check passed"
exit 0
