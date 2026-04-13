# Neram College Hub: Design Document

**Date:** 2026-04-12
**Spec Reference:** `apps/marketing/Docs/NERAM_COLLEGE_HUB_SPEC.md`
**Progress Tracker:** `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`
**Status:** Design approved, ready for implementation planning

---

## Context

Neram Classes is building a dedicated B.Arch college listing portal within neramclasses.com. Every COA-approved B.Arch college in India gets a dedicated SEO-optimized page. The portal uses a freemium model where colleges can claim and upgrade profiles for premium features, lead forwarding, and analytics.

**Why this matters:**
- Architecture is underserved on generic platforms (Shiksha, CollegeDunia treat B.Arch as 1% of content)
- Neram's 1,000+ NATA coaching students are pre-qualified architecture aspirants who naturally funnel into the college hub
- AI engines (Google AI Overview, Perplexity, ChatGPT) prefer deep niche-specific content — Neram can become the authoritative source AI cites for architecture education queries
- Revenue target: INR 26-48 lakhs Year 1 through tier subscriptions and per-lead charges

**Full spec:** See `apps/marketing/Docs/NERAM_COLLEGE_HUB_SPEC.md` (27 sections). This document captures architectural decisions made on top of that spec.

---

## Key Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Locale routing | Inside `[locale]/colleges/` | Enables hreflang for Tamil/Hindi students, consistent with rest of site |
| UI library | MUI v5 (not Fluent UI v9) | Existing app uses MUI; adding Fluent UI adds 200KB bundle and splits design systems |
| Existing `colleges` table | Extend with ALTER TABLE | 32 live TN college records already in prod/staging — preserve them |
| Column mapping | Keep `type` (not rename to `college_type`), keep `neram_tier` (not rename to `tier`) | Avoid breaking existing college-predictor tool queries |
| Phase strategy | Phase-gated with progress tracker + parallel agents per session | Handles context limits across sessions; fastest wall-clock time |
| Implementation approach | Parallel agents (DB + Frontend + Admin + SEO/AEO) | Fastest delivery |

---

## Session Memory Architecture

The following 3 files together give any future Claude session full context without needing to re-explain the spec:

```
apps/marketing/Docs/NERAM_COLLEGE_HUB_SPEC.md    Source of truth (27-section spec)
apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md       What is done (updated after each session)
.claude/plans/college-hub-phase[1-4].md            How to execute each phase
```

**Session startup protocol (for any agent):**
1. Read `COLLEGE_HUB_PROGRESS.md` to know current state
2. Read the current phase plan (`.claude/plans/college-hub-phaseN.md`)
3. Reference spec sections as needed during execution
4. Update `COLLEGE_HUB_PROGRESS.md` when tasks complete

---

## URL Structure

All college routes sit inside the existing `[locale]` wrapper for hreflang support.

| URL (English, no prefix) | Page | Static/Dynamic |
|--------------------------|------|----------------|
| `/colleges/` | All-India listing | ISR revalidate=3600 |
| `/colleges/[state]/` | State listing | ISR revalidate=3600 |
| `/colleges/[state]/[slug]/` | Individual college page | ISR revalidate=3600 |
| `/colleges/tnea/` | TNEA counseling colleges | ISR revalidate=3600 |
| `/colleges/josaa/` | JoSAA counseling colleges | ISR revalidate=3600 |
| `/colleges/compare/[slug1]-vs-[slug2]/` | Comparison | Dynamic (Phase 2) |
| `/colleges/rankings/nirf/` | NIRF ranked | ISR revalidate=86400 |
| `/colleges/rankings/archindex/` | ArchIndex ranked | ISR revalidate=86400 |
| `/colleges/fees/below-5-lakhs/` | Fee-based listing | ISR revalidate=86400 |
| `/college-dashboard/` | College admin login | Dynamic (Phase 3) |

**File structure:**
```
src/app/[locale]/colleges/
  page.tsx                          All-India listing
  [state]/
    page.tsx                        State listing
    [slug]/
      page.tsx                      Individual college
  tnea/page.tsx
  josaa/page.tsx
  compare/[...slugs]/page.tsx       Phase 2
  rankings/nirf/page.tsx            Phase 4
  rankings/archindex/page.tsx       Phase 4
  fees/[range]/page.tsx             Phase 4
src/app/[locale]/college-dashboard/ Phase 3
```

---

## Database Schema

### Existing Table: `colleges` (32 live records — extend only)

**Existing columns to keep as-is:**
`id`, `name` (full name), `short_name`, `slug`, `city`, `state`, `district`, `address`, `pincode`, `type` (college_type), `affiliation`, `established_year`, `courses_offered`, `intake_capacity`, `nirf_rank`, `nirf_rank_architecture`, `rating`, `annual_fee_min`, `annual_fee_max`, `annual_fee_approx`, `total_barch_seats`, `website`, `email`, `phone`, `description`, `facilities`, `facilities_data`, `placement_data`, `logo_url`, `images`, `meta_title`, `meta_description`, `latitude`, `longitude`, `neram_tier`, `coa_approved`, `naac_grade`, `is_active`, `created_at`, `updated_at`

