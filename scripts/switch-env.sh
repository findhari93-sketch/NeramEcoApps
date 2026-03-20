#!/bin/bash
# =============================================================================
# Environment Switcher - Switch local dev between production and staging
# Usage:
#   pnpm env:use prod      → Switch default dev to production Supabase
#   pnpm env:use staging   → Switch default dev to staging Supabase
#   pnpm env:status        → Show which backend each app is currently using
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

APPS=("marketing" "app" "nexus" "admin")

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Extract Supabase vars from an env file
get_supabase_vars() {
  local env_file="$1"
  grep -E "^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=" "$env_file" 2>/dev/null
}

# Detect which environment an .env.local is pointing to
detect_env() {
  local env_file="$1"
  if [ ! -f "$env_file" ]; then
    echo "missing"
    return
  fi
  local url=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "$env_file" 2>/dev/null | head -1 | cut -d= -f2)
  if [[ "$url" == *"db.neramclasses.com"* ]] && [[ "$url" != *"db-staging"* ]]; then
    echo "prod"
  elif [[ "$url" == *"db-staging.neramclasses.com"* ]]; then
    echo "staging"
  else
    echo "unknown"
  fi
}

# Show status of all apps
show_status() {
  echo ""
  echo -e "${BLUE}📊 Environment Status${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  for app in "${APPS[@]}"; do
    local env_file="$ROOT_DIR/apps/$app/.env.local"
    local env=$(detect_env "$env_file")
    case "$env" in
      prod)    echo -e "  $app: ${RED}PRODUCTION${NC} (db.neramclasses.com)" ;;
      staging) echo -e "  $app: ${GREEN}STAGING${NC} (db-staging.neramclasses.com)" ;;
      missing) echo -e "  $app: ${YELLOW}NO .env.local${NC}" ;;
      *)       echo -e "  $app: ${YELLOW}UNKNOWN${NC}" ;;
    esac
  done
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo -e "  ${BLUE}Tip:${NC} Use 'pnpm dev:prod:nexus' or 'pnpm dev:staging:nexus'"
  echo "       to override without changing .env.local"
  echo ""
}

# Switch environment
switch_env() {
  local target="$1"
  local source_file=""
  local label=""

  case "$target" in
    prod|production)
      source_file="$ROOT_DIR/.env.production"
      label="PRODUCTION"
      ;;
    staging|stg)
      source_file="$ROOT_DIR/.env.staging"
      label="STAGING"
      ;;
    *)
      echo -e "${RED}Error:${NC} Unknown environment '$target'"
      echo "Usage: pnpm env:use [prod|staging]"
      exit 1
      ;;
  esac

  if [ ! -f "$source_file" ]; then
    echo -e "${RED}Error:${NC} $source_file not found"
    exit 1
  fi

  # Extract the 3 Supabase vars from source
  local supabase_url=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "$source_file" | head -1 | cut -d= -f2-)
  local supabase_anon=$(grep "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" "$source_file" | head -1 | cut -d= -f2-)
  local supabase_service=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" "$source_file" | head -1 | cut -d= -f2-)

  echo ""
  echo -e "${BLUE}Switching to ${label}...${NC}"
  echo ""

  for app in "${APPS[@]}"; do
    local env_file="$ROOT_DIR/apps/$app/.env.local"
    if [ ! -f "$env_file" ]; then
      echo -e "  ${YELLOW}⚠ $app: No .env.local found, skipping${NC}"
      continue
    fi

    # Replace the Supabase vars in-place using sed
    if grep -q "^NEXT_PUBLIC_SUPABASE_URL=" "$env_file"; then
      sed -i "s|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=$supabase_url|" "$env_file"
    fi
    if grep -q "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" "$env_file"; then
      sed -i "s|^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*|NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabase_anon|" "$env_file"
    fi
    if grep -q "^SUPABASE_SERVICE_ROLE_KEY=" "$env_file"; then
      sed -i "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$supabase_service|" "$env_file"
    fi

    echo -e "  ${GREEN}✓ $app${NC} → $label"
  done

  echo ""
  echo -e "${GREEN}Done!${NC} Restart your dev server to use $label backend."
  echo ""
}

# Main
case "${1:-}" in
  status)
    show_status
    ;;
  "")
    echo -e "${RED}Error:${NC} No environment specified"
    echo ""
    echo "Usage:"
    echo "  pnpm env:use prod      Switch to production Supabase"
    echo "  pnpm env:use staging   Switch to staging Supabase"
    echo "  pnpm env:status        Show current environment"
    exit 1
    ;;
  *)
    switch_env "$1"
    ;;
esac
