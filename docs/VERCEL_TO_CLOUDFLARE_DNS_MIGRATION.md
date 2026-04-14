# Vercel → Cloudflare DNS Migration Plan

## Neram Ecosystem — Zero-Downtime Domain Transfer

> **Claude Code Task File** — Feed this to Claude Code to execute the migration step by step.
> **CRITICAL:** All 4 apps are LIVE with active student traffic. Every step must be verified before proceeding.

---

## Current State

| App | Subdomain | Platform | Status |
|-----|-----------|----------|--------|
| Marketing site | `neramclasses.com` / `www.neramclasses.com` | Vercel | ✅ Live |
| Tools PWA (aiArchitek) | `app.neramclasses.com` | Vercel | ✅ Live |
| Nexus Classroom | `nexus.neramclasses.com` | Vercel | ✅ Live |
| Admin Panel | `admin.neramclasses.com` | Vercel | ✅ Live |

**Current DNS:** Managed by Vercel (nameservers point to Vercel)
**CDN:** Cloudflare already in use for asset delivery
**SSL:** Vercel-managed automatic SSL
**Domain Registrar:** (confirm — likely GoDaddy, Namecheap, or similar)

---

## Pre-Migration Checklist

Run these commands / checks BEFORE touching any DNS:

### Step 0A: Audit Current DNS Records

```bash
# Export all current DNS records — DO THIS FIRST
# Run from terminal, save output as your rollback reference

echo "=== Current DNS Records for neramclasses.com ==="
dig neramclasses.com ANY +noall +answer
dig www.neramclasses.com ANY +noall +answer
dig app.neramclasses.com ANY +noall +answer
dig nexus.neramclasses.com ANY +noall +answer
dig admin.neramclasses.com ANY +noall +answer

echo "=== Current Nameservers ==="
dig neramclasses.com NS +short

echo "=== Current A/CNAME Records ==="
dig neramclasses.com A +short
dig www.neramclasses.com CNAME +short
dig app.neramclasses.com CNAME +short
dig nexus.neramclasses.com CNAME +short
dig admin.neramclasses.com CNAME +short

echo "=== MX Records (if any) ==="
dig neramclasses.com MX +short

echo "=== TXT Records (SPF, DKIM, verification) ==="
dig neramclasses.com TXT +short
dig _dmarc.neramclasses.com TXT +short
```

> **ACTION:** Save ALL output to a file called `dns_backup_YYYY-MM-DD.txt`. This is your rollback reference.

### Step 0B: Document Vercel DNS Verification Records

1. Go to **Vercel Dashboard → Project Settings → Domains** for each project
2. Note down any `_vercel` TXT verification records
3. Screenshot or copy the exact CNAME targets (e.g., `cname.vercel-dns.com`)

### Step 0C: Check for Non-Obvious DNS Records

Look for:
- [ ] **Email (MX records)** — If using custom email on neramclasses.com
- [ ] **SPF/DKIM/DMARC** TXT records — For email deliverability (important for re-engagement emails)
- [ ] **Google Search Console** verification TXT record
- [ ] **Meta Business verification** TXT record (for WhatsApp API)
- [ ] **Any `_acme-challenge`** records — For SSL certificate validation
- [ ] **Supabase** custom domain verification (if applicable)
- [ ] **Razorpay** webhook domain verification (if applicable)

### Step 0D: Note Current TTLs

```bash
dig neramclasses.com A +noall +answer | awk '{print $2}'
```

> If TTLs are high (3600+), lower them to 300 (5 min) at least 24-48 hours BEFORE migration. This ensures fast propagation when you switch.

---

## Phase 1: Cloudflare Setup (No Downtime Risk)

These steps don't affect the live site at all.

### Step 1.1: Add Domain to Cloudflare

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click **"Add a Site"** → Enter `neramclasses.com`
3. Select plan:
   - **Free plan** is sufficient (you already have CDN benefits)
   - Pro ($20/mo) adds WAF rules, image optimization — consider for later
4. Cloudflare will scan and import existing DNS records automatically

### Step 1.2: Verify Imported Records

Cloudflare auto-imports records. **CRITICALLY VERIFY** each one matches your backup from Step 0A:

