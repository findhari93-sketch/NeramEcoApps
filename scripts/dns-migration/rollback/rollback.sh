#!/usr/bin/env bash
# ============================================
# DNS Migration - Rollback Handler
# ============================================
# Usage: rollback.sh <phase_number>
# Runs the auto-generated rollback script for the specified phase.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/cloudflare-api.sh"

run_rollback() {
  local phase="${1:-}"

  if [[ -z "$phase" ]]; then
    log_header "DNS Migration Rollback"
    echo "Usage: migrate.sh rollback <phase_number>"
    echo ""
    echo "Available rollback options:"
    echo ""

    # Check which rollback scripts exist
    local found=false
    for p in 1 2 3 4 5; do
      local pattern="$BACKUP_DIR/phase${p}_rollback_*.sh"
      local latest
      latest=$(ls -t $pattern 2>/dev/null | head -1)
      if [[ -n "$latest" ]]; then
        echo "  Phase ${p}: ${latest}"
        found=true
      fi
    done

    if [[ "$found" == "false" ]]; then
      echo "  No rollback scripts found. Run migration phases first."
    fi

    echo ""
    echo "Special rollbacks:"
    echo "  Phase 3 (Nameserver): Switch nameservers back at GoDaddy:"
    echo "    NS1: ns1.vercel-dns.com"
    echo "    NS2: ns2.vercel-dns.com"
    echo ""
    return 0
  fi

  log_header "Rollback Phase ${phase}"

  case "$phase" in
    0)
      log_info "Phase 0 is read-only. Nothing to rollback."
      ;;

    1|2|4|5)
      # Find the latest rollback script for this phase
      local pattern="$BACKUP_DIR/phase${phase}_rollback_*.sh"
      local rollback_script
      rollback_script=$(ls -t $pattern 2>/dev/null | head -1)

      if [[ -z "$rollback_script" ]]; then
        log_error "No rollback script found for Phase ${phase}."
        log_error "Expected file matching: ${pattern}"
        return 1
      fi

      log_info "Found rollback script: ${rollback_script}"
      echo ""

      # Show contents
      echo -e "${BOLD}Rollback actions:${NC}"
      grep -E "^(cf_|echo)" "$rollback_script" | head -20
      echo ""

      if ! confirm_proceed "Execute this rollback?"; then
        log_info "Rollback cancelled"
        return 0
      fi

      load_env
      source "$rollback_script"

      save_state "phase${phase}" "rolled_back"
      log_success "Phase ${phase} rolled back successfully"
      ;;

    3)
      log_header "Phase 3 Rollback: Nameserver Revert"
      echo ""
      echo -e "${BOLD}============================================${NC}"
      echo -e "${BOLD} MANUAL STEP: Revert Nameservers at GoDaddy ${NC}"
      echo -e "${BOLD}============================================${NC}"
      echo ""
      echo "  1. Go to https://dcc.godaddy.com/manage/neramclasses.com/dns"
      echo ""
      echo "  2. Click 'Change Nameservers'"
      echo ""
      echo "  3. Switch back to Vercel nameservers:"
      echo ""
      echo -e "     ${GREEN}NS1: ns1.vercel-dns.com${NC}"
      echo -e "     ${GREEN}NS2: ns2.vercel-dns.com${NC}"
      echo ""
      echo "  4. Save changes"
      echo ""
      echo "DNS will propagate back within minutes to hours."
      echo ""

      save_state "phase3" "rolled_back"
      ;;

    *)
      log_error "Invalid phase number: ${phase}"
      log_error "Valid phases: 0, 1, 2, 3, 4, 5"
      return 1
      ;;
  esac
}

run_rollback "$@"