#!/usr/bin/env bash
# Stage: build
# Purpose: Build the CLI and verify output
# Contract: NUTRIENTS.md section 2 — DDPStageId "build"
#
# Behavior:
#   - Runs `npm run build` in cli/
#   - Verifies `dist/index.js` exists after build
#   - On build failure or missing output, exits 1
#   - On success, exits 0

set -euo pipefail

CLI_DIR="${CLI_DIR:-./cli}"

echo "[build] Building CLI..."

# Check if cli directory exists
if [[ ! -d "$CLI_DIR" ]]; then
  echo "[build] ERROR: cli directory not found"
  exit 1
fi

cd "$CLI_DIR"

# Check if package.json exists
if [[ ! -f "package.json" ]]; then
  echo "[build] ERROR: package.json not found"
  exit 1
fi

# Run build
npm run build

# Verify output exists (per NUTRIENTS.md section 12)
if [[ ! -f "dist/index.js" ]]; then
  echo "[build] ERROR: dist/index.js not found after build"
  exit 1
fi

echo "[build] Build successful — dist/index.js exists"
exit 0
