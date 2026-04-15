#!/usr/bin/env bash
# ============================================
# DNS Migration - Cloudflare API Wrapper
# ============================================
# Requires: common.sh sourced first (for CF_API_TOKEN, CF_ZONE_ID, json_get, logging)
#
# IMPORTANT: Functions that return data via stdout send all log messages
# to stderr (>&2) so they don't contaminate captured output.

# ============================================
# Core API Function
# ============================================

# Usage: cf_api GET "/zones/{zone_id}/dns_records" [json_body]
# Returns: JSON response body via stdout. Sets CF_HTTP_CODE globally.
cf_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  # Substitute zone_id placeholder
  path="${path//\{zone_id\}/$CF_ZONE_ID}"

  local url="${CF_API_BASE}${path}"
  local args=(
    -s
    -X "$method"
    -H "Authorization: Bearer ${CF_API_TOKEN}"
    -H "Content-Type: application/json"
    -w "\n%{http_code}"
  )

  if [[ -n "$body" ]]; then
    args+=(--data "$body")
  fi

  local raw_response
  raw_response=$(curl "${args[@]}" "$url")

  # Extract HTTP status code (last line)
  CF_HTTP_CODE=$(echo "$raw_response" | tail -1)
  # Extract JSON body (everything except last line)
  local json_body
  json_body=$(echo "$raw_response" | sed '$d')

  # Check for API success
  local success
  success=$(echo "$json_body" | json_get "o.success" 2>/dev/null)

  if [[ "$success" != "true" ]]; then
    local errors
    errors=$(echo "$json_body" | json_get "o.errors" 2>/dev/null)
    if [[ -n "$errors" && "$errors" != "[]" ]]; then
      log_error "Cloudflare API error (${method} ${path}): ${errors}" >&2
    fi
  fi

  echo "$json_body"
}

# ============================================
# DNS Record Functions
# ============================================

