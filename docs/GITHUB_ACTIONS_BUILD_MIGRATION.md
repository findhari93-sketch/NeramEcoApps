# Zero-Cost Build Pipeline: GitHub Actions + Vercel Deploy

## Neram Ecosystem: Eliminate Vercel Build Minutes

> Moves ALL builds to GitHub Actions (free) and deploys only pre-built output to Vercel.
> This eliminates the #1 cost: Build Minutes ($8.44+ and growing).

---

## The Problem

```
Current setup: 4 Vercel projects (marketing, app, nexus, admin)
                ↓
Every git push → Vercel tries to build ALL 4 projects
                ↓
Build Minutes = $8.44 in just a few days
                ↓
$20 Pro credit exhausted mid-cycle
                ↓
Vercel starts charging overages
```

**Root cause:** Vercel's Git integration triggers a build on EVERY project connected to the repo on every push. With a Turborepo monorepo and 4 projects, you're burning 4x the build minutes you need.

---

## The Solution

```
New setup: git push → GitHub Actions (FREE, 2000 min/month)
                ↓
dorny/paths-filter detects which app(s) actually changed
                ↓
Builds ONLY the affected app(s) via vercel build
                ↓
Deploys pre-built output to Vercel (--prebuilt)
                ↓
Vercel Build Minutes = $0
                ↓
Vercel only handles HOSTING (Functions, CDN, SSL, Crons)
```

### Why This Works

| Resource | Free Quota | Your Usage |
|----------|-----------|------------|
| **GitHub Actions** (Free plan, private repo) | 2,000 min/month | ~500-800 min (estimated) |
| **Vercel** (with --prebuilt) | No build minutes consumed | $0 for builds |

> **Key insight:** `vercel deploy --prebuilt` uploads your ALREADY-BUILT output to Vercel.
> Vercel doesn't run any build step. It just hosts the result. Zero build minutes charged.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              GitHub Repo (push)                  │
│           NeramEcosystem monorepo                │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│           GitHub Actions (FREE)                  │
│                                                  │
│  1. Pre-deploy tests (lint, type-check, test)    │
│  2. dorny/paths-filter: detect changed apps      │
│  3. Build ONLY changed app(s) via vercel build   │
│  4. Deploy via vercel deploy --prebuilt          │
│  5. DB migrations via Supabase CLI               │
│                                                  │
│  Cost: $0 (within 2000 free min/month)           │
└──────────────────────┬──────────────────────────┘
                       │ pre-built output only
                       ▼
┌─────────────────────────────────────────────────┐
│            Vercel (Hosting Only)                  │
│                                                  │
│  Serves static + serverless functions            │
│  SSL/CDN/Edge, Cron jobs                         │
│  NO build step (--prebuilt)                      │
│                                                  │
│  Build Minutes: $0                               │
└─────────────────────────────────────────────────┘
```

---

## What Was Implemented

### 1. Disabled Vercel Auto-Builds

Each app's `vercel.json` now has:
```json
{
  "git": { "deploymentEnabled": false }
}
```

This prevents Vercel from triggering its own build on git push.

**Files changed:**
- `apps/marketing/vercel.json`
- `apps/app/vercel.json`
- `apps/nexus/vercel.json`
- `apps/admin/vercel.json`

**Removed from all 4:**
- `ignoreCommand` (GitHub Actions handles change detection)
- `installCommand` (GitHub Actions installs deps)
- `buildCommand` (GitHub Actions builds via Turbo)

**Kept intact:**
- `crons` (marketing: demo-reminders, indexnow; nexus: scorecard, gamification)
- `headers` (security headers, cache control)
- `rewrites` and `redirects`
- `framework: "nextjs"`

### 2. Updated deploy.yml

`.github/workflows/deploy.yml` now handles the full build+deploy pipeline:

**Jobs:**
| Job | Purpose | Runs When |
|-----|---------|-----------|
| `test` | Lint, type-check, unit tests | Always |
| `detect-changes` | dorny/paths-filter | Always |
| `deploy-db-staging` | Supabase migrations (staging) | Push to staging |
| `deploy-db-production` | Supabase migrations (production) | Push to main (after tests) |
| `deploy-marketing` | Build + deploy marketing | marketing or packages changed |
| `deploy-app` | Build + deploy app | app or packages changed |
| `deploy-nexus` | Build + deploy nexus | nexus or packages changed |
| `deploy-admin` | Build + deploy admin | admin or packages changed |
| `summary` | Deployment report | Always |

**Each deploy job:**
```bash
vercel pull --yes --environment=<production|preview> --token=$TOKEN
vercel build [--prod] --token=$TOKEN
vercel deploy --prebuilt [--prod] --token=$TOKEN
```

### 3. Cleaned up turbo.json

Removed unused `VERCEL_URL` from the `build.env` array (not referenced in any source code).

---

## Project IDs (Already Configured)

| App | Project ID | Org ID |
|-----|-----------|--------|
| Marketing | `prj_kCLOVjMqr99PfKvbdiZdM8vHpNST` | `team_pINk5YGOGsajESQgHpsgyoEU` |
| App | `prj_n1hKWpSZezUx3m3ui0i2eLKq13OR` | same |
| Nexus | `prj_CFjPrGMaAA5dzVwU54GaGBE6AKLX` | same |
| Admin | `prj_QoCOUGXPvDYAfOXHYFpF62f57hWV` | same |

---

## Required GitHub Secret

One new secret must be added:

| Secret | Where to Get |
|--------|-------------|
| `VERCEL_TOKEN` | https://vercel.com/account/tokens, create token named `github-actions-deploy` |

All other secrets (Supabase, Firebase, Azure AD, etc.) are already configured.

---

## Environment Logic

| Branch | Vercel Environment | Deploy Flag | URLs |
|--------|-------------------|-------------|------|
| `main` | production | `--prod` | neramclasses.com, app.neramclasses.com, etc. |
| `staging` | preview | (no flag) | staging.neramclasses.com, staging-app.neramclasses.com, etc. |

---

## Estimated Savings

| Cost Item | Before | After |
|-----------|--------|-------|
| Build Minutes | $8.44+ mid-cycle | **$0** |
| Function Invocations | ~$0.60 | ~$0.60 (unchanged) |
| Other hosting costs | ~$1.56 | ~$1.56 (unchanged) |
| **GitHub Actions** | $0 | $0 (within free tier) |
| **Total** | **~$10.59+ mid-cycle** | **~$2.16** |

The $20 Pro credit now covers the entire month comfortably.

---

## Rollback Plan

If GitHub Actions deployment has issues:

1. Remove `"git": { "deploymentEnabled": false }` from all 4 app `vercel.json` files
2. Restore `ignoreCommand`, `installCommand`, `buildCommand` from git history
3. Push to trigger normal Vercel builds
4. Back to the old system instantly

---

## Verification Checklist

- [ ] Add `VERCEL_TOKEN` secret to GitHub repo
- [ ] Push a small change to `staging` branch
- [ ] Verify GitHub Actions runs the deploy workflow
- [ ] Verify only the changed app builds (not all 4)
- [ ] Verify Vercel dashboard shows the deployment
- [ ] Verify staging URL loads correctly
- [ ] Verify cron jobs still appear in Vercel dashboard
- [ ] Check Vercel billing: Build Minutes should be $0
- [ ] Monitor GitHub Actions usage for 1 week
