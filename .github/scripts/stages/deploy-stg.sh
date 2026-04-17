#!/usr/bin/env bash
# ============================================================================
# deploy-stg.sh — Staging deployment hook for DDP pipeline
# ============================================================================
# This is a PLACEHOLDER script. To implement actual staging deployment:
#
#   1. Create .github/hooks/deploy-stg.sh in your repository
#   2. Make it executable (chmod +x)
#   3. This script will detect and execute your hook automatically
#
# Your hook script receives these environment variables:
#   - MYCELIUM_RUN_ID       — Unique run identifier for telemetry
#   - MYCELIUM_ORGANISM     — Organism name from mycelium.yaml
#   - GITHUB_SHA            — Git commit SHA being deployed
#   - GITHUB_REF            — Git ref (branch/tag) being deployed
#
# Exit codes:
#   0 = success (stage passes)
#   1 = failure (stage fails, pipeline stops)
#
# Example hook (.github/hooks/deploy-stg.sh):
#   #!/usr/bin/env bash
#   set -euo pipefail
#   echo "Deploying ${GITHUB_SHA:0:7} to staging..."
#   kubectl apply -k overlays/staging/
#   echo "Staging deployment complete."
# ============================================================================

set -euo pipefail

HOOK_PATH=".github/hooks/deploy-stg.sh"

if [[ -x "$HOOK_PATH" ]]; then
    echo "[deploy-stg] Executing user hook: $HOOK_PATH"
    exec "$HOOK_PATH"
else
    echo "[deploy-stg] skipped: no deploy hook configured"
    echo "[deploy-stg] To enable, create: $HOOK_PATH"
    exit 0
fi
