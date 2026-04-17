#!/usr/bin/env bash
# ============================================================================
# deploy-prod.sh — Production deployment hook for DDP pipeline
# ============================================================================
# This is a PLACEHOLDER script with an additional safety gate.
#
# SAFETY GATE: Production deployment requires explicit opt-in via:
#   MYCELIUM_ALLOW_PROD=true
#
# Without this environment variable, the script exits with "skipped" status.
# This prevents accidental production deployments.
#
# To implement actual production deployment:
#
#   1. Create .github/hooks/deploy-prod.sh in your repository
#   2. Make it executable (chmod +x)
#   3. Set MYCELIUM_ALLOW_PROD=true in your workflow/environment
#   4. This script will detect and execute your hook automatically
#
# Your hook script receives these environment variables:
#   - MYCELIUM_RUN_ID       — Unique run identifier for telemetry
#   - MYCELIUM_ORGANISM     — Organism name from mycelium.yaml
#   - MYCELIUM_ALLOW_PROD   — Will always be "true" when hook is called
#   - GITHUB_SHA            — Git commit SHA being deployed
#   - GITHUB_REF            — Git ref (branch/tag) being deployed
#
# Exit codes:
#   0 = success (production deployment complete)
#   1 = failure (deployment failed)
#
# Example hook (.github/hooks/deploy-prod.sh):
#   #!/usr/bin/env bash
#   set -euo pipefail
#   echo "Deploying ${GITHUB_SHA:0:7} to production..."
#   kubectl apply -k overlays/production/
#   kubectl rollout status deployment/myapp -n production --timeout=5m
#   echo "Production deployment complete."
#
# Workflow integration example (GitHub Actions):
#   - name: Deploy to production
#     env:
#       MYCELIUM_ALLOW_PROD: ${{ github.event.inputs.deploy_prod == 'true' }}
#     run: .github/scripts/stages/deploy-prod.sh
#
# For manual approval gates, use GitHub Environments with protection rules.
# ============================================================================

set -euo pipefail

HOOK_PATH=".github/hooks/deploy-prod.sh"

# Safety gate: require explicit opt-in for production deployment
if [[ "${MYCELIUM_ALLOW_PROD:-}" != "true" ]]; then
    echo "[deploy-prod] skipped: MYCELIUM_ALLOW_PROD is not set to 'true'"
    echo "[deploy-prod] Production deployment requires explicit opt-in."
    echo "[deploy-prod] Set MYCELIUM_ALLOW_PROD=true to enable."
    exit 0
fi

if [[ -x "$HOOK_PATH" ]]; then
    echo "[deploy-prod] MYCELIUM_ALLOW_PROD=true, executing user hook: $HOOK_PATH"
    exec "$HOOK_PATH"
else
    echo "[deploy-prod] skipped: no deploy hook configured"
    echo "[deploy-prod] To enable, create: $HOOK_PATH"
    exit 0
fi