# List all DNS records (handles pagination)
cf_list_dns_records() {
  local page=1
  local per_page=100
  local all_records="[]"

  while true; do
    local response
    response=$(cf_api GET "/zones/{zone_id}/dns_records?per_page=${per_page}&page=${page}")

    local count
    count=$(echo "$response" | json_array_length "o.result")

    if [[ "$count" == "0" ]]; then
      break
    fi

    # Merge results
    local page_records
    page_records=$(echo "$response" | json_get "o.result")
    all_records=$(node -e "
      const a=JSON.parse(process.argv[1]);
      const b=JSON.parse(process.argv[2]);
      process.stdout.write(JSON.stringify([...a,...b]));
    " "$all_records" "$page_records")

    if [[ "$count" -lt "$per_page" ]]; then
      break
    fi

    page=$((page + 1))
  done

  echo "$all_records"
}

# Find a DNS record by type and name
# Usage: cf_find_record "CNAME" "app.neramclasses.com"
# Returns: record JSON or empty string
cf_find_record() {
  local type="$1"
  local name="$2"

  local response
  response=$(cf_api GET "/zones/{zone_id}/dns_records?type=${type}&name=${name}")

  local count
  count=$(echo "$response" | json_array_length "o.result")

  if [[ "$count" -gt 0 ]]; then
    echo "$response" | json_get "o.result[0]"
  else
    echo ""
  fi
}

# Find any DNS record by name (any type)
# Usage: cf_find_record_by_name "app.neramclasses.com"
cf_find_record_by_name() {
  local name="$1"

  local response
  response=$(cf_api GET "/zones/{zone_id}/dns_records?name=${name}")

  local count
  count=$(echo "$response" | json_array_length "o.result")

  if [[ "$count" -gt 0 ]]; then
    echo "$response" | json_get "o.result[0]"
  else
    echo ""
  fi
}

# Create a DNS record with duplicate detection
# Usage: cf_create_dns_record "CNAME" "app" "cname.vercel-dns.com" false
# Returns: record ID on success, empty on skip
cf_create_dns_record() {
  local type="$1"
  local name="$2"
  local content="$3"
  local proxied="${4:-false}"
  local ttl="${5:-1}"  # 1 = auto

  # Build full name for lookup
  local full_name="$name"
  if [[ "$name" == "@" ]]; then
    full_name="$DOMAIN"
  elif [[ "$name" != *"."* ]]; then
    full_name="${name}.${DOMAIN}"
  fi

  # Check for existing record
  local existing
  existing=$(cf_find_record "$type" "$full_name")

  if [[ -n "$existing" ]]; then
    local existing_content
    existing_content=$(echo "$existing" | json_get "o.content")
    local existing_id
    existing_id=$(echo "$existing" | json_get "o.id")

    if [[ "$existing_content" == "$content" ]]; then
      log_success "Record already exists: ${type} ${full_name} -> ${content} (skipped)" >&2
      echo "$existing_id"
      return 0
    else
      log_warn "Record exists with different content:" >&2
      log_warn "  Current: ${type} ${full_name} -> ${existing_content}" >&2
      log_warn "  Desired: ${type} ${full_name} -> ${content}" >&2

      if confirm_proceed "Update this record?"; then
        local update_body="{\"type\":\"${type}\",\"name\":\"${name}\",\"content\":\"${content}\",\"proxied\":${proxied},\"ttl\":${ttl}}"
        local response
        response=$(cf_api PUT "/zones/{zone_id}/dns_records/${existing_id}" "$update_body")
        local success
        success=$(echo "$response" | json_get "o.success")
        if [[ "$success" == "true" ]]; then
          log_success "Updated: ${type} ${full_name} -> ${content}" >&2
          echo "$existing_id"
          return 0
        else
          log_error "Failed to update record" >&2
          return 1
        fi
      else
        log_info "Skipped: ${type} ${full_name}" >&2
        echo "$existing_id"
        return 0
      fi
    fi
  fi

  # Also check if a record of a different type exists for this name
  local any_existing
  any_existing=$(cf_find_record_by_name "$full_name")
  if [[ -n "$any_existing" ]]; then
    local existing_type
    existing_type=$(echo "$any_existing" | json_get "o.type")
    local existing_content
    existing_content=$(echo "$any_existing" | json_get "o.content")

    if [[ "$existing_type" != "$type" ]]; then
      log_warn "Different record type exists for ${full_name}:" >&2
      log_warn "  Current: ${existing_type} -> ${existing_content}" >&2
      log_warn "  Desired: ${type} -> ${content}" >&2
      if ! confirm_proceed "Delete existing ${existing_type} record and create ${type}?"; then
        log_info "Skipped: ${type} ${full_name}" >&2
        return 0
      fi
      local existing_id
      existing_id=$(echo "$any_existing" | json_get "o.id")
      cf_api DELETE "/zones/{zone_id}/dns_records/${existing_id}" > /dev/null
      log_info "Deleted existing ${existing_type} record for ${full_name}" >&2
    fi
  fi

  # Create new record
  local body="{\"type\":\"${type}\",\"name\":\"${name}\",\"content\":\"${content}\",\"proxied\":${proxied},\"ttl\":${ttl}}"
  local response
  response=$(cf_api POST "/zones/{zone_id}/dns_records" "$body")

  local success
  success=$(echo "$response" | json_get "o.success")

  if [[ "$success" == "true" ]]; then
    local record_id
    record_id=$(echo "$response" | json_get "o.result.id")
    log_success "Created: ${type} ${full_name} -> ${content} (proxied=${proxied})" >&2
    echo "$record_id"
    return 0
  else
    log_error "Failed to create: ${type} ${full_name} -> ${content}" >&2
    echo "$response" | json_get "o.errors" >&2 2>/dev/null
    return 1
  fi
}

# Create a TXT record
# Usage: cf_create_txt_record "neramclasses.com" "v=spf1 include:..."
cf_create_txt_record() {
  local name="$1"
  local content="$2"

  local full_name="$name"
  if [[ "$name" == "@" ]]; then
    full_name="$DOMAIN"
  elif [[ "$name" != *"."* ]]; then
    full_name="${name}.${DOMAIN}"
  fi

  # Check for existing TXT record with same content
  local response
  response=$(cf_api GET "/zones/{zone_id}/dns_records?type=TXT&name=${full_name}")
  local existing_content
  existing_content=$(echo "$response" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const o=JSON.parse(d);
      const found=o.result&&o.result.find(r=>r.content==='$content');
      process.stdout.write(found?'exists':'');
    });
  " 2>/dev/null)

  if [[ "$existing_content" == "exists" ]]; then
    log_success "TXT record already exists: ${full_name} (skipped)" >&2
    return 0
  fi

  local escaped_content
  escaped_content=$(echo "$content" | sed 's/"/\\"/g')
  local body="{\"type\":\"TXT\",\"name\":\"${name}\",\"content\":\"${escaped_content}\",\"ttl\":1}"
  local create_response
  create_response=$(cf_api POST "/zones/{zone_id}/dns_records" "$body")

  local success
  success=$(echo "$create_response" | json_get "o.success")

  if [[ "$success" == "true" ]]; then
    log_success "Created TXT: ${full_name}" >&2
    return 0
  else
    log_error "Failed to create TXT: ${full_name}" >&2
    return 1
  fi
}

# Delete a DNS record by ID
cf_delete_dns_record() {
  local record_id="$1"
  cf_api DELETE "/zones/{zone_id}/dns_records/${record_id}" > /dev/null
}

