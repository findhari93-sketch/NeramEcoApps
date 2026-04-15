#!/usr/bin/env bash
# ============================================
# Phase 3: Nameserver Switch (GoDaddy)
# ============================================
# The only manual step. Prints GoDaddy-specific instructions,
# then polls DNS resolvers for propagation.

run_phase3() {
  log_header "Phase 3: Nameserver Switch"
  save_state "phase3" "in_progress"

  # ------------------------------------------------
  # Step 3.1: Pre-flight checks
  # ------------------------------------------------
  log_step "Step 3.1: Pre-flight Checks"

  # Verify zone has DNS records
  local records
  records=$(cf_list_dns_records)
  local record_count
  record_count=$(echo "$records" | json_array_length "o")

  if [[ "$record_count" -lt 5 ]]; then
    log_error "Only ${record_count} DNS records found in Cloudflare."
    log_error "Run Phase 1 first to create DNS records before switching nameservers."
    save_state "phase3" "failed"
    return 1
  fi

  log_success "Found ${record_count} DNS records in Cloudflare"

  # Check zone status
  local zone_status
  zone_status=$(cf_get_zone_status)

  if [[ "$zone_status" == "active" ]]; then
    log_success "Zone is already active. Nameservers are already pointing to Cloudflare."
    log_info "Skipping to smoke tests..."

    # Jump to verification
    log_step "Step 3.3: Smoke Tests"
    verify_all_production "false"
    verify_all_staging "false"

    save_state "phase3" "completed"
    log_success "Phase 3 complete (zone was already active)."
    log_info "Next step: Run 'migrate.sh phase4' to enable Cloudflare proxy."
    return 0
  fi

  # Get assigned nameservers
  local assigned_ns
  assigned_ns=$(cf_get_assigned_nameservers)

  local ns1 ns2
  ns1=$(echo "$assigned_ns" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{const a=JSON.parse(d);process.stdout.write(a[0]||'');});
  ")
  ns2=$(echo "$assigned_ns" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{const a=JSON.parse(d);process.stdout.write(a[1]||'');});
  ")

  # ------------------------------------------------
  # Step 3.2: GoDaddy Instructions
  # ------------------------------------------------
  log_step "Step 3.2: Switch Nameservers at GoDaddy"

  echo -e "${BOLD}============================================${NC}"
  echo -e "${BOLD} MANUAL STEP: Switch Nameservers at GoDaddy${NC}"
  echo -e "${BOLD}============================================${NC}"
  echo ""
  echo -e "  1. Go to ${CYAN}https://dcc.godaddy.com/manage/neramclasses.com/dns${NC}"
  echo ""
  echo "  2. Scroll to the 'Nameservers' section"
  echo ""
  echo "  3. Click 'Change Nameservers' (or 'Edit')"
  echo ""
  echo "  4. Select 'I'll use my own nameservers' (or 'Enter my own nameservers')"
  echo ""
  echo "  5. Replace current nameservers with:"
  echo ""
  echo -e "     ${GREEN}NS1: ${ns1}${NC}"
  echo -e "     ${GREEN}NS2: ${ns2}${NC}"
  echo ""
  echo "  6. Click 'Save' and confirm the change"
  echo ""
  echo -e "${YELLOW}  BEST TIME: Late night IST (11 PM - 2 AM) when student traffic is lowest${NC}"
  echo ""
  echo -e "${YELLOW}  IMPORTANT: GoDaddy may show a warning about 'losing current DNS settings'.${NC}"
  echo -e "${YELLOW}  This is normal. Your DNS records are already in Cloudflare (Phase 1).${NC}"
  echo ""

  # Rollback info
  echo -e "${BOLD}Emergency Rollback:${NC}"
  echo "  If anything goes wrong, switch nameservers back to Vercel:"
  echo "    NS1: ns1.vercel-dns.com"
  echo "    NS2: ns2.vercel-dns.com"
  echo ""

  wait_for_enter "Press Enter AFTER you have switched nameservers at GoDaddy..."

  # ------------------------------------------------
  # Step 3.3: Poll for propagation
  # ------------------------------------------------
  log_step "Step 3.3: Polling DNS Propagation"

  echo "Checking if DNS resolvers see the new Cloudflare nameservers..."
  echo "This can take anywhere from 5 minutes to 48 hours."
  echo "Most users see it within 1-4 hours."
  echo ""

  # Poll with 30-second intervals, 2-hour timeout
  if dns_poll_propagation "$DOMAIN" "cloudflare.com" 7200 30; then
    log_success "DNS propagation detected!"
  else
    log_warn "Propagation not yet complete. Continuing anyway."
    log_info "You can check propagation later with: migrate.sh status"
  fi

  # Also check Cloudflare zone status
  echo ""
  log_info "Checking Cloudflare zone activation status..."

  local attempts=0
  local max_attempts=10

  while [[ $attempts -lt $max_attempts ]]; do
    local status
    status=$(cf_get_zone_status)

    if [[ "$status" == "active" ]]; then
      log_success "Cloudflare zone is now ACTIVE!"
      break
    fi

    log_info "Zone status: ${status} (attempt $((attempts + 1))/${max_attempts})"
    attempts=$((attempts + 1))

    if [[ $attempts -lt $max_attempts ]]; then
      sleep 30
    fi
  done

  if [[ "$status" != "active" ]]; then
    log_warn "Zone not yet active. Cloudflare will send an email when it activates."
    log_info "You can continue to Phase 4 after activation."
  fi

  # ------------------------------------------------
  # Step 3.4: Smoke Tests
  # ------------------------------------------------
  log_step "Step 3.4: Smoke Tests"

  echo "Running verification on all subdomains..."
  echo ""

  verify_all_production "false"
  echo ""
  verify_all_staging "false"
  echo ""
  verify_seo

  # ------------------------------------------------
  # Summary
  # ------------------------------------------------
  echo ""
  save_state "phase3" "completed"
  log_success "Phase 3 complete."
  log_info "Monitor your apps for the next 24-48 hours."
  log_info "Next step: Run 'migrate.sh phase4' to enable Cloudflare proxy (one subdomain at a time)."
  echo ""
  echo -e "${BOLD}Emergency Rollback:${NC}"
  echo "  Switch nameservers back at GoDaddy:"
  echo "    NS1: ns1.vercel-dns.com"
  echo "    NS2: ns2.vercel-dns.com"
}

run_phase3
