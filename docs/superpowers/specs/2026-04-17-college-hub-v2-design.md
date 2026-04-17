# College Hub v2: Navigation, Discovery, Enhanced Cards & ROI

## Problem

When students browse the College Hub and navigate into a specific college profile (e.g., `/colleges/tamil-nadu/care-architecture`), there is no way to navigate back to the College Hub homepage. The browser back button or the header dropdown are the only options. Additionally, the College Hub lacks organized category-based discovery (by state, counseling, city, fee range, type), the listing cards show minimal info with no placement/ROI data, and there is no ROI calculator to help students evaluate the investment value of each college.

## Solution Overview

A comprehensive "College Hub v2" release that adds:
1. Breadcrumb navigation on all college sub-pages
2. Enhanced 4-column mega-menu in the header
3. Category discovery section on the hub homepage
4. Horizontal listing cards with campus photo, ROI snapshot, call/brochure buttons
5. ROI calculator section on college profiles
6. New dynamic routes for counseling, city, type, and accreditation filters

## 1. Breadcrumb Navigation

**What:** Visual breadcrumbs above content on every college sub-page, enabling navigation back to the hub.

**Breadcrumb trails by page:**

| Page | Breadcrumb |
|------|-----------|
| `/colleges/[state]/[slug]` | Colleges > {State Name} > {College Name} |
| `/colleges/[state]` | Colleges > {State Name} |
| `/colleges/compare` | Colleges > Compare Colleges |
| `/colleges/saved` | Colleges > Saved Colleges |
| `/colleges/rankings/nirf` | Colleges > NIRF Rankings |
| `/colleges/rankings/archindex` | Colleges > ArchIndex Rankings |
| `/colleges/fees/[range]` | Colleges > {Fee Range Label} |
| `/colleges/tnea` | Colleges > TNEA Colleges |
| `/colleges/josaa` | Colleges > JoSAA Colleges |
| `/colleges/counseling/[system]` | Colleges > {Counseling Name} |
| `/colleges/city/[city]` | Colleges > {City Name} |
| `/colleges/type/[type]` | Colleges > {Type Label} |

**Component:** Reuse existing `src/components/seo/Breadcrumbs.tsx` (already built with light/dark variants, link styling, separator). Currently only used for JSON-LD schema markup, now also rendered visually.

**Placement:** Above the HeroSection on college profiles, above the page title on listing pages. Wrapped in a `Container` with appropriate padding.

**Files to modify:**
- `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx` (college profile)
- `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx` (state listing)
- `apps/marketing/src/app/[locale]/colleges/compare/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/saved/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/rankings/nirf/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/rankings/archindex/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/fees/[range]/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/tnea/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/josaa/page.tsx`
- All new route pages (counseling, city, type)

## 2. Enhanced Header Mega-Menu

**What:** Replace the current simple "Colleges" dropdown in the header with a rich 4-column mega-menu.

**Column layout:**

| Column 1: By State | Column 2: By Exam & Counseling | Column 3: Rankings & Filters | Column 4: Quick Links |
|---|---|---|---|
| Tamil Nadu | NATA Colleges | NIRF Architecture | Featured Colleges (card) |
| Karnataka | JEE Main Paper 2 | ArchIndex Top Rated | Compare Colleges |
| Maharashtra | TNEA Counseling | COA Approved | Saved Colleges |
| Delhi NCR | JoSAA Counseling | Government Colleges | By City |
| Kerala | KEAM Counseling | Private Colleges | |
| Telangana | KCET Counseling | Fee: Under 3L | |
| *View all states ->* | *All counseling ->* | *All fee ranges ->* | |

**Behavior:**
- Desktop: opens on hover/click, full-width dropdown anchored to header
- Mobile: collapses into accordion sections under the hamburger menu
- Top states and counseling systems are shown, with "View all" links to full listing pages
- Featured column highlights 1-2 paid partner colleges with mini-cards
- Data-driven: states and counseling systems pulled from DB at build time (ISR)

**Files to modify:**
- `apps/marketing/src/components/Header.tsx` (replace current Colleges nav section)

## 3. Homepage Category Discovery Section

**What:** A large categorized link section on the `/colleges` homepage, organized in 4 columns with all category groups.