# Update proxy status of a DNS record
# Usage: cf_set_proxy "record_id" true
cf_set_proxy() {
  local record_id="$1"
  local proxied="$2"

  local response
  response=$(cf_api PATCH "/zones/{zone_id}/dns_records/${record_id}" "{\"proxied\":${proxied}}")

  local success
  success=$(echo "$response" | json_get "o.success")

  if [[ "$success" == "true" ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================
# Zone Settings Functions
# ============================================

# Get a zone setting value
# Usage: cf_get_setting "ssl"
cf_get_setting() {
  local setting="$1"
  local response
  response=$(cf_api GET "/zones/{zone_id}/settings/${setting}")
  echo "$response" | json_get "o.result.value"
}

# Patch a zone setting
# Usage: cf_patch_setting "ssl" '"full"'
# Usage: cf_patch_setting "minify" '{"css":"on","html":"on","js":"on"}'
cf_patch_setting() {
  local setting="$1"
  local value="$2"

  local response
  response=$(cf_api PATCH "/zones/{zone_id}/settings/${setting}" "{\"value\":${value}}")

  local success
  success=$(echo "$response" | json_get "o.success")

  if [[ "$success" == "true" ]]; then
    log_success "Setting updated: ${setting} = ${value}"
    return 0
  else
    log_error "Failed to update setting: ${setting}"
    echo "$response" | json_get "o.errors" >&2 2>/dev/null
    return 1
  fi
}

# ============================================
# Rulesets Functions
# ============================================

# List all rulesets for the zone
cf_list_rulesets() {
  local response
  response=$(cf_api GET "/zones/{zone_id}/rulesets")
  echo "$response" | json_get "o.result"
}

# Find ruleset by phase
# Usage: cf_find_ruleset_by_phase "http_request_dynamic_redirect"
# Returns: ruleset ID or empty
cf_find_ruleset_by_phase() {
  local phase="$1"
  local rulesets
  rulesets=$(cf_list_rulesets)

  echo "$rulesets" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const arr=JSON.parse(d);
        const found=arr.find(r=>r.phase==='${phase}'&&r.source==='firewall_custom');
        process.stdout.write(found?found.id:'');
      } catch(e) { process.stdout.write(''); }
    });
  "
}

# Create or update a ruleset
# Usage: cf_create_or_update_ruleset "http_request_dynamic_redirect" "Rule Name" "$rules_json"
cf_create_or_update_ruleset() {
  local phase="$1"
  local name="$2"
  local rules_json="$3"

  # Check if ruleset for this phase already exists
  local existing_id
  existing_id=$(cf_find_ruleset_by_phase "$phase")

  if [[ -n "$existing_id" ]]; then
    log_info "Ruleset for phase '${phase}' already exists (${existing_id}), updating..." >&2
    local body="{\"name\":\"${name}\",\"kind\":\"zone\",\"phase\":\"${phase}\",\"rules\":${rules_json}}"
    local response
    response=$(cf_api PUT "/zones/{zone_id}/rulesets/${existing_id}" "$body")
    local success
    success=$(echo "$response" | json_get "o.success")
    if [[ "$success" == "true" ]]; then
      log_success "Ruleset updated: ${name}" >&2
      echo "$existing_id"
      return 0
    else
      log_error "Failed to update ruleset: ${name}" >&2
      echo "$response" | json_get "o.errors" >&2 2>/dev/null
      return 1
    fi
  else
    local body="{\"name\":\"${name}\",\"kind\":\"zone\",\"phase\":\"${phase}\",\"rules\":${rules_json}}"
    local response
    response=$(cf_api POST "/zones/{zone_id}/rulesets" "$body")
    local success
    success=$(echo "$response" | json_get "o.success")
    if [[ "$success" == "true" ]]; then
      local ruleset_id
      ruleset_id=$(echo "$response" | json_get "o.result.id")
      log_success "Ruleset created: ${name} (${ruleset_id})" >&2
      echo "$ruleset_id"
      return 0
    else
      log_error "Failed to create ruleset: ${name}" >&2
      echo "$response" | json_get "o.errors" >&2 2>/dev/null
      return 1
    fi
  fi
}

# ============================================
# Zone Details
# ============================================

# Get zone activation status and assigned nameservers
cf_get_zone_details() {
  cf_api GET "/zones/{zone_id}"
}

cf_get_zone_status() {
  local response
  response=$(cf_get_zone_details)
  echo "$response" | json_get "o.result.status"
}

cf_get_assigned_nameservers() {
  local response
  response=$(cf_get_zone_details)
  echo "$response" | json_get "o.result.name_servers"
}
