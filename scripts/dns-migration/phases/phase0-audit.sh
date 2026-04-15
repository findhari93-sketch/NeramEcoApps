#!/usr/bin/env bash
# ============================================
# Phase 0: DNS Audit & Backup
# ============================================
# Read-only phase. Captures current DNS state and Cloudflare zone status.
# Zero risk to production.

run_phase0() {
  log_header "Phase 0: DNS Audit & Backup"
  save_state "phase0" "in_progress"

  local timestamp
  timestamp=$(date '+%Y-%m-%d_%H%M%S')
  local backup_file="$BACKUP_DIR/dns_backup_${timestamp}.txt"

  # ------------------------------------------------
  # Step 0A: Query current DNS records via nslookup
  # ------------------------------------------------
  log_step "Step 0A: Querying current DNS records"

  {
    echo "============================================"
    echo "DNS Backup for neramclasses.com"
    echo "Date: $(date)"
    echo "============================================"
    echo ""
  } > "$backup_file"

  # Production domains
  echo -e "${BOLD}Production Domains:${NC}"
  for domain in neramclasses.com www.neramclasses.com app.neramclasses.com nexus.neramclasses.com admin.neramclasses.com; do
    dns_audit_domain "$domain" | tee -a "$backup_file"
  done

  # Staging domains
  echo -e "${BOLD}Staging Domains:${NC}"
  for domain in staging.neramclasses.com staging-app.neramclasses.com staging-nexus.neramclasses.com staging-admin.neramclasses.com; do
    dns_audit_domain "$domain" | tee -a "$backup_file"
  done

  # Worker domains
  echo -e "${BOLD}Worker Domains:${NC}"
  for domain in db.neramclasses.com db-staging.neramclasses.com; do
    dns_audit_domain "$domain" | tee -a "$backup_file"
  done

  # ------------------------------------------------
  # Step 0B: Query NS, MX, TXT records for root
  # ------------------------------------------------
  log_step "Step 0B: Root domain records (NS, MX, TXT)"

  {
    echo ""
    echo "=== Nameservers ==="
  } >> "$backup_file"

  echo -e "${BOLD}Current Nameservers:${NC}"
  local ns_result
  ns_result=$(dns_get_nameservers "neramclasses.com")
  if [[ -n "$ns_result" ]]; then
    echo "$ns_result" | tee -a "$backup_file"
  else
    echo "  (no NS records found via nslookup)" | tee -a "$backup_file"
  fi
  echo ""

  {
    echo ""
    echo "=== MX Records ==="
  } >> "$backup_file"

  echo -e "${BOLD}MX Records:${NC}"
  local mx_result
  mx_result=$(dns_get_mx "neramclasses.com")
  if [[ -n "$mx_result" ]]; then
    echo "$mx_result" | tee -a "$backup_file"
  else
    echo "  (no MX records found)" | tee -a "$backup_file"
  fi
  echo ""

  {
    echo ""
    echo "=== TXT Records ==="
  } >> "$backup_file"

  echo -e "${BOLD}TXT Records (root):${NC}"
  local txt_result
  txt_result=$(dns_get_txt "neramclasses.com")
  if [[ -n "$txt_result" ]]; then
    echo "$txt_result" | tee -a "$backup_file"
  else
    echo "  (no TXT records found)" | tee -a "$backup_file"
  fi
  echo ""

  echo -e "${BOLD}DMARC Record:${NC}"
  local dmarc_result
  dmarc_result=$(dns_get_txt "_dmarc.neramclasses.com")
  if [[ -n "$dmarc_result" ]]; then
    echo "$dmarc_result" | tee -a "$backup_file"
  else
    echo "  (no DMARC record found)" | tee -a "$backup_file"
  fi
  echo ""

  # ------------------------------------------------
  # Step 0C: Check Cloudflare zone status via API
  # ------------------------------------------------
  log_step "Step 0C: Cloudflare Zone Status"

  local zone_details
  zone_details=$(cf_get_zone_details)

  local zone_status
  zone_status=$(echo "$zone_details" | json_get "o.result.status")
  local zone_ns
  zone_ns=$(echo "$zone_details" | json_get "o.result.name_servers")

  echo -e "Zone Status: ${BOLD}${zone_status}${NC}"
  echo -e "Assigned Nameservers:"
  echo "$zone_ns"
  echo ""

  {
    echo ""
    echo "=== Cloudflare Zone ==="
    echo "Status: $zone_status"
    echo "Assigned NS: $zone_ns"
  } >> "$backup_file"

  if [[ "$zone_status" == "pending" ]]; then
    log_warn "Zone is PENDING. Nameservers have not been switched to Cloudflare yet."
    log_info "This is expected. You can still add DNS records (Phase 1-2) before switching."
  elif [[ "$zone_status" == "active" ]]; then
    log_success "Zone is ACTIVE. Cloudflare is already handling DNS."
  fi

  # ------------------------------------------------
  # Step 0D: List existing Cloudflare DNS records
  # ------------------------------------------------
  log_step "Step 0D: Existing Cloudflare DNS Records"

  local existing_records
  existing_records=$(cf_list_dns_records)

  local record_count
  record_count=$(echo "$existing_records" | json_array_length "o")

  echo -e "Found ${BOLD}${record_count}${NC} existing records in Cloudflare:"
  echo ""

  if [[ "$record_count" -gt 0 ]]; then
    echo "$existing_records" | node -e "
      let d='';
      process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        const records=JSON.parse(d);
        console.log('  Type     | Name                          | Content                        | Proxied');
        console.log('  ---------|-------------------------------|--------------------------------|--------');
        for(const r of records){
          const type=r.type.padEnd(8);
          const name=r.name.padEnd(30).substring(0,30);
          const content=(r.content||'').padEnd(31).substring(0,31);
          const proxied=r.proxied?'Yes':'No';
          console.log('  '+type+' | '+name+' | '+content+' | '+proxied);
        }
      });
    "

    {
      echo ""
      echo "=== Existing Cloudflare Records ==="
      echo "$existing_records"
    } >> "$backup_file"
  fi

  echo ""

  # ------------------------------------------------
  # Summary
  # ------------------------------------------------
  log_step "Audit Summary"

  log_success "DNS backup saved to: ${backup_file}"
  echo ""
  echo -e "  Zone Status:     ${BOLD}${zone_status}${NC}"
  echo -e "  Existing Records: ${BOLD}${record_count}${NC}"
  echo -e "  Backup File:     ${backup_file}"
  echo ""

  if [[ "$zone_status" == "pending" ]]; then
    log_info "Next step: Run 'migrate.sh phase1' to create DNS records in Cloudflare"
  elif [[ "$zone_status" == "active" ]]; then
    log_info "Zone already active. Run 'migrate.sh phase1' to verify/add DNS records"
  fi

  save_state "phase0" "completed"
  log_success "Phase 0 complete"
}

run_phase0