**Categories included:**
- **By State:** All states with architecture colleges, with college counts, auto-generated from DB
- **By Counseling:** All state counseling systems (TNEA, JoSAA, KEAM, KCET, AP_EAPCET, TS_EAPCET, UPSEE, MHT_CET, WBJEE, OJEE, REAP, and more as data is added)
- **Rankings:** NIRF, ArchIndex, COA Approved, NAAC A+ Colleges
- **By City:** Major cities with 3+ colleges (Chennai, Bangalore, Mumbai, Delhi, Hyderabad, Pune, Coimbatore, etc.)
- **By Fee Range:** Under 1L, 1-3L, 3-5L, 5-10L, Above 10L
- **By Type:** Government, Private, Deemed University
- **Featured:** Paid partner colleges (premium tier)
- **Utilities:** Compare, Saved

**Placement:** Between the existing "Browse by Category" cards section and the "Browse All" listing on the `/colleges` homepage.

**Mobile layout:** Single column, each category group as a full-width card.

**Files to create:**
- `apps/marketing/src/components/college-hub/landing/ExploreCategoriesSection.tsx`

**Files to modify:**
- `apps/marketing/src/app/[locale]/colleges/page.tsx` (add the section)

## 4. Enhanced Listing Card (Horizontal + ROI)

**What:** Replace the current `CollegeListingCard` with a horizontal layout featuring campus photo, ROI snapshot, and action buttons.

**Card anatomy (desktop):**
```
┌─────────────┬──────────────────────────────────────────┐
│             │  College Name                             │
│  Campus     │  Location, State · Type · Est. Year       │
│  Photo      │  [COA] [NATA] [NAAC B+] [TNEA]          │
│             │  ┌─────── ROI SNAPSHOT ──────────┐       │
│  [Logo]     │  │ Cost: 16L → Avg Pkg: 5.2L/yr │ ~3yr  │
│             │  └──────────────────────────────-┘       │
│             │  [View Details] [Call] [Brochure]         │
└─────────────┴──────────────────────────────────────────┘
```

**Mobile layout:** Stacks vertically (photo on top, info below).

**ROI snapshot:** Only visible when placement data exists (gold+ tier colleges). Shows total 5-year cost, average package, and payback period.

**Action buttons:**
- **View Details:** Links to college profile page
- **Call (phone icon):** `tel:` link using `admissions_phone` field. Hidden if no phone number.
- **Brochure (document icon):** Opens PDF if `brochure_url` exists, otherwise shows a "Request Brochure" lead capture modal.

**Featured badge:** Orange "Featured" badge on paid partner colleges (platinum/gold tier).

**Files to modify:**
- `apps/marketing/src/components/college-hub/CollegeListingCard.tsx` (rewrite)

**Data needed from DB:**
- `hero_image_url` (already exists, for campus photo)
- `admissions_phone` (already exists)
- `brochure_url` (new column)
- `avg_placement_salary`, `min_placement_salary`, `max_placement_salary` (new columns)

## 5. ROI Calculator on College Profile

**What:** A new section on college profile pages showing a detailed investment vs. returns breakdown.

**Placement:** After the Placements section, before Reviews. Tier-gated to gold+ colleges (same as placements).

**Layout:** Two side-by-side cards:

**Left card (Total Investment, 5 years):**
- Tuition Fees (from DB: `annual_fee_approx * 5`)
- Hostel + Living (estimated by city tier)
- Materials & Travel (estimated fixed amount)
- Total

**Right card (Expected Returns):**
- Min Package (from DB: `min_placement_salary`)
- Avg Package (from DB: `avg_placement_salary`)
- Max Package (from DB: `max_placement_salary`)
- Payback Period (calculated: `total_cost / avg_package`)

**City tier living cost estimates:**
- Tier 1 (Metro: Chennai, Mumbai, Delhi, Bangalore, Hyderabad, Kolkata, Pune): 1.8L/yr
- Tier 2 (Large cities: Coimbatore, Jaipur, Lucknow, etc.): 1.5L/yr
- Tier 3 (Smaller cities/towns): 1.2L/yr

**Materials & travel estimate:** 0.6L/yr (fixed across tiers).

**Disclaimer:** "Living costs estimated based on city tier. Actual costs may vary. Placement data from latest available batch."

**Mobile:** Cards stack vertically.

**Files to create:**
- `apps/marketing/src/components/college-hub/ROICalculator.tsx`

**Files to modify:**
- `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx` (add ROI section)

## 6. New Routes