| Type | Name | Target | Proxy Status | Notes |
|------|------|--------|--------------|-------|
| A or CNAME | `@` (root) | `76.76.21.21` or `cname.vercel-dns.com` | **DNS Only (grey cloud)** ⚠️ | Start with DNS-only |
| CNAME | `www` | `cname.vercel-dns.com` | **DNS Only** | |
| CNAME | `app` | `cname.vercel-dns.com` | **DNS Only** | |
| CNAME | `nexus` | `cname.vercel-dns.com` | **DNS Only** | |
| CNAME | `admin` | `cname.vercel-dns.com` | **DNS Only** | |
| TXT | `@` | (SPF, verification records) | N/A | Copy exactly |
| MX | `@` | (email provider) | N/A | If applicable |
| TXT | `_dmarc` | (DMARC policy) | N/A | If applicable |

> **⚠️ IMPORTANT: Set ALL records to "DNS Only" (grey cloud icon) initially.**
> Do NOT enable Cloudflare proxy (orange cloud) yet. This avoids SSL conflicts with Vercel.

### Step 1.3: Add Any Missing Records

Compare Cloudflare's auto-import against your Step 0A backup. Manually add anything missing:

```
# Common missing records:
- _vercel TXT verification records
- Google Search Console TXT record
- Meta Business TXT record  
- Any _acme-challenge records
```

### Step 1.4: Note Cloudflare Nameservers

Cloudflare will show you two nameservers like:
```
ns1.example.cloudflare.com
ns2.example.cloudflare.com
```
**Write these down.** You'll need them in Phase 2.

---

## Phase 2: Lower TTLs & Prepare (24-48 Hours Before Switch)

### Step 2.1: Lower TTLs in Current DNS

If Vercel allows TTL editing, set ALL records to **300 seconds (5 min)**.
If Vercel doesn't allow this (likely), skip — Vercel typically uses low TTLs anyway.

### Step 2.2: Pre-Configure Cloudflare SSL Settings

In Cloudflare Dashboard → **SSL/TLS**:

1. Set SSL mode to **"Full (Strict)"**
   - This ensures Cloudflare validates Vercel's SSL certificate
   - Vercel provides valid certificates, so Full Strict works
2. Enable **"Always Use HTTPS"** → ON
3. Enable **"Automatic HTTPS Rewrites"** → ON
4. Set **Minimum TLS Version** → TLS 1.2

### Step 2.3: Configure Cloudflare Page Rules (Optional but Recommended)

Add these page rules:

```
Rule 1: www.neramclasses.com/* → Forwarding URL (301) → https://neramclasses.com/$1
Rule 2: http://neramclasses.com/* → Forwarding URL (301) → https://neramclasses.com/$1
```

> This fixes the www/non-www inconsistency flagged in your SEO audit.

---

## Phase 3: The Nameserver Switch (The Critical Moment)

> **⏰ Best time:** Late night IST (11 PM - 2 AM) when student traffic is lowest.
> **Expected propagation:** 1-48 hours globally, but most users see it within 1-4 hours.

### Step 3.1: Switch Nameservers at Your Registrar

1. Log in to your **domain registrar** (where you bought `neramclasses.com`)
2. Find **Nameserver Settings** / **DNS Settings**
3. Replace current nameservers with Cloudflare's:
   ```
   Old:  ns1.vercel-dns.com / ns2.vercel-dns.com  (or registrar defaults)
   New:  [your-cloudflare-ns1].cloudflare.com
         [your-cloudflare-ns2].cloudflare.com
   ```
4. Save changes

### Step 3.2: Verify Cloudflare Activation

```bash
# Check if nameservers have propagated (run every 15 min)
dig neramclasses.com NS +short

# Should eventually show:
# [ns1].cloudflare.com.
# [ns2].cloudflare.com.
```

Cloudflare will also send you an email when the domain is active.

### Step 3.3: Immediately Test All Apps

```bash
# Quick smoke test — run immediately after NS propagation
echo "=== Testing all subdomains ==="

for domain in neramclasses.com www.neramclasses.com app.neramclasses.com nexus.neramclasses.com admin.neramclasses.com; do
  echo "--- $domain ---"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$domain")
  echo "HTTP Status: $HTTP_CODE"
  
  # Check SSL certificate
  echo "SSL Issuer:"
  echo | openssl s_client -servername $domain -connect $domain:443 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null
  
  echo ""
done
```

