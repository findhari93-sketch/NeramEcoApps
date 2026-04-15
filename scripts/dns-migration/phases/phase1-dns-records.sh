#!/usr/bin/env bash
# ============================================
# Phase 1: Create DNS Records in Cloudflare
# ============================================
# Creates all DNS records with proxied=false (DNS Only / grey cloud).
# Safe to run while zone is still pending.
# Does NOT affect live site.

run_phase1() {
  log_header "Phase 1: Create DNS Records"
  save_state "phase1" "in_progress"

  local rollback_file="$BACKUP_DIR/phase1_rollback_$(date '+%Y-%m-%d').sh"
  local created_ids=()

  # ------------------------------------------------
  # Step 1.1: List existing records
  # ------------------------------------------------
  log_step "Step 1.1: Checking existing Cloudflare DNS records"

  local existing_records
  existing_records=$(cf_list_dns_records)
  local existing_count
  existing_count=$(echo "$existing_records" | json_array_length "o")

  log_info "Found ${existing_count} existing records in Cloudflare"
  echo ""

  # ------------------------------------------------
  # Step 1.2: Create production Vercel CNAME records
  # ------------------------------------------------
  log_step "Step 1.2: Creating production DNS records (proxied=false)"

  echo -e "These records point to Vercel's CNAME target with Cloudflare proxy OFF."
  echo -e "Traffic will continue to flow directly to Vercel.\n"

  if ! confirm_proceed "Create production DNS records?"; then
    save_state "phase1" "failed"
    return 1
  fi

  # Root domain (CNAME flattening)
  local id
  id=$(cf_create_dns_record "CNAME" "@" "cname.vercel-dns.com" "false")
  if [[ -n "$id" ]]; then created_ids+=("$id"); fi

  # www
  id=$(cf_create_dns_record "CNAME" "www" "cname.vercel-dns.com" "false")
  if [[ -n "$id" ]]; then created_ids+=("$id"); fi

  # app
  id=$(cf_create_dns_record "CNAME" "app" "cname.vercel-dns.com" "false")
  if [[ -n "$id" ]]; then created_ids+=("$id"); fi

  # nexus
  id=$(cf_create_dns_record "CNAME" "nexus" "cname.vercel-dns.com" "false")
  if [[ -n "$id" ]]; then created_ids+=("$id"); fi

  # admin
  id=$(cf_create_dns_record "CNAME" "admin" "cname.vercel-dns.com" "false")
  if [[ -n "$id" ]]; then created_ids+=("$id"); fi

  echo ""

  # ------------------------------------------------
  # Step 1.3: Create staging Vercel CNAME records
  # ------------------------------------------------
  log_step "Step 1.3: Creating staging DNS records (proxied=false)"

  if ! confirm_proceed "Create staging DNS records?"; then
    log_info "Skipping staging records"
  else
    # staging (marketing)
    id=$(cf_create_dns_record "CNAME" "staging" "cname.vercel-dns.com" "false")
    if [[ -n "$id" ]]; then created_ids+=("$id"); fi

    # staging-app
    id=$(cf_create_dns_record "CNAME" "staging-app" "cname.vercel-dns.com" "false")
    if [[ -n "$id" ]]; then created_ids+=("$id"); fi

    # staging-nexus
    id=$(cf_create_dns_record "CNAME" "staging-nexus" "cname.vercel-dns.com" "false")
    if [[ -n "$id" ]]; then created_ids+=("$id"); fi

    # staging-admin
    id=$(cf_create_dns_record "CNAME" "staging-admin" "cname.vercel-dns.com" "false")
    if [[ -n "$id" ]]; then created_ids+=("$id"); fi
  fi

  echo ""

  # ------------------------------------------------
  # Step 1.4: Verify Worker subdomain records
  # ------------------------------------------------
  log_step "Step 1.4: Checking Worker subdomain records (db, db-staging)"

  log_info "Worker subdomains (db, db-staging) are managed by Cloudflare Workers."
  log_info "These need proxied=true for Worker routes to function."

  # Check db.neramclasses.com
  local db_record
  db_record=$(cf_find_record_by_name "db.neramclasses.com")
  if [[ -n "$db_record" ]]; then
    local db_proxied
    db_proxied=$(echo "$db_record" | json_get "o.proxied")
    if [[ "$db_proxied" == "true" ]]; then
      log_success "db.neramclasses.com: Record exists, proxied=true (correct)"
    else
      log_warn "db.neramclasses.com: Record exists but proxied=false. Workers need proxy ON."
      if confirm_proceed "Enable proxy for db.neramclasses.com?"; then
        local db_id
        db_id=$(echo "$db_record" | json_get "o.id")
        cf_set_proxy "$db_id" "true"
        log_success "Proxy enabled for db.neramclasses.com"
      fi
    fi
  else
    log_warn "db.neramclasses.com: No record found. Worker route may handle this."
    log_info "If the Supabase proxy worker is deployed, this should be auto-created."
  fi

  # Check db-staging.neramclasses.com
  local db_staging_record
  db_staging_record=$(cf_find_record_by_name "db-staging.neramclasses.com")
  if [[ -n "$db_staging_record" ]]; then
    local dbs_proxied
    dbs_proxied=$(echo "$db_staging_record" | json_get "o.proxied")
    if [[ "$dbs_proxied" == "true" ]]; then
      log_success "db-staging.neramclasses.com: Record exists, proxied=true (correct)"
    else
      log_warn "db-staging.neramclasses.com: Record exists but proxied=false."
      if confirm_proceed "Enable proxy for db-staging.neramclasses.com?"; then
        local dbs_id
        dbs_id=$(echo "$db_staging_record" | json_get "o.id")
        cf_set_proxy "$dbs_id" "true"
        log_success "Proxy enabled for db-staging.neramclasses.com"
      fi
    fi
  else
    log_warn "db-staging.neramclasses.com: No record found."
  fi

  echo ""

  # ------------------------------------------------
  # Step 1.5: Prompt for TXT records
  # ------------------------------------------------
  log_step "Step 1.5: TXT Records (manual input)"

  echo "TXT records often include SPF, DKIM, Google Search Console verification, etc."
  echo "These were captured in the Phase 0 audit backup."
  echo ""
  echo "Common TXT records to add:"
  echo "  1. SPF record (e.g., v=spf1 include:...)"
  echo "  2. Google Search Console verification"
  echo "  3. Meta Business verification (WhatsApp API)"
  echo "  4. DMARC record (_dmarc subdomain)"
  echo ""

  if [[ "$FORCE_MODE" == "true" ]]; then
    log_info "Skipping interactive TXT input (--force mode). Add TXT records manually later."
  elif confirm_proceed "Do you want to add TXT records now?"; then
    local add_more=true
    while [[ "$add_more" == "true" ]]; do
      echo -e "\n${CYAN}Enter TXT record name (e.g., @ for root, _dmarc for DMARC):${NC}"
      read -r txt_name

      echo -e "${CYAN}Enter TXT record value:${NC}"
      read -r txt_value

      if [[ -n "$txt_name" && -n "$txt_value" ]]; then
        cf_create_txt_record "$txt_name" "$txt_value"
      fi

      if ! confirm_proceed "Add another TXT record?"; then
        add_more=false
      fi
    done
  else
    log_info "Skipping TXT records. You can add them later via Cloudflare dashboard or API."
  fi

  echo ""

  # ------------------------------------------------
  # Step 1.6: Prompt for MX records
  # ------------------------------------------------
  log_step "Step 1.6: MX Records"

  echo "If you use email on neramclasses.com, MX records are critical."
  echo "Check the Phase 0 audit backup for existing MX records."
  echo ""

  if [[ "$FORCE_MODE" == "true" ]]; then
    log_info "Skipping interactive MX input (--force mode). Add MX records manually later."
  elif confirm_proceed "Do you want to add MX records now?"; then
    local add_more_mx=true
    while [[ "$add_more_mx" == "true" ]]; do
      echo -e "\n${CYAN}Enter MX server (e.g., mail.example.com):${NC}"
      read -r mx_server

      echo -e "${CYAN}Enter MX priority (e.g., 10):${NC}"
      read -r mx_priority

      if [[ -n "$mx_server" && -n "$mx_priority" ]]; then
        local mx_body="{\"type\":\"MX\",\"name\":\"@\",\"content\":\"${mx_server}\",\"priority\":${mx_priority},\"ttl\":1}"
        local mx_response
        mx_response=$(cf_api POST "/zones/{zone_id}/dns_records" "$mx_body")
        local mx_success
        mx_success=$(echo "$mx_response" | json_get "o.success")
        if [[ "$mx_success" == "true" ]]; then
          log_success "Created MX: ${mx_server} (priority ${mx_priority})"
        else
          log_error "Failed to create MX record"
        fi
      fi

      if ! confirm_proceed "Add another MX record?"; then
        add_more_mx=false
      fi
    done
  else
    log_info "Skipping MX records."
  fi

  # ------------------------------------------------
  # Step 1.7: Generate rollback script
  # ------------------------------------------------
  log_step "Step 1.7: Generating rollback script"

  {
    echo "#!/usr/bin/env bash"
    echo "# Phase 1 Rollback: Delete DNS records created during Phase 1"
    echo "# Generated: $(date)"
    echo "# Run this to undo Phase 1 changes"
    echo ""
    echo "SCRIPT_DIR=\"\$(cd \"\$(dirname \"\${BASH_SOURCE[0]}\")\" && pwd)\""
    echo "source \"\$SCRIPT_DIR/../lib/common.sh\""
    echo "source \"\$SCRIPT_DIR/../lib/cloudflare-api.sh\""
    echo "load_env"
    echo ""
    echo "echo 'Rolling back Phase 1: Deleting created DNS records...'"
    echo ""
    for rid in "${created_ids[@]}"; do
      echo "cf_delete_dns_record \"${rid}\" && echo 'Deleted record ${rid}'"
    done
    echo ""
    echo "echo 'Phase 1 rollback complete'"
  } > "$rollback_file"

  chmod +x "$rollback_file"
  log_info "Rollback script saved: ${rollback_file}"

  # ------------------------------------------------
  # Step 1.8: Verify all records
  # ------------------------------------------------
  log_step "Step 1.8: Verifying created records"

  local final_records
  final_records=$(cf_list_dns_records)
  local final_count
  final_count=$(echo "$final_records" | json_array_length "o")

  echo -e "Total records in Cloudflare: ${BOLD}${final_count}${NC}\n"

  echo "$final_records" | node -e "
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

  echo ""
  save_state "phase1" "completed"
  log_success "Phase 1 complete. All DNS records created with proxy OFF (grey cloud)."
  log_info "Next step: Run 'migrate.sh phase2' to configure SSL and redirect rules."
}

run_phase1
