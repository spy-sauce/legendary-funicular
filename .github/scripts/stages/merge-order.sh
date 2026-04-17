#!/usr/bin/env bash
# Stage: merge-order
# Purpose: Validate the cultivation plan via dry-run
# Contract: NUTRIENTS.md section 2 — DDPStageId "merge-order"
#
# Behavior:
#   - Runs `mycelium cultivate --dry-run` to print and validate the plan
#   - If mycelium CLI not found, exits with status 1 (failure)
#   - On success, exits 0
#   - On validation failure, exits 1

set -euo pipefail

echo "[merge-order] Validating cultivation plan..."

# Check if mycelium CLI is available
if ! command -v mycelium &>/dev/null; then
  # Try local node_modules path
  if [[ -x "./cli/dist/index.js" ]]; then
    MYCELIUM_CMD="node ./cli/dist/index.js"
  else
    echo "[merge-order] ERROR: mycelium CLI not found"
    exit 1
  fi
else
  MYCELIUM_CMD="mycelium"
fi

# Run dry-run to validate and print the plan
$MYCELIUM_CMD cultivate --dry-run

echo "[merge-order] Plan validated successfully"
exit 0