**Expected results:**
- All domains return HTTP 200 (or 301 for www → root redirect)
- SSL certificates are valid (issued by Let's Encrypt or Vercel)

### Step 3.4: Monitor for Issues

For the next 24-48 hours, watch for:

```bash
# Monitor SSL certificate status
curl -vI https://neramclasses.com 2>&1 | grep -i "subject\|issuer\|expire"

# Check from different DNS resolvers to see propagation
for dns in 8.8.8.8 1.1.1.1 208.67.222.222; do
  echo "DNS: $dns"
  dig @$dns neramclasses.com A +short
done
```

---

## Phase 4: Post-Migration Configuration

Only proceed here once ALL apps are confirmed working (Phase 3 verified).

### Step 4.1: Enable Cloudflare Proxy (Orange Cloud)

Switch records from "DNS Only" to "Proxied" **one at a time**, testing between each:

1. ⏸️ Start with `admin.neramclasses.com` (lowest traffic)
   - Toggle to orange cloud (Proxied)
   - Test: Login, admin functions work
   - Wait 15 minutes
   
2. ⏸️ Then `nexus.neramclasses.com`
   - Toggle to Proxied
   - Test: Student login, class content loads, Teams links work
   - Wait 15 minutes

3. ⏸️ Then `app.neramclasses.com`
   - Toggle to Proxied
   - Test: Rank Predictor, College Predictor, all tools function
   - Wait 15 minutes

4. ⏸️ Finally `neramclasses.com` + `www`
   - Toggle to Proxied
   - Test: Homepage loads, SEO schemas render, contact forms work
   - Wait 15 minutes

> **⚠️ If any app breaks after enabling proxy:** Immediately toggle that record back to "DNS Only" (grey cloud). The switch is instant.

### Step 4.2: Configure Cloudflare Caching

In **Caching → Configuration**:

```
Browser Cache TTL: Respect Existing Headers (Vercel/Next.js manages this)
Cache Level: Standard
```

In **Caching → Cache Rules** (create rules):

```
Rule: Static Assets
Match: URI Path contains /static/ OR /_next/static/
Then: Cache TTL = 1 year, Edge TTL = 1 month

Rule: API Routes (NO CACHE)
Match: URI Path starts with /api/
Then: Bypass Cache

Rule: ISR Pages
Match: URI Path does not contain /api/ AND does not contain /static/
Then: Respect Origin Cache Headers
```

> This should help with the Vercel ISR reads overage issue (1.4M vs 1M limit).

### Step 4.3: Configure Cloudflare Security

**Firewall → WAF:**
- Enable Managed Rules (free tier includes basic protection)
- Add rate limiting for `/api/` routes if needed

**Bot Fight Mode:**
- Enable — but test that Googlebot, Bingbot, and AI crawlers still work
- Verify your `robots.txt` and `llms.txt` are accessible

```bash
# Verify bots can still access
curl -A "Googlebot" https://neramclasses.com/robots.txt
curl -A "GPTBot" https://neramclasses.com/llms.txt
```

### Step 4.4: Performance Settings

**Speed → Optimization:**
- Auto Minify: CSS ✅, JavaScript ✅, HTML ✅
- Brotli Compression: ON
- Early Hints: ON
- Rocket Loader: **OFF** (can conflict with Next.js hydration)
- Mirage: **OFF** (conflicts with Next.js Image component)

> **⚠️ Rocket Loader and Mirage must stay OFF** — they break React/Next.js hydration.

---

## Phase 5: Vercel Domain Cleanup

Only after 48+ hours of stable operation on Cloudflare:

### Step 5.1: Update Vercel Project Domain Settings

In each Vercel project:
1. Go to **Settings → Domains**
2. The domains should still work — Vercel accepts traffic regardless of where DNS points
3. **Do NOT remove domains from Vercel** yet — keep them for at least a week as safety net

### Step 5.2: Remove Vercel DNS Zone (After 1 Week)

After one full week of stable Cloudflare operation:
1. Vercel Dashboard → Domains
2. Remove `neramclasses.com` from Vercel's DNS management
3. **Keep the domain assigned to your Vercel projects** (this is different from DNS management)

---

## Phase 6: Cloudflare-Specific Optimizations

### Step 6.1: Fix SEO Issues Identified in Audit

**www/non-www canonicalization** (fixes the inconsistency from your audit):

Cloudflare **Rules → Redirect Rules**:
```
Rule Name: www to non-www
When: Hostname equals "www.neramclasses.com"
Then: Dynamic Redirect → 
  Expression: concat("https://neramclasses.com", http.request.uri.path)
  Status: 301
  Preserve query string: ON
```

**Fix app subdomain 403 for bots:**

Cloudflare **Rules → Configuration Rules**:
```
Rule Name: Allow bots on app subdomain
When: Hostname equals "app.neramclasses.com" AND 
      Known Bots = true
Then: Security Level = Essentially Off
      Bot Fight Mode = OFF
```

### Step 6.2: Set Up Cloudflare Analytics

1. **Web Analytics** → Add site (free, no JS snippet needed with proxy)
2. Compare with your existing analytics to verify no traffic loss

### Step 6.3: Configure Cloudflare Email Routing (If Needed)

If you use email on `neramclasses.com`:
1. **Email → Email Routing** → Enable
2. Set up forwarding rules as needed

---

## Rollback Plan

If anything goes catastrophically wrong:

### Emergency Rollback (< 5 minutes)

1. Log in to your domain registrar
2. Change nameservers back to Vercel's:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
3. DNS will propagate within minutes to hours (faster if you lowered TTLs)

### Quick Fix for Individual Subdomains

If only one app is broken after enabling Cloudflare proxy:
1. In Cloudflare → DNS
2. Find the affected subdomain record
3. Toggle from "Proxied" (orange) to "DNS Only" (grey)
4. Effect is immediate

---

## Verification Checklist

Run through this after each phase:

### Functional Tests
- [ ] `neramclasses.com` — Homepage loads, JSON-LD schemas present
- [ ] `www.neramclasses.com` — Redirects to non-www (301)
- [ ] `app.neramclasses.com` — Tools load, Supabase queries work
- [ ] `nexus.neramclasses.com` — Login works, class content renders
- [ ] `admin.neramclasses.com` — Admin login, data management works
- [ ] All APIs (`/api/*` routes) respond correctly
- [ ] Razorpay payment flow works (test mode)
- [ ] Firebase phone OTP works
- [ ] Microsoft Entra SSO works
- [ ] Supabase realtime connections stable

### SEO Tests
- [ ] `robots.txt` accessible on all subdomains
- [ ] `llms.txt` accessible
- [ ] `sitemap.xml` accessible
- [ ] JSON-LD structured data renders correctly
- [ ] Google Search Console shows no new errors (check after 48 hrs)
- [ ] Hreflang tags still present

### Performance Tests
- [ ] Lighthouse score unchanged or improved
- [ ] TTFB not increased (Cloudflare proxy can add ~10-30ms)
- [ ] ISR pages still revalidate correctly
- [ ] Static assets served from Cloudflare edge (check headers)

### Security Tests
- [ ] SSL/TLS working on all subdomains (grade A on ssllabs.com)
- [ ] HSTS header present
- [ ] No mixed content warnings

---

## Timeline Summary

| Day | Action | Risk Level |
|-----|--------|------------|
| Day 0 | Audit DNS, document everything | 🟢 None |
| Day 0 | Set up Cloudflare, add records (DNS Only) | 🟢 None |
| Day 1 | Lower TTLs (if possible at registrar) | 🟢 None |
| Day 2-3 | Switch nameservers (late night IST) | 🟡 Medium |
| Day 2-3 | Verify all apps work, monitor | 🟡 Medium |
| Day 4 | Enable Cloudflare proxy, one app at a time | 🟡 Medium |
| Day 5-6 | Configure caching, security, performance | 🟢 Low |
| Day 7+ | SEO verification, remove Vercel DNS zone | 🟢 Low |

**Total estimated time:** 7-10 days for full migration with safety buffers.

---

## Notes for Claude Code Execution

When using this file with Claude Code:

1. **Start with Phase 0** — Run the `dig` commands to capture current state
2. **Phases 1-2** are manual (Cloudflare dashboard) — Claude Code can generate the verification scripts
3. **Phase 3** — Claude Code can run the smoke tests and monitoring scripts
4. **Phases 4-6** are partly manual (dashboard) + Claude Code for verification
5. **Always run the verification checklist** between phases

> This migration is safe when done incrementally. The key protection is:
> **DNS Only (grey cloud) first → verify → then Proxied (orange cloud) one at a time.**
> Each step is independently reversible.
