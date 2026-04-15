#!/usr/bin/env bash
# ============================================
# DNS Migration - Verification Functions
# ============================================
# Requires: common.sh sourced first

# ============================================
# HTTP Verification
# ============================================

# Check HTTP status code for a domain
# Usage: verify_http "neramclasses.com"
# Returns: HTTP status code, sets VERIFY_HTTP_CODE
verify_http() {
  local domain="$1"
  local timeout="${2:-10}"

  VERIFY_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time "$timeout" \
    -L "https://${domain}" 2>/dev/null)

  echo "$VERIFY_HTTP_CODE"
}

# Check if a domain returns a healthy HTTP response (200 or 301/302)
verify_http_healthy() {
  local domain="$1"
  local code
  code=$(verify_http "$domain")

  case "$code" in
    200|301|302|304)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# ============================================
# SSL Verification
# ============================================

# Check SSL certificate for a domain
# Returns: issuer string
verify_ssl() {
  local domain="$1"

  local ssl_info
  ssl_info=$(echo | openssl s_client -servername "$domain" -connect "${domain}:443" 2>/dev/null | \
    openssl x509 -noout -issuer -subject -dates 2>/dev/null)

  echo "$ssl_info"
}

# Check if SSL is valid (non-empty issuer)
verify_ssl_valid() {
  local domain="$1"
  local ssl_info
  ssl_info=$(verify_ssl "$domain")

  if [[ -n "$ssl_info" ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================
# Cloudflare Proxy Verification
# ============================================

# Check if Cloudflare proxy is active (cf-ray header present)
verify_cloudflare_active() {
  local domain="$1"

  local headers
  headers=$(curl -sI --max-time 10 "https://${domain}" 2>/dev/null)

  if echo "$headers" | grep -qi "cf-ray"; then
    return 0
  else
    return 1
  fi
}

# Get cf-ray header value
get_cf_ray() {
  local domain="$1"
  curl -sI --max-time 10 "https://${domain}" 2>/dev/null | \
    grep -i "cf-ray" | awk '{print $2}' | tr -d '\r'
}

# ============================================
# Bot Access Verification
# ============================================

# Check if bots can access a URL
verify_bot_access() {
  local url="$1"
  local bot_ua="${2:-Googlebot}"

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    -A "$bot_ua" \
    "$url" 2>/dev/null)

  if [[ "$code" == "200" ]]; then
    return 0
  else
    return 1
  fi
}

# ============================================
# Comprehensive Verification
# ============================================

# Run all verification checks for a single domain
# Usage: verify_domain "neramclasses.com" [check_proxy]
verify_domain() {
  local domain="$1"
  local check_proxy="${2:-false}"

  local all_pass=true

  # HTTP check
  local http_code
  http_code=$(verify_http "$domain")
  case "$http_code" in
    200|301|302)
      echo -e "  ${GREEN}[OK]${NC} HTTP: ${http_code}"
      ;;
    000)
      echo -e "  ${RED}[FAIL]${NC} HTTP: Connection failed"
      all_pass=false
      ;;
    *)
      echo -e "  ${RED}[FAIL]${NC} HTTP: ${http_code}"
      all_pass=false
      ;;
  esac

  # SSL check
  if verify_ssl_valid "$domain"; then
    echo -e "  ${GREEN}[OK]${NC} SSL: Valid certificate"
  else
    echo -e "  ${RED}[FAIL]${NC} SSL: Invalid or missing certificate"
    all_pass=false
  fi

  # Cloudflare proxy check (optional)
  if [[ "$check_proxy" == "true" ]]; then
    if verify_cloudflare_active "$domain"; then
      local ray
      ray=$(get_cf_ray "$domain")
      echo -e "  ${GREEN}[OK]${NC} Cloudflare proxy: Active (cf-ray: ${ray})"
    else
      echo -e "  ${YELLOW}[WARN]${NC} Cloudflare proxy: Not active (DNS-only mode)"
    fi
  fi

  if [[ "$all_pass" == "true" ]]; then
    return 0
  else
    return 1
  fi
}

# Run verification for all production subdomains
verify_all_production() {
  local check_proxy="${1:-false}"
  local all_pass=true

  log_step "Verifying all production subdomains"

  local domains=(
    "neramclasses.com"
    "www.neramclasses.com"
    "app.neramclasses.com"
    "nexus.neramclasses.com"
    "admin.neramclasses.com"
  )

  for domain in "${domains[@]}"; do
    echo -e "\n${BOLD}${domain}${NC}"
    if ! verify_domain "$domain" "$check_proxy"; then
      all_pass=false
    fi
  done

  echo ""

  if [[ "$all_pass" == "true" ]]; then
    log_success "All production subdomains are healthy"
    return 0
  else
    log_error "Some subdomains have issues"
    return 1
  fi
}

# Run verification for staging subdomains
verify_all_staging() {
  local check_proxy="${1:-false}"
  local all_pass=true

  log_step "Verifying staging subdomains"

  local domains=(
    "staging.neramclasses.com"
    "staging-app.neramclasses.com"
    "staging-nexus.neramclasses.com"
    "staging-admin.neramclasses.com"
  )

  for domain in "${domains[@]}"; do
    echo -e "\n${BOLD}${domain}${NC}"
    if ! verify_domain "$domain" "$check_proxy"; then
      all_pass=false
    fi
  done

  echo ""

  if [[ "$all_pass" == "true" ]]; then
    log_success "All staging subdomains are healthy"
    return 0
  else
    log_warn "Some staging subdomains have issues (may be expected)"
    return 1
  fi
}

# Verify SEO-critical resources
verify_seo() {
  log_step "Verifying SEO resources"

  local all_pass=true

  # robots.txt
  if verify_bot_access "https://neramclasses.com/robots.txt" "Googlebot"; then
    echo -e "  ${GREEN}[OK]${NC} robots.txt accessible (Googlebot)"
  else
    echo -e "  ${RED}[FAIL]${NC} robots.txt not accessible"
    all_pass=false
  fi

  # llms.txt
  if verify_bot_access "https://neramclasses.com/llms.txt" "GPTBot"; then
    echo -e "  ${GREEN}[OK]${NC} llms.txt accessible (GPTBot)"
  else
    echo -e "  ${YELLOW}[WARN]${NC} llms.txt not accessible (may not exist)"
  fi

  # sitemap.xml
  if verify_bot_access "https://neramclasses.com/sitemap.xml" "Googlebot"; then
    echo -e "  ${GREEN}[OK]${NC} sitemap.xml accessible (Googlebot)"
  else
    echo -e "  ${YELLOW}[WARN]${NC} sitemap.xml not accessible"
  fi

  # App subdomain bot access
  if verify_bot_access "https://app.neramclasses.com/robots.txt" "Googlebot"; then
    echo -e "  ${GREEN}[OK]${NC} app.neramclasses.com/robots.txt accessible"
  else
    echo -e "  ${YELLOW}[WARN]${NC} app.neramclasses.com/robots.txt blocked"
  fi

  echo ""

  if [[ "$all_pass" == "true" ]]; then
    return 0
  else
    return 1
  fi
}