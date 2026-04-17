#!/usr/bin/env bash
# Stage: test
# Purpose: Run test suite if configured
# Contract: NUTRIENTS.md section 2 — DDPStageId "test"
#
# Behavior:
#   - Checks if `npm test` script exists in cli/package.json
#   - If script exists, runs it — exit code determines success/failure
#   - If script missing, echoes "skipped" and exits 0 (telemetry marks as "skipped")
#
# Note: Per NUTRIENTS.md section 12, this repo has no test framework.
#       This script gracefully handles that by skipping.

set -euo pipefail

CLI_DIR="${CLI_DIR:-./cli}"

echo "[test] Checking for test script..."

# Check if cli directory exists
if [[ ! -d "$CLI_DIR" ]]; then
  echo "[test] skipped: cli directory not found"
  exit 0
fi

cd "$CLI_DIR"

# Check if package.json exists
if [[ ! -f "package.json" ]]; then
  echo "[test] skipped: no package.json found"
  exit 0
fi

# Use node to check if test script exists and is not the default npm error
TEST_SCRIPT=$(node -e "const p = require('./package.json'); console.log(p.scripts && p.scripts.test || '')" 2>/dev/null || echo "")

if [[ -z "$TEST_SCRIPT" ]]; then
  echo "[test] skipped: no test script configured"
  exit 0
fi

# Check if test script is the default npm "Error: no test specified"
if [[ "$TEST_SCRIPT" == *"no test specified"* ]] || [[ "$TEST_SCRIPT" == *"Error:"* ]]; then
  echo "[test] skipped: test script is npm default placeholder"
  exit 0
fi

echo "[test] Running npm test..."
npm test

echo "[test] Tests passed"
exit 0
