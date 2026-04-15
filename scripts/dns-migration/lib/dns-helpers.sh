#!/usr/bin/env bash
# ============================================
# DNS Migration - DNS Lookup Helpers
# ============================================
# Uses nslookup (dig is not available on Windows)
# Requires: common.sh sourced first

# Public DNS resolvers for propagation checks
DNS_RESOLVERS=("8.8.8.8" "1.1.1.1" "208.67.222.222")
DNS_RESOLVER_NAMES=("Google" "Cloudflare" "OpenDNS")

# ============================================
# Core nslookup Wrapper
# ============================================

# Run nslookup and return parsed output
# Usage: dns_lookup "neramclasses.com" "A" "8.8.8.8"
dns_lookup() {
  local domain="$1"
  local type="${2:-A}"
  local server="${3:-}"

  local args=("-type=${type}" "$domain")
  if [[ -n "$server" ]]; then
    args+=("$server")
  fi

  nslookup "${args[@]}" 2>/dev/null
}

# ============================================
# Record Type Queries
# ============================================

# Get A record IP(s) for a domain
dns_get_a() {
  local domain="$1"
  local server="${2:-}"

  local output
  output=$(dns_lookup "$domain" "A" "$server")

  # Parse nslookup output for Address lines (skip the server address)
  echo "$output" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const lines=d.split('\n');
      let pastServer=false;
      const results=[];
      for(const line of lines){
        const trimmed=line.trim();
        if(trimmed.startsWith('Name:')){pastServer=true;continue}
        if(pastServer&&trimmed.startsWith('Address')){
          const addr=trimmed.split(/:\s*/)[1];
          if(addr)results.push(addr.trim());
        }
        if(trimmed.includes('canonical name')){
          // CNAME response, extract target
          const parts=trimmed.split('canonical name');
          if(parts[1]){
            const cname=parts[1].replace(/[=\s]/g,'').trim();
            results.push('CNAME:'+cname);
          }
        }
      }
      process.stdout.write(results.join('\n'));
    });
  "
}

# Get CNAME target for a domain
dns_get_cname() {
  local domain="$1"
  local server="${2:-}"

  local output
  output=$(dns_lookup "$domain" "CNAME" "$server")

  echo "$output" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const lines=d.split('\n');
      for(const line of lines){
        const trimmed=line.trim();
        // Match: domain canonical name = target
        if(trimmed.includes('canonical name')){
          const parts=trimmed.split(/=\s*/);
          if(parts[1])process.stdout.write(parts[1].trim());
          return;
        }
        // Match: domain CNAME target
        if(trimmed.includes('CNAME')){
          const parts=trimmed.split(/\s+/);
          const idx=parts.indexOf('CNAME');
          if(idx>=0&&parts[idx+1])process.stdout.write(parts[idx+1].trim());
          return;
        }
        // Match: alias line
        if(trimmed.startsWith('Aliases:')){
          const alias=trimmed.replace('Aliases:','').trim();
          if(alias)process.stdout.write(alias);
          return;
        }
      }
    });
  "
}

# Get nameservers for a domain
dns_get_nameservers() {
  local domain="$1"
  local server="${2:-}"

  local output
  output=$(dns_lookup "$domain" "NS" "$server")

  echo "$output" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const lines=d.split('\n');
      const results=[];
      for(const line of lines){
        const trimmed=line.trim();
        if(trimmed.includes('nameserver')){
          const parts=trimmed.split(/=\s*/);
          if(parts[1])results.push(parts[1].trim());
        }
      }
      process.stdout.write(results.join('\n'));
    });
  "
}

