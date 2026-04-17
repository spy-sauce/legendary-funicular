#!/usr/bin/env bash
# Stage: lint
# Purpose: Run linting if configured
# Contract: NUTRIENTS.md section 2 — DDPStageId "lint"
#
# Behavior:
#   - Checks if `npm run lint` script exists in cli/package.json
#   - If script exists, runs it — exit code determines success/failure
#   - If script missing, echoes "skipped" and exits 0 (telemetry marks as "skipped")

set -euo pipefail

CLI_DIR="${CLI_DIR:-./cli}"

echo "[lint] Checking for lint script..."

# Check if cli directory exists
if [[ ! -d "$CLI_DIR" ]]; then
  echo "[lint] skipped: cli directory not found"
  exit 0
fi

cd "$CLI_DIR"

# Check if package.json exists and has a lint script
if [[ ! -f "package.json" ]]; then
  echo "[lint] skipped: no package.json found"
  exit 0
fi

# Use node to check if lint script exists (more reliable than grep)
if ! node -e "const p = require('./package.json'); process.exit(p.scripts && p.scripts.lint ? 0 : 1)" 2>/dev/null; then
  echo "[lint] skipped: no lint script configured"
  exit 0
fi

echo "[lint] Running npm run lint..."
npm run lint

echo "[lint] Linting passed"
exit 0
