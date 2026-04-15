#!/usr/bin/env bash
# ============================================
# Phase 4: Enable Cloudflare Proxy
# ============================================
# Enables the orange cloud (proxied=true) one subdomain at a time.
# Each step is independently reversible. If a subdomain breaks,
# toggle it back to DNS-only immediately.

run_phase4() {
  log_header "Phase 4: Enable Cloudflare Proxy"
  save_state "phase4" "in_progress"

  local rollback_file="$BACKUP_DIR/phase4_rollback_$(date '+%Y-%m-%d').sh"
  local proxied_records=()

  # ------------------------------------------------
  # Pre-flight: Verify zone is active
  # ------------------------------------------------
  log_step "Pre-flight: Zone Status Check"

  local zone_status
  zone_status=$(cf_get_zone_status)

  if [[ "$zone_status" != "active" ]]; then
    log_error "Zone is not active (status: ${zone_status})."
    log_error "Complete Phase 3 (nameserver switch) before enabling proxy."
    save_state "phase4" "failed"
    return 1
  fi

  log_success "Zone is active. Proceeding with proxy enablement."
  echo ""

  # ------------------------------------------------
  # Enable proxy function (reused for each subdomain)
  # ------------------------------------------------
  enable_proxy_for() {
    local subdomain="$1"
    local description="$2"

    local full_name
    if [[ "$subdomain" == "@" ]]; then
      full_name="$DOMAIN"
    else
      full_name="${subdomain}.${DOMAIN}"
    fi

    echo -e "\n${BOLD}--- ${full_name} (${description}) ---${NC}\n"

    # Pre-check: verify it's currently responding
    log_info "Pre-check: Testing ${full_name}..."
    local pre_code
    pre_code=$(verify_http "$full_name")
    echo "  HTTP status: ${pre_code}"

    if [[ "$pre_code" == "000" ]]; then
      log_warn "${full_name} is not responding. Skipping proxy enablement."
      return 1
    fi

    # Find the DNS record
    local record
    record=$(cf_find_record_by_name "$full_name")

    if [[ -z "$record" ]]; then
      log_error "No DNS record found for ${full_name}. Skipping."
      return 1
    fi

    local record_id
    record_id=$(echo "$record" | json_get "o.id")
    local current_proxied
    current_proxied=$(echo "$record" | json_get "o.proxied")

    if [[ "$current_proxied" == "true" ]]; then
      log_success "${full_name}: Already proxied (skipping)"
      return 0
    fi

    # Confirm
    if ! confirm_proceed "Enable Cloudflare proxy for ${full_name}?"; then
      log_info "Skipped: ${full_name}"
      return 0
    fi

    # Enable proxy
    log_info "Enabling proxy..."
    if cf_set_proxy "$record_id" "true"; then
      log_success "Proxy enabled for ${full_name}"
    else
      log_error "Failed to enable proxy for ${full_name}"
      return 1
    fi

    # Wait for propagation
    log_info "Waiting 15 seconds for propagation..."
    sleep 15

    # Verify
    log_info "Verifying ${full_name}..."
    local post_code
    post_code=$(verify_http "$full_name")

    local http_ok=false
    case "$post_code" in
      200|301|302) http_ok=true ;;
    esac

    local proxy_active=false
    if verify_cloudflare_active "$full_name"; then
      proxy_active=true
    fi

    if [[ "$http_ok" == "true" ]]; then
      echo -e "  ${GREEN}[OK]${NC} HTTP: ${post_code}"
    else
      echo -e "  ${RED}[FAIL]${NC} HTTP: ${post_code}"
    fi

    if [[ "$proxy_active" == "true" ]]; then
      local ray
      ray=$(get_cf_ray "$full_name")
      echo -e "  ${GREEN}[OK]${NC} Cloudflare proxy: Active (cf-ray: ${ray})"
    else
      echo -e "  ${YELLOW}[WARN]${NC} Cloudflare proxy: cf-ray header not detected yet"
    fi

    if verify_ssl_valid "$full_name"; then
      echo -e "  ${GREEN}[OK]${NC} SSL: Valid"
    else
      echo -e "  ${RED}[FAIL]${NC} SSL: Invalid or missing"
    fi

    # If HTTP failed, offer immediate rollback
    if [[ "$http_ok" != "true" ]]; then
      echo ""
      log_error "${full_name} is not responding correctly after enabling proxy!"

      if confirm_proceed "ROLLBACK: Disable proxy for ${full_name}?"; then
        cf_set_proxy "$record_id" "false"
        log_success "Proxy disabled for ${full_name} (rolled back)"
        log_info "Investigate the issue before retrying."
        return 1
      fi
    fi

    # Track for rollback
    proxied_records+=("${record_id}:${full_name}")

    echo ""
    log_success "${full_name}: Proxy enabled and verified"
    return 0
  }

  # ------------------------------------------------
  # Step 4.1: Enable proxy for production subdomains
  # ------------------------------------------------
  log_step "Step 4.1: Production Subdomains (one at a time)"

  echo "Order: admin -> nexus -> app -> www -> root (lowest to highest traffic)"
  echo ""

  # admin (lowest traffic)
  enable_proxy_for "admin" "Admin Panel, lowest traffic"

  # nexus
  enable_proxy_for "nexus" "Nexus Classroom, teacher/student traffic"

  # app
  enable_proxy_for "app" "Tools PWA, student traffic"

  # www
  enable_proxy_for "www" "www redirect"

  # root
  enable_proxy_for "@" "Marketing site, highest traffic"

  # ------------------------------------------------
  # Step 4.2: Staging subdomains (optional)
  # ------------------------------------------------
  log_step "Step 4.2: Staging Subdomains (optional)"

  if confirm_proceed "Enable proxy for staging subdomains too?"; then
    enable_proxy_for "staging" "Staging marketing"
    enable_proxy_for "staging-app" "Staging app"
    enable_proxy_for "staging-nexus" "Staging nexus"
    enable_proxy_for "staging-admin" "Staging admin"
  else
    log_info "Skipping staging subdomains"
  fi

  # ------------------------------------------------
  # Step 4.3: Generate rollback script
  # ------------------------------------------------
  log_step "Step 4.3: Generating rollback script"

  {
    echo "#!/usr/bin/env bash"
    echo "# Phase 4 Rollback: Disable proxy on all records"
    echo "# Generated: $(date)"
    echo ""
    echo "SCRIPT_DIR=\"\$(cd \"\$(dirname \"\${BASH_SOURCE[0]}\")\" && pwd)\""
    echo "source \"\$SCRIPT_DIR/../lib/common.sh\""
    echo "source \"\$SCRIPT_DIR/../lib/cloudflare-api.sh\""
    echo "load_env"
    echo ""
    echo "echo 'Rolling back Phase 4: Disabling proxy on all records...'"
    echo ""
    for entry in "${proxied_records[@]}"; do
      local rid="${entry%%:*}"
      local rname="${entry#*:}"
      echo "cf_set_proxy '${rid}' 'false' && echo 'Proxy disabled: ${rname}'"
    done
    echo ""
    echo "echo 'Phase 4 rollback complete. All records are now DNS-only.'"
  } > "$rollback_file"

  chmod +x "$rollback_file"
  log_info "Rollback script saved: ${rollback_file}"

  # ------------------------------------------------
  # Step 4.4: Final verification
  # ------------------------------------------------
  log_step "Step 4.4: Final Verification"

  verify_all_production "true"
  echo ""
  verify_seo

  # ------------------------------------------------
  # Summary
  # ------------------------------------------------
  echo ""
  save_state "phase4" "completed"
  log_success "Phase 4 complete."
  log_info "All enabled subdomains now route through Cloudflare's edge network."
  log_info "Monitor for 24-48 hours before proceeding."
  log_info "Next step: Run 'migrate.sh phase5' to configure caching, security, and performance."
  echo ""
  echo -e "${BOLD}Quick Fix:${NC} If any subdomain breaks:"
  echo "  1. Find its record in Cloudflare DNS"
  echo "  2. Toggle from Proxied (orange) to DNS Only (grey)"
  echo "  3. Effect is instant"
  echo "  Or run: bash ${rollback_file}"
}

run_phase4
