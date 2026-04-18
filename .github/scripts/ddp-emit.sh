#!/usr/bin/env bash
# ddp-emit.sh — DDP stage event emitter for mycelium CI/CD pipeline
#
# Writes ddp_stage_started/ddp_stage_ended events to the run JSONL.
# Uses jq if available, falls back to heredoc JSON otherwise.
# Never blocks the pipeline — errors are logged to stderr but don't exit non-zero.
#
# Usage:
#   ddp-emit.sh <stage-id> start
#   ddp-emit.sh <stage-id> end <success|failure|skipped>
#
# Environment:
#   GITHUB_RUN_ID      — (optional) GitHub Actions run ID
#   GITHUB_SERVER_URL  — (optional) GitHub server URL
#   GITHUB_REPOSITORY  — (optional) GitHub repository (owner/repo)
#
# Reads run_id from .mycelium/events/LATEST (written by telemetry-emitter)
# Writes one JSON line to .mycelium/events/<run_id>.jsonl
#
# Part of cicd.ddp.emit scope — do not modify event schema (frozen in NUTRIENTS.md §1)

set -o pipefail

# --- Constants ---
MYCELIUM_DIR=".mycelium"
EVENTS_DIR="${MYCELIUM_DIR}/events"
LATEST_FILE="${EVENTS_DIR}/LATEST"
STAGE_START_FILE="${EVENTS_DIR}/.ddp_stage_start"

# --- Helpers ---

log_error() {
  echo "[ddp-emit] ERROR: $*" >&2
}

log_info() {
  echo "[ddp-emit] $*" >&2
}

# Get ISO-8601 timestamp with milliseconds
get_timestamp() {
  if date --version >/dev/null 2>&1; then
    # GNU date (Linux)
    date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"
  else
    # BSD date (macOS) — no native ms support, use perl or fallback
    if command -v perl >/dev/null 2>&1; then
      perl -MTime::HiRes=gettimeofday -MPOSIX=strftime -e '
        my ($s, $us) = gettimeofday();
        my $ms = int($us / 1000);
        print strftime("%Y-%m-%dT%H:%M:%S", gmtime($s)) . sprintf(".%03dZ", $ms);
      '
    else
      # Fallback: no milliseconds
      date -u +"%Y-%m-%dT%H:%M:%SZ"
    fi
  fi
}

# Get current time in milliseconds since epoch
get_epoch_ms() {
  if date --version >/dev/null 2>&1; then
    # GNU date
    echo $(($(date +%s%N) / 1000000))
  else
    # BSD date — use perl for ms precision
    if command -v perl >/dev/null 2>&1; then
      perl -MTime::HiRes=gettimeofday -e 'my ($s, $us) = gettimeofday(); print int($s * 1000 + $us / 1000);'
    else
      # Fallback: seconds only
      echo $(($(date +%s) * 1000))
    fi
  fi
}

# Read run_id from LATEST file
get_run_id() {
  if [[ ! -f "$LATEST_FILE" ]]; then
    log_error "LATEST file not found at $LATEST_FILE"
    return 1
  fi
  cat "$LATEST_FILE"
}

# Get organism name from mycelium.yaml
get_organism() {
  local yaml_file="mycelium.yaml"
  if [[ ! -f "$yaml_file" ]]; then
    echo "unknown"
    return
  fi

  # Try yq, then grep fallback
  if command -v yq >/dev/null 2>&1; then
    yq -r '.organism.name // "unknown"' "$yaml_file" 2>/dev/null || echo "unknown"
  else
    # Simple grep fallback — looks for "name:" under organism section
    grep -A1 "^organism:" "$yaml_file" 2>/dev/null | grep "name:" | head -1 | sed 's/.*name:[[:space:]]*//' | tr -d '"' || echo "unknown"
  fi
}

# Build GitHub run URL if env vars present
get_gh_run_url() {
  if [[ -n "$GITHUB_SERVER_URL" && -n "$GITHUB_REPOSITORY" && -n "$GITHUB_RUN_ID" ]]; then
    echo "${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  fi
}

# Escape string for JSON (minimal: quotes and backslashes)
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"  # Escape backslashes first
  s="${s//\"/\\\"}"  # Escape quotes
  s="${s//$'\n'/\\n}" # Escape newlines
  s="${s//$'\r'/\\r}" # Escape carriage returns
  s="${s//$'\t'/\\t}" # Escape tabs
  echo "$s"
}

# Write event to JSONL file
# Args: run_id, kind, data_json
write_event() {
  local run_id="$1"
  local kind="$2"
  local data_json="$3"

  local event_file="${EVENTS_DIR}/${run_id}.jsonl"
  local ts
  ts=$(get_timestamp)
  local organism
  organism=$(get_organism)

  # Ensure events directory exists
  mkdir -p "$EVENTS_DIR"

  local event_json
  if command -v jq >/dev/null 2>&1; then
    # Use jq for proper JSON construction
    event_json=$(jq -cn \
      --argjson v 1 \
      --arg run_id "$run_id" \
      --arg organism "$organism" \
      --arg ts "$ts" \
      --arg kind "$kind" \
      --argjson data "$data_json" \
      '{v: $v, run_id: $run_id, organism: $organism, ts: $ts, kind: $kind, data: $data}'
    )
  else
    # Fallback: heredoc JSON (less safe but functional)
    event_json="{\"v\":1,\"run_id\":\"$(json_escape "$run_id")\",\"organism\":\"$(json_escape "$organism")\",\"ts\":\"$ts\",\"kind\":\"$kind\",\"data\":$data_json}"
  fi

  # Append atomically via temp file + cat >> (or echo >> for simplicity)
  echo "$event_json" >> "$event_file"

  log_info "Wrote $kind event to $event_file"
}

