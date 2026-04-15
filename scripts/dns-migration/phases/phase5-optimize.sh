#!/usr/bin/env bash
# ============================================
# Phase 5: Optimization (Caching, Security, Performance)
# ============================================
# Final phase. Configures Cloudflare for optimal performance
# with Next.js / Vercel origin.

run_phase5() {
  log_header "Phase 5: Caching, Security & Performance"
  save_state "phase5" "in_progress"

  local rollback_file="$BACKUP_DIR/phase5_rollback_$(date '+%Y-%m-%d').sh"

  # Save current settings for rollback
  local old_ssl old_brotli old_early_hints old_rocket old_mirage old_security
  old_ssl=$(cf_get_setting "ssl")
  old_brotli=$(cf_get_setting "brotli")
  old_early_hints=$(cf_get_setting "early_hints")
  old_rocket=$(cf_get_setting "rocket_loader")
  old_mirage=$(cf_get_setting "mirage")
  old_security=$(cf_get_setting "security_level")

  # ------------------------------------------------
  # Step 5.1: Upgrade SSL to Full (Strict)
  # ------------------------------------------------
  log_step "Step 5.1: Upgrade SSL to Full (Strict)"

  echo "Now that proxy is active and SSL is verified, upgrading to Strict mode."
  echo "This ensures Cloudflare validates Vercel's origin certificate."
  echo ""

  if confirm_proceed "Upgrade SSL to Full (Strict)?"; then
    cf_patch_setting "ssl" '"strict"'
  else
    log_info "Keeping SSL at '${old_ssl}'"
  fi

  echo ""

  # ------------------------------------------------
  # Step 5.2: Performance Settings
  # ------------------------------------------------
  log_step "Step 5.2: Performance Settings"

  echo "Configuring performance settings optimized for Next.js:"
  echo ""
  echo "  Brotli compression:  ON  (smaller assets)"
  echo "  Early Hints:         ON  (103 responses for faster loading)"
  echo "  Rocket Loader:       OFF (breaks Next.js hydration)"
  echo "  Mirage:              OFF (breaks next/image component)"
  echo "  Auto Minify:         ON  (CSS, HTML, JS)"
  echo ""

  if confirm_proceed "Apply performance settings?"; then
    cf_patch_setting "brotli" '"on"'
    cf_patch_setting "early_hints" '"on"'
    cf_patch_setting "rocket_loader" '"off"'
    cf_patch_setting "mirage" '"off"'
    cf_patch_setting "minify" '{"css":"on","html":"on","js":"on"}'
  else
    log_info "Skipping performance settings"
  fi

  echo ""

  # ------------------------------------------------
  # Step 5.3: Security Settings
  # ------------------------------------------------
  log_step "Step 5.3: Security Settings"

  echo "Setting security level to 'medium' (balances protection and accessibility)."
  echo ""

  if confirm_proceed "Apply security settings?"; then
    cf_patch_setting "security_level" '"medium"'
  else
    log_info "Skipping security settings"
  fi

  echo ""

  # ------------------------------------------------
  # Step 5.4: Caching Rules
  # ------------------------------------------------
  log_step "Step 5.4: Caching Rules"

  echo "Creating cache rules optimized for Next.js + Vercel:"
  echo ""
  echo "  Rule 1: Static Assets (/_next/static/) -> Cache 30 days edge, 1 year browser"
  echo "  Rule 2: API Routes (/api/) -> Bypass cache"
  echo "  Rule 3: ISR Pages -> Respect origin cache headers"
  echo ""

  if confirm_proceed "Create caching rules?"; then
    local cache_rules='[
      {
        "expression": "(http.request.uri.path contains \"/_next/static/\" or http.request.uri.path contains \"/static/\")",
        "description": "Cache static assets aggressively",
        "action": "set_cache_settings",
        "action_parameters": {
          "cache": true,
          "edge_ttl": {
            "mode": "override_origin",
            "default": 2592000
          },
          "browser_ttl": {
            "mode": "override_origin",
            "default": 31536000
          }
        }
      },
      {
        "expression": "(starts_with(http.request.uri.path, \"/api/\"))",
        "description": "Bypass cache for API routes",
        "action": "set_cache_settings",
        "action_parameters": {
          "cache": false
        }
      },
      {
        "expression": "(not starts_with(http.request.uri.path, \"/api/\") and not http.request.uri.path contains \"/_next/static/\" and not http.request.uri.path contains \"/static/\")",
        "description": "ISR pages: respect origin cache headers",
        "action": "set_cache_settings",
        "action_parameters": {
          "cache": true,
          "edge_ttl": {
            "mode": "respect_origin"
          },
          "browser_ttl": {
            "mode": "respect_origin"
          }
        }
      }
    ]'

    cf_create_or_update_ruleset \
      "http_request_cache_settings" \
      "Next.js Cache Rules" \
      "$cache_rules"
  else
    log_info "Skipping cache rules"
  fi

  echo ""

  # ------------------------------------------------
  # Step 5.5: Bot Management (allow verified bots on app subdomain)
  # ------------------------------------------------
  log_step "Step 5.5: Bot Management"

  echo "Creating a rule to allow verified bots (Googlebot, Bingbot) on app.neramclasses.com."
  echo "This prevents Bot Fight Mode from blocking search engine crawlers."
  echo ""

  if confirm_proceed "Create bot exception rule?"; then
    local bot_rules='[
      {
        "expression": "(http.host eq \"app.neramclasses.com\" and cf.bot_management.verified_bot)",
        "description": "Allow verified bots on app subdomain",
        "action": "skip",
        "action_parameters": {
          "ruleset": "current"
        }
      }
    ]'

    cf_create_or_update_ruleset \
      "http_request_sbfm" \
      "Bot exception for app subdomain" \
      "$bot_rules" 2>/dev/null || log_info "Bot management rules may require a paid plan. Skipping."
  else
    log_info "Skipping bot management"
  fi

  echo ""

  # ------------------------------------------------
  # Step 5.6: Generate rollback script
  # ------------------------------------------------
  log_step "Step 5.6: Generating rollback script"

  {
    echo "#!/usr/bin/env bash"
    echo "# Phase 5 Rollback: Restore settings to pre-optimization values"
    echo "# Generated: $(date)"
    echo ""
    echo "SCRIPT_DIR=\"\$(cd \"\$(dirname \"\${BASH_SOURCE[0]}\")\" && pwd)\""
    echo "source \"\$SCRIPT_DIR/../lib/common.sh\""
    echo "source \"\$SCRIPT_DIR/../lib/cloudflare-api.sh\""
    echo "load_env"
    echo ""
    echo "echo 'Rolling back Phase 5...'"
    echo ""
    echo "# Restore settings"
    [[ -n "$old_ssl" ]] && echo "cf_patch_setting 'ssl' '\"${old_ssl}\"'"
    [[ -n "$old_brotli" ]] && echo "cf_patch_setting 'brotli' '\"${old_brotli}\"'"
    [[ -n "$old_early_hints" ]] && echo "cf_patch_setting 'early_hints' '\"${old_early_hints}\"'"
    [[ -n "$old_rocket" ]] && echo "cf_patch_setting 'rocket_loader' '\"${old_rocket}\"'"
    [[ -n "$old_mirage" ]] && echo "cf_patch_setting 'mirage' '\"${old_mirage}\"'"
    [[ -n "$old_security" ]] && echo "cf_patch_setting 'security_level' '\"${old_security}\"'"
    echo ""
    echo "# Remove cache ruleset"
    echo "CACHE_RS=\$(cf_find_ruleset_by_phase 'http_request_cache_settings')"
    echo "if [[ -n \"\$CACHE_RS\" ]]; then"
    echo "  cf_api DELETE \"/zones/{zone_id}/rulesets/\${CACHE_RS}\" > /dev/null"
    echo "  echo 'Deleted cache ruleset'"
    echo "fi"
    echo ""
    echo "echo 'Phase 5 rollback complete'"
  } > "$rollback_file"

  chmod +x "$rollback_file"
  log_info "Rollback script saved: ${rollback_file}"

  # ------------------------------------------------
  # Step 5.7: Final Verification
  # ------------------------------------------------
  log_step "Step 5.7: Final Verification"

  verify_all_production "true"
  echo ""
  verify_seo

  # ------------------------------------------------
  # Summary
  # ------------------------------------------------
  echo ""
  save_state "phase5" "completed"

  log_header "Migration Complete!"

  echo "  SSL:          Full (Strict)"
  echo "  Performance:  Brotli ON, Early Hints ON, Rocket Loader OFF, Mirage OFF"
  echo "  Caching:      Static assets cached, API bypassed, ISR respects origin"
  echo "  Security:     Medium level"
  echo ""
  echo "Next steps (manual):"
  echo "  1. Monitor all apps for 24-48 hours"
  echo "  2. Check Google Search Console for any new errors (after 48 hrs)"
  echo "  3. After 1 week, remove Vercel DNS zone (keep domains assigned to Vercel projects)"
  echo "  4. Compare Cloudflare analytics with existing analytics to verify no traffic loss"
  echo ""
  log_success "DNS migration from Vercel to Cloudflare is complete."
}

run_phase5