**New columns to ADD (Phase 1 migration — ALTER TABLE only):**
```sql
-- Location
state_slug TEXT,                    -- "tamil-nadu" (for URL generation)
location_type TEXT,                 -- "metro", "tier2", "semi_urban", "rural"
nearest_railway TEXT,
nearest_airport TEXT,
railway_distance_km DECIMAL(5,1),
airport_distance_km DECIMAL(5,1),

-- Accreditation
coa_validity_till DATE,
naac_valid_till DATE,
nba_accredited BOOLEAN DEFAULT false,
nba_valid_till DATE,
nirf_score DECIMAL(5,2),
nirf_year INTEGER,
arch_index_score INTEGER,           -- Neram proprietary (0-100)

-- Exams & Counseling
accepted_exams TEXT[],              -- ["NATA", "JEE Main Paper 2"]
counseling_systems TEXT[],          -- ["TNEA", "JoSAA"]
has_management_quota BOOLEAN DEFAULT false,
has_nri_quota BOOLEAN DEFAULT false,
affiliated_university TEXT,

-- Contact (admissions-specific)
admissions_email TEXT,
admissions_phone TEXT,

-- Social media
youtube_channel_url TEXT,
youtube_channel_id TEXT,
instagram_handle TEXT,
facebook_url TEXT,
linkedin_url TEXT,

-- Premium tier (neram_tier column already exists; only add date/amount tracking)
-- DO NOT add a 'tier' column — use existing neram_tier for tier value
tier_start_date DATE,
tier_end_date DATE,
tier_amount DECIMAL(10,2),

-- Verification
claimed BOOLEAN DEFAULT false,
claimed_by UUID,                    -- references college_admins (added in Phase 3)
claimed_at TIMESTAMPTZ,
verified BOOLEAN DEFAULT false,
verified_at TIMESTAMPTZ,

-- Media
hero_image_url TEXT,
gallery_images TEXT[],
highlights TEXT[],
about TEXT,                         -- Rich text (can differ from description)

-- Data quality
data_source TEXT DEFAULT 'public',
data_completeness INTEGER DEFAULT 0,
last_data_update TIMESTAMPTZ
```

### New Tables: Phase 1

**`college_fees`** — Year-by-year fee breakdown (tuition, hostel, mess, etc. per academic year per category)

**`college_cutoffs`** — TNEA/JoSAA cutoff history by year, round, and category

**`college_placements`** — Annual placement stats (separate table replacing `placement_data` jsonb)

**`college_infrastructure`** — Design studios, workshops, software, hostel, campus details

**`college_faculty`** — Faculty profiles with designation, specialization, qualification

**`college_admins`** — College login accounts table (created Phase 1 so `claimed_by` FK is valid; actual accounts created by Neram admin in Phase 3)

### New Tables: Phase 2

`college_reviews`, `college_comments`

### New Tables: Phase 3

`college_leads`, `lead_windows`, `college_ambassadors`, `ambassador_queries`

Full SQL for all tables is in spec Section 4.

---

## Frontend Components

All components live in `src/components/college-hub/`.

### Phase 1 Components

| Component | Description |
|-----------|-------------|
| `CollegePageTemplate.tsx` | Master template — renders all sections based on available data and tier |
| `HeroSection.tsx` | Logo, full name, short name, city/state, badges, ArchIndex ring, quick stats bar |
| `BadgePills.tsx` | COA Approved, NAAC grade, NBA, NIRF rank, tier badge, Neram badges |
| `ArchIndexRing.tsx` | Animated SVG ring (0-100), color-coded: green/teal/gold/red |
| `NavPills.tsx` | Sticky anchor navigation (Overview, Fees, Admissions, Placements, Infrastructure, Reviews) |
| `FeeBreakdown.tsx` | Year-by-year fee table; falls back to annual_fee_approx if no detailed data |
| `CutoffSparkline.tsx` | Line chart (Recharts) showing cutoff trend 2021-2025 |
| `PlacementStats.tsx` | Stats cards: highest/avg package, placement rate, top recruiters |
| `InfrastructureSection.tsx` | Studios count, workshops, software list, hostel, campus type |
| `ClaimProfileCTA.tsx` | Banner for unclaimed colleges: "Are you from this college? Claim this profile" |
| `SimilarColleges.tsx` | "Also consider" — 3-4 colleges from same state or counseling system |
| `CollegeListingCard.tsx` | Card for listing pages: ArchIndex ring, badges, fee range, location, quick stats |
| `FilterSidebar.tsx` | Filters: state, college type, fee range, exam accepted, NAAC grade, tier |

### Phase 2 Components

`ReviewSection.tsx`, `ReviewForm.tsx`, `CommentSection.tsx`, `AmbassadorCards.tsx`, `ComparisonTable.tsx`, `LeadInterestButton.tsx`