# --- Commands ---

emit_start() {
  local stage_id="$1"

  local run_id
  run_id=$(get_run_id) || {
    log_error "Cannot emit start: no run_id"
    return 0  # Don't block pipeline
  }

  # Record start time for wall_ms calculation
  local start_ms
  start_ms=$(get_epoch_ms)
  echo "${stage_id}:${start_ms}" >> "$STAGE_START_FILE"

  # Build data payload
  local data_json
  local gh_run_id="${GITHUB_RUN_ID:-}"
  local gh_run_url
  gh_run_url=$(get_gh_run_url)

  if command -v jq >/dev/null 2>&1; then
    # Use jq — conditionally include optional fields
    data_json=$(jq -cn \
      --arg stage_id "$stage_id" \
      --arg gh_run_id "$gh_run_id" \
      --arg gh_run_url "$gh_run_url" \
      '{stage_id: $stage_id} + (if $gh_run_id != "" then {gh_run_id: $gh_run_id} else {} end) + (if $gh_run_url != "" then {gh_run_url: $gh_run_url} else {} end)'
    )
  else
    # Heredoc fallback
    data_json="{\"stage_id\":\"$(json_escape "$stage_id")\""
    if [[ -n "$gh_run_id" ]]; then
      data_json+=",\"gh_run_id\":\"$(json_escape "$gh_run_id")\""
    fi
    if [[ -n "$gh_run_url" ]]; then
      data_json+=",\"gh_run_url\":\"$(json_escape "$gh_run_url")\""
    fi
    data_json+="}"
  fi

  write_event "$run_id" "ddp_stage_started" "$data_json"
}

emit_end() {
  local stage_id="$1"
  local status="$2"

  # Validate status
  case "$status" in
    success|failure|skipped) ;;
    *)
      log_error "Invalid status '$status' — must be success|failure|skipped"
      status="failure"
      ;;
  esac

  local run_id
  run_id=$(get_run_id) || {
    log_error "Cannot emit end: no run_id"
    return 0  # Don't block pipeline
  }

  # Calculate wall_ms from start time
  local end_ms
  end_ms=$(get_epoch_ms)
  local wall_ms=0

  if [[ -f "$STAGE_START_FILE" ]]; then
    local start_line
    start_line=$(grep "^${stage_id}:" "$STAGE_START_FILE" | tail -1)
    if [[ -n "$start_line" ]]; then
      local start_ms="${start_line#*:}"
      wall_ms=$((end_ms - start_ms))
      # Clean up: remove this stage's entry
      grep -v "^${stage_id}:" "$STAGE_START_FILE" > "${STAGE_START_FILE}.tmp" 2>/dev/null || true
      mv "${STAGE_START_FILE}.tmp" "$STAGE_START_FILE" 2>/dev/null || true
    fi
  fi

  # Ensure wall_ms is non-negative
  if [[ $wall_ms -lt 0 ]]; then
    wall_ms=0
  fi

  # Build data payload
  local data_json
  local logs_url
  logs_url=$(get_gh_run_url)

  if command -v jq >/dev/null 2>&1; then
    data_json=$(jq -cn \
      --arg stage_id "$stage_id" \
      --arg status "$status" \
      --argjson wall_ms "$wall_ms" \
      --arg logs_url "$logs_url" \
      '{stage_id: $stage_id, status: $status, wall_ms: $wall_ms} + (if $logs_url != "" then {logs_url: $logs_url} else {} end)'
    )
  else
    # Heredoc fallback
    data_json="{\"stage_id\":\"$(json_escape "$stage_id")\",\"status\":\"$status\",\"wall_ms\":$wall_ms"
    if [[ -n "$logs_url" ]]; then
      data_json+=",\"logs_url\":\"$(json_escape "$logs_url")\""
    fi
    data_json+="}"
  fi

  write_event "$run_id" "ddp_stage_ended" "$data_json"
}

# --- Main ---

main() {
  local stage_id="${1:-}"
  local command="${2:-}"

  if [[ -z "$stage_id" || -z "$command" ]]; then
    echo "Usage: $0 <stage-id> start" >&2
    echo "       $0 <stage-id> end <success|failure|skipped>" >&2
    echo "" >&2
    echo "Valid stage-ids: merge-order, lint, typecheck, test, build, deploy-stg, smoke, deploy-prod" >&2
    exit 1
  fi

  # Validate stage_id against frozen DDP_STAGES (NUTRIENTS.md §2)
  case "$stage_id" in
    merge-order|lint|typecheck|test|build|deploy-stg|smoke|deploy-prod) ;;
    *)
      log_error "Unknown stage-id '$stage_id' — not in DDP_STAGES"
      # Continue anyway to not block pipeline, but log warning
      ;;
  esac

  case "$command" in
    start)
      emit_start "$stage_id"
      ;;
    end)
      local status="${3:-failure}"
      emit_end "$stage_id" "$status"
      ;;
    *)
      log_error "Unknown command '$command' — use 'start' or 'end'"
      exit 1
      ;;
  esac
}

# Run main unless sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
