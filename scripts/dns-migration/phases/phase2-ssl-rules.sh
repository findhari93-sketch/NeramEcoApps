#!/usr/bin/env bash
# ============================================
# Phase 2: SSL Settings & Redirect Rules
# ============================================
# Configures Cloudflare SSL/TLS and creates www-to-non-www redirect.
# Safe to run while zone is pending. Settings take effect after NS switch.

run_phase2() {
  log_header "Phase 2: SSL Settings & Redirect Rules"
  save_state "phase2" "in_progress"

  local rollback_file="$BACKUP_DIR/phase2_rollback_$(date '+%Y-%m-%d').sh"

  # Save current settings for rollback
  local old_ssl old_https old_tls old_rewrites
  old_ssl=$(cf_get_setting "ssl")
  old_https=$(cf_get_setting "always_use_https")
  old_tls=$(cf_get_setting "min_tls_version")
  old_rewrites=$(cf_get_setting "automatic_https_rewrites")

  log_info "Current settings:"
  echo "  SSL mode:              ${old_ssl:-not set}"
  echo "  Always Use HTTPS:      ${old_https:-not set}"
  echo "  Min TLS Version:       ${old_tls:-not set}"
  echo "  Auto HTTPS Rewrites:   ${old_rewrites:-not set}"
  echo ""

  # ------------------------------------------------
  # Step 2.1: Configure SSL/TLS
  # ------------------------------------------------
  log_step "Step 2.1: SSL/TLS Settings"

  echo "Setting SSL mode to 'Full' (will upgrade to 'Strict' in Phase 5 after proxy is verified)."
  echo ""

  if ! confirm_proceed "Apply SSL/TLS settings?"; then
    save_state "phase2" "failed"
    return 1
  fi

  # SSL mode: Full (not Strict yet, wait until proxy is verified)
  cf_patch_setting "ssl" '"full"'

  # Always Use HTTPS
  cf_patch_setting "always_use_https" '"on"'

  # Minimum TLS 1.2
  cf_patch_setting "min_tls_version" '"1.2"'

  # Automatic HTTPS Rewrites
  cf_patch_setting "automatic_https_rewrites" '"on"'

  echo ""

  # ------------------------------------------------
  # Step 2.2: www-to-non-www Redirect Rule
  # ------------------------------------------------
  log_step "Step 2.2: www-to-non-www Redirect Rule"

  echo "Creating a 301 redirect: www.neramclasses.com -> neramclasses.com"
  echo "This fixes the www/non-www canonicalization flagged in the SEO audit."
  echo "(This rule only works after Cloudflare proxy is enabled on the www record)"
  echo ""

  if ! confirm_proceed "Create www redirect rule?"; then
    log_info "Skipping redirect rule"
  else
    local redirect_rules='[{
      "expression": "(http.host eq \"www.neramclasses.com\")",
      "description": "Redirect www to non-www",
      "action": "redirect",
      "action_parameters": {
        "from_value": {
          "status_code": 301,
          "target_url": {
            "expression": "concat(\"https://neramclasses.com\", http.request.uri.path)"
          },
          "preserve_query_string": true
        }
      }
    }]'

    cf_create_or_update_ruleset \
      "http_request_dynamic_redirect" \
      "www to non-www redirect" \
      "$redirect_rules"
  fi

  echo ""

  # ------------------------------------------------
  # Step 2.3: Generate rollback script
  # ------------------------------------------------
  log_step "Step 2.3: Generating rollback script"

  {
    echo "#!/usr/bin/env bash"
    echo "# Phase 2 Rollback: Restore SSL settings and remove redirect rules"
    echo "# Generated: $(date)"
    echo ""
    echo "SCRIPT_DIR=\"\$(cd \"\$(dirname \"\${BASH_SOURCE[0]}\")\" && pwd)\""
    echo "source \"\$SCRIPT_DIR/../lib/common.sh\""
    echo "source \"\$SCRIPT_DIR/../lib/cloudflare-api.sh\""
    echo "load_env"
    echo ""
    echo "echo 'Rolling back Phase 2...'"
    echo ""
    echo "# Restore SSL settings"
    if [[ -n "$old_ssl" ]]; then
      echo "cf_patch_setting 'ssl' '\"${old_ssl}\"'"
    fi
    if [[ -n "$old_https" ]]; then
      echo "cf_patch_setting 'always_use_https' '\"${old_https}\"'"
    fi
    if [[ -n "$old_tls" ]]; then
      echo "cf_patch_setting 'min_tls_version' '\"${old_tls}\"'"
    fi
    if [[ -n "$old_rewrites" ]]; then
      echo "cf_patch_setting 'automatic_https_rewrites' '\"${old_rewrites}\"'"
    fi
    echo ""
    echo "# Remove redirect ruleset"
    echo "RULESET_ID=\$(cf_find_ruleset_by_phase 'http_request_dynamic_redirect')"
    echo "if [[ -n \"\$RULESET_ID\" ]]; then"
    echo "  cf_api DELETE \"/zones/{zone_id}/rulesets/\${RULESET_ID}\" > /dev/null"
    echo "  echo 'Deleted redirect ruleset'"
    echo "fi"
    echo ""
    echo "echo 'Phase 2 rollback complete'"
  } > "$rollback_file"

  chmod +x "$rollback_file"
  log_info "Rollback script saved: ${rollback_file}"

  # ------------------------------------------------
  # Summary
  # ------------------------------------------------
  log_step "Phase 2 Summary"

  echo "Settings applied:"
  echo "  SSL mode:              Full"
  echo "  Always Use HTTPS:      ON"
  echo "  Min TLS Version:       1.2"
  echo "  Auto HTTPS Rewrites:   ON"
  echo "  www Redirect:          301 -> neramclasses.com"
  echo ""

  save_state "phase2" "completed"
  log_success "Phase 2 complete."
  log_info "Next step: Run 'migrate.sh phase3' to switch nameservers at GoDaddy."
}

run_phase2