# Get MX records for a domain
dns_get_mx() {
  local domain="$1"
  local server="${2:-}"

  local output
  output=$(dns_lookup "$domain" "MX" "$server")

  echo "$output" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const lines=d.split('\n');
      const results=[];
      for(const line of lines){
        const trimmed=line.trim();
        if(trimmed.includes('mail exchanger')){
          const match=trimmed.match(/mail exchanger\s*=\s*(.*)/);
          if(match)results.push(match[1].trim());
        }
        if(trimmed.includes('MX preference')){
          results.push(trimmed);
        }
      }
      process.stdout.write(results.join('\n'));
    });
  "
}

# Get TXT records for a domain
dns_get_txt() {
  local domain="$1"
  local server="${2:-}"

  local output
  output=$(dns_lookup "$domain" "TXT" "$server")

  echo "$output" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const lines=d.split('\n');
      const results=[];
      let capture=false;
      for(const line of lines){
        const trimmed=line.trim();
        if(trimmed.includes('text =')){
          const match=trimmed.match(/text\s*=\s*(.*)/);
          if(match)results.push(match[1].trim().replace(/^\"|\"$/g,''));
        }
      }
      process.stdout.write(results.join('\n'));
    });
  "
}

# ============================================
# Propagation Checking
# ============================================

# Check if nameservers have propagated across multiple resolvers
# Usage: dns_check_ns_propagation "neramclasses.com" "aria.ns.cloudflare.com"
# Returns: 0 if all resolvers see new NS, 1 otherwise
dns_check_ns_propagation() {
  local domain="$1"
  local expected_ns="$2"  # Partial match (e.g., "cloudflare.com")

  local all_propagated=true

  for i in "${!DNS_RESOLVERS[@]}"; do
    local resolver="${DNS_RESOLVERS[$i]}"
    local resolver_name="${DNS_RESOLVER_NAMES[$i]}"
    local ns_result
    ns_result=$(dns_get_nameservers "$domain" "$resolver")

    if echo "$ns_result" | grep -qi "$expected_ns"; then
      echo -e "  ${GREEN}[OK]${NC} ${resolver_name} (${resolver}): Sees Cloudflare NS"
    else
      echo -e "  ${YELLOW}[WAIT]${NC} ${resolver_name} (${resolver}): Still old NS"
      all_propagated=false
    fi
  done

  if [[ "$all_propagated" == "true" ]]; then
    return 0
  else
    return 1
  fi
}

# Poll for NS propagation with timeout
# Usage: dns_poll_propagation "neramclasses.com" "cloudflare.com" 7200
dns_poll_propagation() {
  local domain="$1"
  local expected_ns="$2"
  local timeout="${3:-7200}"  # 2 hours default
  local interval="${4:-30}"   # 30 seconds

  local elapsed=0

  log_info "Polling DNS propagation every ${interval}s (timeout: ${timeout}s)..."
  echo ""

  while [[ $elapsed -lt $timeout ]]; do
    echo -e "${CYAN}--- Check at $(date '+%H:%M:%S') (${elapsed}s elapsed) ---${NC}"

    if dns_check_ns_propagation "$domain" "$expected_ns"; then
      echo ""
      log_success "DNS propagation complete across all resolvers!"
      return 0
    fi

    echo ""
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  log_warn "DNS propagation not complete after ${timeout}s. This is normal, it can take up to 48 hours."
  log_warn "You can continue manually once propagation completes."
  return 1
}

# ============================================
# Full DNS Audit for a Domain
# ============================================

# Run a complete DNS audit for one domain and output results
dns_audit_domain() {
  local domain="$1"

  echo -e "${BOLD}--- ${domain} ---${NC}"

  # A record
  local a_result
  a_result=$(dns_get_a "$domain")
  if [[ -n "$a_result" ]]; then
    echo "  A:     $a_result"
  fi

  # CNAME
  local cname_result
  cname_result=$(dns_get_cname "$domain")
  if [[ -n "$cname_result" ]]; then
    echo "  CNAME: $cname_result"
  fi

  if [[ -z "$a_result" && -z "$cname_result" ]]; then
    echo "  (no A/CNAME records found)"
  fi

  echo ""
}