#!/usr/bin/env bash
# ============================================================================
# smoke.sh — Smoke test hook for DDP pipeline (post-staging deployment)
# ============================================================================
# This is a PLACEHOLDER script. To implement actual smoke tests:
#
#   1. Create .github/hooks/smoke.sh in your repository
#   2. Make it executable (chmod +x)
#   3. This script will detect and execute your hook automatically
#
# Your hook script receives these environment variables:
#   - MYCELIUM_RUN_ID       — Unique run identifier for telemetry
#   - MYCELIUM_ORGANISM     — Organism name from mycelium.yaml
#   - GITHUB_SHA            — Git commit SHA being tested
#   - GITHUB_REF            — Git ref (branch/tag) being tested
#
# Smoke tests should:
#   - Hit critical endpoints on staging
#   - Verify basic functionality
#   - Run quickly (< 5 minutes recommended)
#   - Fail fast on critical issues
#
# Exit codes:
#   0 = success (all smoke tests pass, safe to proceed to prod)
#   1 = failure (smoke tests failed, do not proceed to prod)
#
# Example hook (.github/hooks/smoke.sh):
#   #!/usr/bin/env bash
#   set -euo pipefail
#   STAGING_URL="${STAGING_URL:-https://staging.example.com}"
#   echo "Running smoke tests against $STAGING_URL..."
#   curl -sf "$STAGING_URL/health" || exit 1
#   curl -sf "$STAGING_URL/api/status" | jq -e '.ok == true' || exit 1
#   echo "Smoke tests passed."
# ============================================================================

set -euo pipefail

HOOK_PATH=".github/hooks/smoke.sh"

if [[ -x "$HOOK_PATH" ]]; then
    echo "[smoke] Executing user hook: $HOOK_PATH"
    exec "$HOOK_PATH"
else
    echo "[smoke] skipped: no smoke test hook configured"
    echo "[smoke] To enable, create: $HOOK_PATH"
    exit 0
fi