### `/colleges/counseling/[system]`
Dynamic route for each counseling system. Reuses the same listing layout as state pages.
- Title: "B.Arch Colleges under {Counseling Name} Counseling"
- Data: Filter colleges by `counseling_systems` array containing the system
- `generateStaticParams`: Auto-generate from distinct counseling systems in DB

### `/colleges/city/[city]`
Dynamic route for major cities.
- Title: "Architecture Colleges in {City Name}"
- Data: Filter by `city` field (case-insensitive match on city slug)
- `generateStaticParams`: Auto-generate from cities with 2+ colleges

### `/colleges/type/[type]`
Dynamic route for college types (government, private, deemed).
- Title: "{Type} Architecture Colleges in India"
- Data: Filter by `type` field
- Routes: `/colleges/type/government`, `/colleges/type/private`, `/colleges/type/deemed`

### `/colleges/accreditation/[filter]`
Dynamic route for accreditation-based filtering.
- Routes: `/colleges/accreditation/coa-approved`, `/colleges/accreditation/naac-a-plus`
- Data: Filter by `coa_approved = true` or `naac_grade` containing 'A'

**Files to create:**
- `apps/marketing/src/app/[locale]/colleges/counseling/[system]/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/city/[city]/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/type/[type]/page.tsx`
- `apps/marketing/src/app/[locale]/colleges/accreditation/[filter]/page.tsx`

## 7. Database Changes

### New columns on `colleges` table:
```sql
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS brochure_url TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS min_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS max_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS city_slug TEXT;
```

### Expand `CounselingSystem` type:
Update `apps/marketing/src/lib/college-hub/types.ts`:
```typescript
export type CounselingSystem =
  | 'TNEA' | 'JoSAA' | 'KEAM' | 'KCET'
  | 'AP_EAPCET' | 'TS_EAPCET'
  | 'UPSEE' | 'MHT_CET' | 'WBJEE' | 'OJEE' | 'REAP'
  | 'COMEDK' | 'BCECE' | 'GUJCET'
  | 'other';
```

### New queries:
- `getCollegesByCity(citySlug)` - filter by `city_slug`
- `getCollegesByType(type)` - filter by `type`
- `getCollegesByCounseling(system)` - filter by `counseling_systems` array
- `getCollegesByAccreditation(filter)` - filter by COA/NAAC
- `getActiveCities()` - distinct cities with 2+ colleges
- `getActiveCounselingSystems()` - distinct counseling systems from all colleges
- `getCollegeHubStats()` - counts for states, counseling systems, etc. (for mega-menu and homepage section)

**Files to modify:**
- `apps/marketing/src/lib/college-hub/queries.ts` (add new query functions)
- `apps/marketing/src/lib/college-hub/types.ts` (expand types, add new fields)
- `apps/marketing/src/lib/college-hub/constants.ts` (add counseling display names, city tier mapping)
- `apps/marketing/src/lib/college-hub/seo.ts` (add metadata generators for new pages)

## 8. SEO for New Pages

Each new route gets:
- `generateMetadata()` with title, description, OG tags
- JSON-LD BreadcrumbList schema
- Canonical URLs
- `revalidate = 3600` (ISR, 1 hour)
- `generateStaticParams()` for static generation across all 5 locales

## Verification Plan

1. Run `pnpm dev:marketing` and test:
   - Breadcrumbs appear on college profile pages with correct links
   - Click "Colleges" breadcrumb navigates to `/colleges`
   - Click state breadcrumb navigates to `/colleges/[state]`
   - Breadcrumbs appear on all sub-pages (compare, saved, rankings, fees, tnea, josaa)
2. Test mega-menu:
   - Hover "Colleges" in header shows 4-column dropdown
   - All category links navigate correctly
   - Mobile: accordion menu works
3. Test homepage category section:
   - Appears on `/colleges` page
   - All links navigate to correct filtered pages
   - College counts are accurate
4. Test listing cards:
   - Horizontal layout on desktop, vertical on mobile (375px)
   - ROI snapshot shows for colleges with placement data
   - Call button triggers phone dialer
   - Brochure button opens PDF or shows lead capture
5. Test ROI calculator:
   - Appears on gold+ tier college profiles
   - Calculations are correct (total cost, payback period)
   - Living cost varies by city tier
6. Test new routes:
   - `/colleges/counseling/tnea` shows TNEA colleges
   - `/colleges/city/chennai` shows Chennai colleges
   - `/colleges/type/government` shows government colleges
7. Run `pnpm build` to verify no build errors
8. Check mobile viewport (375px) for all new components