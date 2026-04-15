#!/usr/bin/env bash
# ============================================
# DNS Migration - Shared Utilities
# ============================================

# --- Colors (matching deploy.sh) ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Globals ---
FORCE_MODE=false
MIGRATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$MIGRATION_DIR/backups"
STATE_FILE="$BACKUP_DIR/.migration-state"
ROOT_DIR="$(cd "$MIGRATION_DIR/../.." && pwd)"

# --- Cloudflare Constants ---
CF_ZONE_ID="c8d99edfbd0d36b58a247ea7c4f49a63"
CF_ACCOUNT_ID="2ded5f54d55033ec99a15cf99bccc972"
CF_API_BASE="https://api.cloudflare.com/client/v4"
CF_API_TOKEN=""

# --- Domain Constants ---
DOMAIN="neramclasses.com"
PRODUCTION_SUBDOMAINS=("@" "www" "app" "nexus" "admin")
STAGING_SUBDOMAINS=("staging" "staging-app" "staging-nexus" "staging-admin")
WORKER_SUBDOMAINS=("db" "db-staging")
ALL_FQDNS=(
  "neramclasses.com"
  "www.neramclasses.com"
  "app.neramclasses.com"
  "nexus.neramclasses.com"
  "admin.neramclasses.com"
  "staging.neramclasses.com"
  "staging-app.neramclasses.com"
  "staging-nexus.neramclasses.com"
  "staging-admin.neramclasses.com"
  "db.neramclasses.com"
  "db-staging.neramclasses.com"
)

# ============================================
# Logging Functions
# ============================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
  echo -e "\n${BOLD}${CYAN}>>> $1${NC}\n"
}

log_header() {
  echo -e "\n${BOLD}============================================${NC}"
  echo -e "${BOLD} $1${NC}"
  echo -e "${BOLD}============================================${NC}\n"
}

# ============================================
# JSON Parsing (via Node.js, no jq on Windows)
# ============================================

# Usage: echo "$json" | json_get "o.result.id"
# The expression receives the parsed object as 'o'
json_get() {
  local path="$1"
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const o=JSON.parse(d);
        const v=${path};
        if(v===undefined||v===null){process.stdout.write('');process.exit(0)}
        process.stdout.write(typeof v==='object'?JSON.stringify(v,null,2):String(v));
      } catch(e) {
        process.stderr.write('JSON parse error: '+e.message+'\n');
        process.exit(1);
      }
    });
  "
}

# Usage: echo "$json" | json_array_length "o.result"
json_array_length() {
  local path="$1"
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const o=JSON.parse(d);
        const v=${path};
        process.stdout.write(String(Array.isArray(v)?v.length:0));
      } catch(e) {
        process.stdout.write('0');
      }
    });
  "
}

# Usage: echo "$json_array" | json_iterate "console.log(item.name)"
# Iterates over a JSON array, each element available as 'item'
json_iterate() {
  local code="$1"
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const arr=JSON.parse(d);
        if(!Array.isArray(arr)){process.exit(0)}
        for(const item of arr){${code}}
      } catch(e) {
        process.stderr.write('JSON iterate error: '+e.message+'\n');
      }
    });
  "
}

# ============================================
# Environment Loading
# ============================================

load_env() {
  log_step "Loading environment"

  # Try environment variable first
  CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"

  # Fall back to .env.production
  if [[ -z "$CF_API_TOKEN" && -f "$ROOT_DIR/.env.production" ]]; then
    CF_API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' "$ROOT_DIR/.env.production" 2>/dev/null | cut -d'=' -f2- | tr -d '\r')
    if [[ -n "$CF_API_TOKEN" ]]; then
      log_info "Loaded API token from .env.production"
    fi
  fi

  # Fall back to .env.staging
  if [[ -z "$CF_API_TOKEN" && -f "$ROOT_DIR/.env.staging" ]]; then
    CF_API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' "$ROOT_DIR/.env.staging" 2>/dev/null | cut -d'=' -f2- | tr -d '\r')
    if [[ -n "$CF_API_TOKEN" ]]; then
      log_info "Loaded API token from .env.staging"
    fi
  fi

  if [[ -z "$CF_API_TOKEN" ]]; then
    log_error "CLOUDFLARE_API_TOKEN not found in environment or .env files"
    log_error "Set it via: export CLOUDFLARE_API_TOKEN=your_token"
    exit 1
  fi

  # Validate token
  log_info "Validating API token..."
  local response
  response=$(curl -s -X GET \
    "${CF_API_BASE}/user/tokens/verify" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json")

  local success
  success=$(echo "$response" | json_get "o.success")

  if [[ "$success" != "true" ]]; then
    log_error "API token validation failed"
    echo "$response" | json_get "o.errors" 2>/dev/null
    exit 1
  fi

  log_success "API token is valid"
  log_info "Zone ID: ${CF_ZONE_ID}"
  log_info "Account ID: ${CF_ACCOUNT_ID}"
}

# ============================================
# Interactive Prompts
# ============================================

confirm_proceed() {
  local message="${1:-Continue?}"

  if [[ "$FORCE_MODE" == "true" ]]; then
    log_info "Auto-confirmed (--force): $message"
    return 0
  fi

  echo -e "\n${YELLOW}${message} [y/N]${NC} "
  read -r answer
  case "$answer" in
    [yY]|[yY][eE][sS])
      return 0
      ;;
    *)
      log_warn "Aborted by user"
      return 1
      ;;
  esac
}

wait_for_enter() {
  local message="${1:-Press Enter to continue...}"
  echo -e "\n${CYAN}${message}${NC}"
  read -r
}

# ============================================
# State Management
# ============================================

save_state() {
  local phase="$1"
  local status="$2"
  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  # Create state file if it doesn't exist
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "# DNS Migration State" > "$STATE_FILE"
    echo "# Auto-generated, do not edit manually" >> "$STATE_FILE"
    echo "" >> "$STATE_FILE"
  fi

  # Update or add phase state
  if grep -q "^${phase}=" "$STATE_FILE" 2>/dev/null; then
    sed -i "s/^${phase}=.*/${phase}=${status} # ${timestamp}/" "$STATE_FILE"
  else
    echo "${phase}=${status} # ${timestamp}" >> "$STATE_FILE"
  fi
}

get_state() {
  local phase="$1"
  if [[ -f "$STATE_FILE" ]]; then
    grep "^${phase}=" "$STATE_FILE" 2>/dev/null | cut -d'=' -f2 | cut -d'#' -f1 | tr -d ' '
  else
    echo "not_started"
  fi
}

show_migration_status() {
  log_header "DNS Migration Status"

  if [[ ! -f "$STATE_FILE" ]]; then
    log_info "No migration in progress. Run 'migrate.sh phase0' to start."
    return
  fi

  local phases=("phase0" "phase1" "phase2" "phase3" "phase4" "phase5")
  local labels=("DNS Audit" "DNS Records" "SSL & Rules" "Nameserver Switch" "Proxy Enablement" "Optimization")

  for i in "${!phases[@]}"; do
    local state
    state=$(get_state "${phases[$i]}")
    local label="${labels[$i]}"

    case "$state" in
      completed)
        echo -e "  ${GREEN}[DONE]${NC} Phase $i: $label"
        ;;
      in_progress)
        echo -e "  ${YELLOW}[IN PROGRESS]${NC} Phase $i: $label"
        ;;
      failed)
        echo -e "  ${RED}[FAILED]${NC} Phase $i: $label"
        ;;
      *)
        echo -e "  [ ] Phase $i: $label"
        ;;
    esac
  done

  echo ""
}
