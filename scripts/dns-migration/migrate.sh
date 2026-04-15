#!/usr/bin/env bash
# ============================================
# Neram Ecosystem - DNS Migration CLI
# ============================================
# Automates Vercel -> Cloudflare DNS migration via Cloudflare API.
#
# Usage:
#   bash scripts/dns-migration/migrate.sh              # Run all phases interactively
#   bash scripts/dns-migration/migrate.sh phase0       # Run single phase
#   bash scripts/dns-migration/migrate.sh phase1
#   bash scripts/dns-migration/migrate.sh phase2
#   bash scripts/dns-migration/migrate.sh phase3
#   bash scripts/dns-migration/migrate.sh phase4
#   bash scripts/dns-migration/migrate.sh phase5
#   bash scripts/dns-migration/migrate.sh rollback 3   # Rollback a phase
#   bash scripts/dns-migration/migrate.sh status       # Show migration state
#
# Flags:
#   --force    Skip interactive confirmations (use with caution)
#
# Requirements:
#   - CLOUDFLARE_API_TOKEN (in env or .env.production)
#   - curl, node (for JSON parsing), openssl, nslookup
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source all libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/cloudflare-api.sh"
source "$SCRIPT_DIR/lib/dns-helpers.sh"
source "$SCRIPT_DIR/lib/verify.sh"

# Parse global flags
COMMAND=""
ROLLBACK_PHASE=""

for arg in "$@"; do
  case "$arg" in
    --force)
      FORCE_MODE=true
      ;;
    rollback)
      COMMAND="rollback"
      ;;
    phase[0-5])
      COMMAND="$arg"
      ;;
    status)
      COMMAND="status"
      ;;
    [0-5])
      if [[ "$COMMAND" == "rollback" ]]; then
        ROLLBACK_PHASE="$arg"
      fi
      ;;
    *)
      if [[ -z "$COMMAND" ]]; then
        echo "Unknown command: $arg"
        echo ""
        echo "Usage: migrate.sh [phase0|phase1|phase2|phase3|phase4|phase5|rollback N|status]"
        echo "Flags: --force (skip confirmations)"
        exit 1
      fi
      ;;
  esac
done

# Default to interactive all-phases mode
if [[ -z "$COMMAND" ]]; then
  COMMAND="all"
fi

# ============================================
# Banner
# ============================================

echo -e "${BOLD}"
echo "  ============================================"
echo "   Neram DNS Migration: Vercel -> Cloudflare"
echo "   neramclasses.com"
echo "  ============================================"
echo -e "${NC}"

# ============================================
# Command Router
# ============================================

case "$COMMAND" in
  status)
    show_migration_status
    ;;

  rollback)
    source "$SCRIPT_DIR/rollback/rollback.sh"
    run_rollback "$ROLLBACK_PHASE"
    ;;

  phase0)
    load_env
    source "$SCRIPT_DIR/phases/phase0-audit.sh"
    ;;

  phase1)
    load_env
    source "$SCRIPT_DIR/phases/phase1-dns-records.sh"
    ;;

  phase2)
    load_env
    source "$SCRIPT_DIR/phases/phase2-ssl-rules.sh"
    ;;

  phase3)
    load_env
    source "$SCRIPT_DIR/phases/phase3-nameserver.sh"
    ;;

  phase4)
    load_env
    source "$SCRIPT_DIR/phases/phase4-proxy.sh"
    ;;

  phase5)
    load_env
    source "$SCRIPT_DIR/phases/phase5-optimize.sh"
    ;;

  all)
    log_header "Full Migration (All Phases)"

    echo "This will run all 6 phases of the DNS migration:"
    echo ""
    echo "  Phase 0: Audit current DNS records (read-only)"
    echo "  Phase 1: Create DNS records in Cloudflare (no downtime risk)"
    echo "  Phase 2: Configure SSL and redirect rules (no downtime risk)"
    echo "  Phase 3: Switch nameservers at GoDaddy (manual step)"
    echo "  Phase 4: Enable Cloudflare proxy per subdomain (reversible)"
    echo "  Phase 5: Configure caching, security, performance"
    echo ""
    echo "You will be prompted for confirmation before each risky action."
    echo ""

    if ! confirm_proceed "Start the full migration?"; then
      log_info "Migration cancelled"
      exit 0
    fi

    load_env

    # Phase 0
    source "$SCRIPT_DIR/phases/phase0-audit.sh"
    echo ""
    if ! confirm_proceed "Phase 0 complete. Continue to Phase 1 (create DNS records)?"; then
      log_info "Paused. Resume with: migrate.sh phase1"
      exit 0
    fi

    # Phase 1
    source "$SCRIPT_DIR/phases/phase1-dns-records.sh"
    echo ""
    if ! confirm_proceed "Phase 1 complete. Continue to Phase 2 (SSL and rules)?"; then
      log_info "Paused. Resume with: migrate.sh phase2"
      exit 0
    fi

    # Phase 2
    source "$SCRIPT_DIR/phases/phase2-ssl-rules.sh"
    echo ""
    if ! confirm_proceed "Phase 2 complete. Continue to Phase 3 (nameserver switch)?"; then
      log_info "Paused. Resume with: migrate.sh phase3"
      exit 0
    fi

    # Phase 3
    source "$SCRIPT_DIR/phases/phase3-nameserver.sh"
    echo ""
    if ! confirm_proceed "Phase 3 complete. Continue to Phase 4 (enable proxy)?"; then
      log_info "Paused. Resume with: migrate.sh phase4"
      exit 0
    fi

    # Phase 4
    source "$SCRIPT_DIR/phases/phase4-proxy.sh"
    echo ""
    if ! confirm_proceed "Phase 4 complete. Continue to Phase 5 (optimization)?"; then
      log_info "Paused. Resume with: migrate.sh phase5"
      exit 0
    fi

    # Phase 5
    source "$SCRIPT_DIR/phases/phase5-optimize.sh"
    ;;
esac