### Phase 3 Components

`AintraChatAgent.tsx`, `VirtualTourViewer.tsx`

---

## Library Files

```
src/lib/college-hub/
  types.ts          TypeScript interfaces for all tables + component props
  queries.ts        Supabase queries (getColleges, getCollege, getStates, etc.)
  seo.ts            generateMetadata() for listing, state, and detail pages
  schema-markup.ts  JSON-LD generators (CollegeOrUniversity, FAQPage, BreadcrumbList)
  constants.ts      Tier config, filter options, state slugs, counseling systems
  archindex.ts      calculateArchIndex() function (spec Section 22)
```

---

## SEO / AEO Strategy

### Per College Page

**Meta title pattern:**
```
[Short Name]: B.Arch Admission [YEAR], Fees, Placements, Cutoff, Ranking
```

**Meta description pattern:**
```
Explore [Full Name] B.Arch [YEAR] — Fees (INR X-Y total), [Counseling] cutoff [value],
placements (avg X LPA), NIRF #N. Compare, read reviews, connect with students.
```

**JSON-LD schemas (both on every college page):**
- `CollegeOrUniversity` with address, geo, founding date, aggregate rating, accreditations
- `FAQPage` with 15-20 auto-generated Q&A from college data
- `BreadcrumbList` for the URL path

### AEO Specifics

- `llms.txt` updated with `/colleges/` sitemap section so AI crawlers index all pages
- `robots.txt` already allows AI crawlers (no change needed)
- FAQs auto-generated from data fields (fees, cutoffs, placements) ensure AI engines quote accurate Neram-sourced data
- ArchIndex methodology page at `/colleges/archindex-methodology/` published for citation trust
- `revalidate: 3600` on college pages ensures freshness signals to AI crawlers

### Programmatic SEO Pages (ISR, zero function invocations)

```
/colleges/tamil-nadu/                   → state filter
/colleges/tnea/                         → counseling filter
/colleges/rankings/nirf/                → NIRF sort
/colleges/fees/below-5-lakhs/           → fee filter (Phase 4)
```

All generated via `generateStaticParams()` with `revalidate: 86400`.

---

## Tier System (Phase 1: display only)

| Tier | `neram_tier` value | Phase 1 visible difference |
|------|-------------------|---------------------------|
| Free | null | Standard page |
| Silver | 'silver' | Silver badge pill |
| Gold | 'gold' | Gold badge pill |
| Platinum | 'platinum' | Platinum badge pill |

Note: `neram_tier` is the subscription tier column (existing). All 32 current records have `neram_tier = null` (free tier). The migration adds `tier_start_date`, `tier_end_date`, `tier_amount` alongside it.

Full tier feature-gating (lead window, AI chat, analytics) implemented in Phase 3.

---

## Parallel Execution Model

Each phase session spawns 4 agents concurrently:

```
Session Start
     │
     ├── DB Agent ──────────────────────────────────────────────► Checkpoint A
     │   (Apply migrations via supabase MCP)                           │
     │                                                                  │
     ├── Frontend Agent ──────► builds with mock data ──────────► waits for A ──► wires real queries
     │   (components + pages)                                           │
     │                                                                  │
     ├── Admin Agent ─────────► builds with mock data ──────────► waits for A ──► wires real queries
     │   (admin college-hub section)                                    │
     │                                                                  │
     └── SEO/AEO Agent ───────────────────────────────────────────────► waits for Frontend ──► metadata + JSON-LD
```

Checkpoint A = DB agent posts a message confirming all migrations applied successfully.

---

## Phase 4 Plan Overview

| Phase | Weeks | Key Deliverables | Sessions Est. |
|-------|-------|-----------------|---------------|
| Phase 1 | 1-4 | TN colleges live, page template, listing, SEO | 3-4 sessions |
| Phase 2 | 5-8 | Reviews, comments, comparison, JoSAA colleges, admin panel | 4-5 sessions |
| Phase 3 | 9-12 | Premium tiers, college dashboard, leads, Aintra AI chat, ambassador program | 5-6 sessions |
| Phase 4 | 13-16 | Virtual tours, national expansion, programmatic SEO, analytics | 4-5 sessions |

---

## Verification (Phase 1)

After Phase 1 implementation, verify:

1. `pnpm dev:marketing` starts without errors
2. Visit `http://localhost:3010/colleges/` — listing shows TN colleges with filters
3. Visit `http://localhost:3010/colleges/tamil-nadu/caad-chennai-architecture/` — detail page renders all sections (real slug from existing data)
4. Visit `http://localhost:3010/ta/colleges/` — Tamil locale version works
5. Check browser DevTools Sources for JSON-LD: `<script type="application/ld+json">` present on detail page
6. `pnpm type-check` passes
7. `pnpm test:e2e --project=marketing-chrome` passes
8. Lighthouse mobile score on college detail page: Performance > 70, SEO = 100
9. No horizontal scroll at 375px viewport
