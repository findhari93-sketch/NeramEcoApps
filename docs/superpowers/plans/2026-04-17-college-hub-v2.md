# College Hub v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add breadcrumb navigation, 4-column mega-menu, category discovery section, horizontal listing cards with ROI, ROI calculator on profiles, and new dynamic routes (counseling, city, type, accreditation) to the College Hub.

**Architecture:** Database-first approach. Add new columns to `colleges` table, expand TypeScript types, add query functions, then build UI components. All new listing pages reuse the same card component and page layout pattern. Mega-menu data is fetched at build time via ISR. ROI calculations use city-tier-based living cost estimates.

**Tech Stack:** Next.js 14 App Router, MUI v5, Supabase (via MCP tools), next-intl, ISR (revalidate 3600s)

**Spec:** `docs/superpowers/specs/2026-04-17-college-hub-v2-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/marketing/src/components/college-hub/ROICalculator.tsx` | ROI breakdown component for college profile |
| `apps/marketing/src/components/college-hub/landing/ExploreCategoriesSection.tsx` | Category discovery section on hub homepage |
| `apps/marketing/src/app/[locale]/colleges/counseling/[system]/page.tsx` | Counseling-based listing page |
| `apps/marketing/src/app/[locale]/colleges/city/[city]/page.tsx` | City-based listing page |
| `apps/marketing/src/app/[locale]/colleges/type/[type]/page.tsx` | Type-based listing page |
| `apps/marketing/src/app/[locale]/colleges/accreditation/[filter]/page.tsx` | Accreditation-based listing page |

### Modified Files
| File | Changes |
|------|---------|
| `apps/marketing/src/lib/college-hub/types.ts` | Expand CounselingSystem, add fields to CollegeListItem & College |
| `apps/marketing/src/lib/college-hub/constants.ts` | Add counseling labels, city tiers, ROI constants |
| `apps/marketing/src/lib/college-hub/queries.ts` | Add LISTING_SELECT fields, new query functions |
| `apps/marketing/src/lib/college-hub/seo.ts` | Add metadata generators for new pages |
| `apps/marketing/src/components/college-hub/CollegeListingCard.tsx` | Rewrite to horizontal layout with ROI |
| `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx` | Add breadcrumbs + ROI section |
| `apps/marketing/src/components/Header.tsx` | Replace Colleges dropdown with 4-column mega-menu |
| `apps/marketing/src/app/[locale]/colleges/page.tsx` | Add ExploreCategoriesSection |
| `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx` | Add breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/[state]/[slug]/page.tsx` | Pass state info for breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/compare/page.tsx` | Add breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/saved/page.tsx` | Add breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/rankings/nirf/page.tsx` | Add breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/rankings/archindex/page.tsx` | Add breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/fees/[range]/page.tsx` | Add breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/tnea/page.tsx` | Add breadcrumbs |
| `apps/marketing/src/app/[locale]/colleges/josaa/page.tsx` | Add breadcrumbs |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20250417_college_hub_v2.sql`

- [ ] **Step 1: Check existing columns**

Run via Supabase MCP (staging first):
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'colleges'
AND column_name IN ('brochure_url', 'avg_placement_salary', 'min_placement_salary', 'max_placement_salary', 'city_slug');
```
Expected: No rows (columns don't exist yet).

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/20250417_college_hub_v2.sql`:
```sql
-- College Hub v2: Add placement salary, brochure, and city slug columns
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS brochure_url TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS min_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS max_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS city_slug TEXT;

-- Backfill city_slug from city name (lowercase, replace spaces with hyphens)
UPDATE colleges
SET city_slug = LOWER(REGEXP_REPLACE(TRIM(city), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE city IS NOT NULL AND city_slug IS NULL;

-- Index for city-based queries
CREATE INDEX IF NOT EXISTS idx_colleges_city_slug ON colleges (city_slug) WHERE city_slug IS NOT NULL;

-- Index for type-based queries
CREATE INDEX IF NOT EXISTS idx_colleges_type ON colleges (type) WHERE type IS NOT NULL;
```

- [ ] **Step 3: Apply migration to staging**

Use `mcp__supabase-staging__apply_migration` with the SQL above.

- [ ] **Step 4: Verify migration on staging**

Run via `mcp__supabase-staging__execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'colleges'
AND column_name IN ('brochure_url', 'avg_placement_salary', 'min_placement_salary', 'max_placement_salary', 'city_slug')
ORDER BY column_name;
```
Expected: 5 rows returned.

- [ ] **Step 5: Verify city_slug backfill**

```sql
SELECT city, city_slug FROM colleges WHERE city IS NOT NULL LIMIT 10;
```
Expected: city_slug values like `chennai`, `bangalore`, `mumbai`.

- [ ] **Step 6: Apply migration to production**

Use `mcp__supabase-prod__apply_migration` with the same SQL.

- [ ] **Step 7: Commit migration file**

```bash
git add supabase/migrations/20250417_college_hub_v2.sql
git commit -m "feat(db): add placement salary, brochure_url, city_slug columns for College Hub v2"
```

---

## Task 2: Expand Types & Constants

**Files:**
- Modify: `apps/marketing/src/lib/college-hub/types.ts`
- Modify: `apps/marketing/src/lib/college-hub/constants.ts`

- [ ] **Step 1: Expand CounselingSystem type**

In `apps/marketing/src/lib/college-hub/types.ts`, replace line 7:
```typescript
// OLD:
export type CounselingSystem = 'TNEA' | 'JoSAA' | 'KEAM' | 'KCET' | 'AP_EAPCET' | 'TS_EAPCET' | 'other';

// NEW:
export type CounselingSystem =
  | 'TNEA' | 'JoSAA' | 'KEAM' | 'KCET'
  | 'AP_EAPCET' | 'TS_EAPCET'
  | 'UPSEE' | 'MHT_CET' | 'WBJEE' | 'OJEE' | 'REAP'
  | 'COMEDK' | 'BCECE' | 'GUJCET'
  | 'other';
```

- [ ] **Step 2: Add new fields to College interface**

In `apps/marketing/src/lib/college-hub/types.ts`, add after the `data_completeness` field in the `College` interface:
```typescript
  // Placement salary data
  avg_placement_salary: number | null;
  min_placement_salary: number | null;
  max_placement_salary: number | null;
  // Downloads
  brochure_url: string | null;
  // City routing
  city_slug: string | null;
```

- [ ] **Step 3: Add new fields to CollegeListItem interface**

In `apps/marketing/src/lib/college-hub/types.ts`, add to `CollegeListItem` after `hero_image_url`:
```typescript
  admissions_phone: string | null;
  brochure_url: string | null;
  avg_placement_salary: number | null;
  min_placement_salary: number | null;
  max_placement_salary: number | null;
  city_slug: string | null;
```

- [ ] **Step 4: Add counseling labels to constants**

In `apps/marketing/src/lib/college-hub/constants.ts`, replace the existing `COUNSELING_LABELS` with:
```typescript
export const COUNSELING_LABELS: Record<string, string> = {
  TNEA: 'TNEA (Tamil Nadu)',
  JoSAA: 'JoSAA (All India)',
  KEAM: 'KEAM (Kerala)',
  KCET: 'KCET (Karnataka)',
  AP_EAPCET: 'AP EAPCET (Andhra Pradesh)',
  TS_EAPCET: 'TS EAPCET (Telangana)',
  UPSEE: 'UPSEE (Uttar Pradesh)',
  MHT_CET: 'MHT CET (Maharashtra)',
  WBJEE: 'WBJEE (West Bengal)',
  OJEE: 'OJEE (Odisha)',
  REAP: 'REAP (Rajasthan)',
  COMEDK: 'COMEDK (Karnataka Private)',
  BCECE: 'BCECE (Bihar)',
  GUJCET: 'GUJCET (Gujarat)',
  other: 'Other',
};

export const COUNSELING_SLUGS: Record<string, string> = Object.fromEntries(
  Object.keys(COUNSELING_LABELS).map((key) => [key.toLowerCase().replace(/_/g, '-'), key])
);
```

- [ ] **Step 5: Add city tier constants for ROI**

In `apps/marketing/src/lib/college-hub/constants.ts`, add:
```typescript
/** Annual living cost estimate by city tier (hostel + food + misc) */
export const CITY_TIER_LIVING_COST: Record<string, number> = {
  // Tier 1: Metro cities
  chennai: 180000, mumbai: 180000, delhi: 180000, bangalore: 180000,
  hyderabad: 180000, kolkata: 180000, pune: 180000,
  // Tier 2: Large cities
  coimbatore: 150000, jaipur: 150000, lucknow: 150000, ahmedabad: 150000,
  chandigarh: 150000, bhopal: 150000, nagpur: 150000, thiruvananthapuram: 150000,
  kochi: 150000, mysore: 150000, madurai: 150000, mangalore: 150000,
};

/** Default living cost for cities not in the mapping (Tier 3) */
export const DEFAULT_LIVING_COST = 120000;

/** Annual materials & travel estimate */
export const MATERIALS_TRAVEL_COST = 60000;

/** B.Arch course duration in years */
export const COURSE_DURATION_YEARS = 5;

export const COLLEGE_TYPE_SLUGS: Record<string, string> = {
  government: 'Government',
  private: 'Private',
  deemed: 'Deemed',
};

export const ACCREDITATION_FILTERS: Record<string, { label: string; description: string }> = {
  'coa-approved': { label: 'COA Approved', description: 'Colleges approved by the Council of Architecture' },
  'naac-a-plus': { label: 'NAAC A+ and Above', description: 'Colleges with NAAC A+ or A++ grade' },
};
```

- [ ] **Step 6: Commit types and constants**

```bash
git add apps/marketing/src/lib/college-hub/types.ts apps/marketing/src/lib/college-hub/constants.ts
git commit -m "feat(college-hub): expand CounselingSystem type, add placement/ROI constants"
```

---

## Task 3: Add New Query Functions

**Files:**
- Modify: `apps/marketing/src/lib/college-hub/queries.ts`

- [ ] **Step 1: Update LISTING_SELECT to include new fields**

In `apps/marketing/src/lib/college-hub/queries.ts`, replace the `LISTING_SELECT` constant (lines 20-26):
```typescript
const LISTING_SELECT = `
  id, slug, name, short_name, city, state, state_slug, type, neram_tier,
  coa_approved, naac_grade, nirf_rank, nirf_rank_architecture, arch_index_score,
  annual_fee_min, annual_fee_max, annual_fee_approx, total_barch_seats,
  accepted_exams, counseling_systems, logo_url, hero_image_url, highlights,
  verified, data_completeness, admissions_phone, brochure_url,
  avg_placement_salary, min_placement_salary, max_placement_salary, city_slug
`;
```

- [ ] **Step 2: Add getCollegesByCounseling query**

Add after the existing `getJoSAAColleges` function:
```typescript
export const getCollegesByCounseling = React.cache(
  async (systemKey: string): Promise<CollegeListItem[]> => {
    const supabase = createAdminClientISR(86400);
    const { data } = await supabase
      .from('colleges')
      .select(LISTING_SELECT)
      .contains('counseling_systems', [systemKey])
      .order('arch_index_score', { ascending: false, nullsFirst: false });
    return (data ?? []) as CollegeListItem[];
  }
);
```

- [ ] **Step 3: Add getCollegesByCity query**

```typescript
export const getCollegesByCity = React.cache(
  async (citySlug: string): Promise<CollegeListItem[]> => {
    const supabase = createAdminClientISR(3600);
    const { data } = await supabase
      .from('colleges')
      .select(LISTING_SELECT)
      .eq('city_slug', citySlug)
      .order('arch_index_score', { ascending: false, nullsFirst: false });
    return (data ?? []) as CollegeListItem[];
  }
);
```

- [ ] **Step 4: Add getCollegesByType query**

```typescript
export const getCollegesByType = React.cache(
  async (type: string): Promise<CollegeListItem[]> => {
    const supabase = createAdminClientISR(3600);
    const { data } = await supabase
      .from('colleges')
      .select(LISTING_SELECT)
      .ilike('type', type)
      .order('arch_index_score', { ascending: false, nullsFirst: false });
    return (data ?? []) as CollegeListItem[];
  }
);
```

- [ ] **Step 5: Add getCollegesByAccreditation query**

```typescript
export const getCollegesByAccreditation = React.cache(
  async (filter: string): Promise<CollegeListItem[]> => {
    const supabase = createAdminClientISR(3600);
    let query = supabase.from('colleges').select(LISTING_SELECT);

    if (filter === 'coa-approved') {
      query = query.eq('coa_approved', true);
    } else if (filter === 'naac-a-plus') {
      query = query.in('naac_grade', ['A++', 'A+']);
    }

    const { data } = await query.order('arch_index_score', { ascending: false, nullsFirst: false });
    return (data ?? []) as CollegeListItem[];
  }
);
```

- [ ] **Step 6: Add getActiveCities query**

```typescript
export const getActiveCities = React.cache(
  async (): Promise<Array<{ city_slug: string; city: string; count: number }>> => {
    const supabase = createAdminClientISR(3600);
    const { data } = await supabase
      .from('colleges')
      .select('city, city_slug')
      .not('city_slug', 'is', null);

    if (!data) return [];

    const counts = new Map<string, { city: string; count: number }>();
    for (const r of data) {
      if (!r.city_slug) continue;
      const existing = counts.get(r.city_slug);
      if (existing) existing.count++;
      else counts.set(r.city_slug, { city: r.city, count: 1 });
    }

    return Array.from(counts.entries())
      .map(([city_slug, v]) => ({ city_slug, city: v.city, count: v.count }))
      .filter((c) => c.count >= 2)
      .sort((a, b) => b.count - a.count);
  }
);
```

- [ ] **Step 7: Add getActiveCounselingSystems query**

```typescript
export const getActiveCounselingSystems = React.cache(
  async (): Promise<Array<{ system: string; count: number }>> => {
    const supabase = createAdminClientISR(3600);
    const { data } = await supabase
      .from('colleges')
      .select('counseling_systems');

    if (!data) return [];

    const counts = new Map<string, number>();
    for (const r of data) {
      for (const sys of r.counseling_systems ?? []) {
        counts.set(sys, (counts.get(sys) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .map(([system, count]) => ({ system, count }))
      .sort((a, b) => b.count - a.count);
  }
);
```

- [ ] **Step 8: Commit queries**

```bash
git add apps/marketing/src/lib/college-hub/queries.ts
git commit -m "feat(college-hub): add query functions for city, type, counseling, accreditation"
```

---

## Task 4: Add SEO Metadata for New Pages

**Files:**
- Modify: `apps/marketing/src/lib/college-hub/seo.ts`

- [ ] **Step 1: Add metadata generators for new pages**

Add these functions to `apps/marketing/src/lib/college-hub/seo.ts`:

```typescript
import { COUNSELING_LABELS, COLLEGE_TYPE_SLUGS, ACCREDITATION_FILTERS } from './constants';

export function generateCounselingMetadata(locale: string, systemKey: string, collegeCount: number): Metadata {
  const label = COUNSELING_LABELS[systemKey] ?? systemKey;
  const title = `B.Arch Colleges under ${label} Counseling 2026 | Neram College Hub`;
  const description = `${collegeCount} architecture colleges accepting ${label} counseling. Compare fees, cutoffs, rankings, and placements. Updated for 2026 admissions.`;
  const path = `/colleges/counseling/${systemKey.toLowerCase().replace(/_/g, '-')}`;
  return {
    title,
    description,
    keywords: `${label} architecture colleges, ${systemKey} B.Arch colleges, ${label} counseling architecture`,
    alternates: buildAlternates(locale, path),
    openGraph: { title, description, ...buildOgImage(title, `${collegeCount} colleges`, 'website') },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export function generateCityMetadata(locale: string, cityName: string, collegeCount: number): Metadata {
  const title = `Architecture Colleges in ${cityName} 2026 — Fees, Rankings | Neram`;
  const description = `${collegeCount} B.Arch colleges in ${cityName}. Compare fees, NATA cutoffs, placements, and rankings. Find the best architecture college in ${cityName}.`;
  const citySlug = cityName.toLowerCase().replace(/\s+/g, '-');
  const path = `/colleges/city/${citySlug}`;
  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: { title, description, ...buildOgImage(title, `${collegeCount} colleges`, 'website') },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export function generateTypeMetadata(locale: string, typeSlug: string, collegeCount: number): Metadata {
  const typeName = COLLEGE_TYPE_SLUGS[typeSlug] ?? typeSlug;
  const title = `${typeName} Architecture Colleges in India 2026 | Neram College Hub`;
  const description = `${collegeCount} ${typeName.toLowerCase()} B.Arch colleges in India. Compare fees, rankings, cutoffs, and placements across ${typeName.toLowerCase()} architecture colleges.`;
  const path = `/colleges/type/${typeSlug}`;
  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: { title, description, ...buildOgImage(title, `${collegeCount} colleges`, 'website') },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export function generateAccreditationMetadata(locale: string, filterKey: string, collegeCount: number): Metadata {
  const filter = ACCREDITATION_FILTERS[filterKey];
  const label = filter?.label ?? filterKey;
  const title = `${label} Architecture Colleges in India 2026 | Neram`;
  const description = `${collegeCount} ${label.toLowerCase()} B.Arch colleges. ${filter?.description ?? ''} Compare fees, rankings, and placements.`;
  const path = `/colleges/accreditation/${filterKey}`;
  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: { title, description, ...buildOgImage(title, `${collegeCount} colleges`, 'website') },
    twitter: { card: 'summary_large_image', title, description },
  };
}
```

- [ ] **Step 2: Commit SEO changes**

```bash
git add apps/marketing/src/lib/college-hub/seo.ts
git commit -m "feat(college-hub): add SEO metadata for counseling, city, type, accreditation pages"
```

---

## Task 5: Breadcrumb Navigation on All Pages

**Files:**
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/compare/page.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/saved/page.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/rankings/nirf/page.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/rankings/archindex/page.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/fees/[range]/page.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/tnea/page.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/josaa/page.tsx`

- [ ] **Step 1: Add breadcrumbs to CollegePageTemplate**

In `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`, add import and render breadcrumbs above HeroSection:

Add import:
```typescript
import Breadcrumbs from '../seo/Breadcrumbs';
```

Replace the opening of the component (line 78-81):
```typescript
export default function CollegePageTemplate({ college, similarColleges }: CollegePageTemplateProps) {
  return (
    <Box sx={{ bgcolor: 'background.default' }}>
      {/* Breadcrumbs */}
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
        <Box sx={{ pt: { xs: 1.5, sm: 2 } }}>
          <Breadcrumbs items={[
            { name: 'Colleges', href: '/colleges' },
            { name: college.state, href: `/colleges/${college.state_slug ?? 'india'}` },
            { name: college.short_name ?? college.name },
          ]} />
        </Box>
      </Container>

      {/* Hero */}
      <HeroSection college={college} />
```

- [ ] **Step 2: Add breadcrumbs to state listing page**

In `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx`, add import and render above the title:

Add import:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
```

Inside the return, add breadcrumbs before the title Box (after `<Container>`):
```typescript
<Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
  <Breadcrumbs items={[
    { name: 'Colleges', href: '/colleges' },
    { name: stateName },
  ]} />
  <Box sx={{ mb: 3 }}>
    {/* existing title content */}
```

- [ ] **Step 3: Add breadcrumbs to compare page**

In `apps/marketing/src/app/[locale]/colleges/compare/page.tsx`, add:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
```

Render above the page title:
```typescript
<Breadcrumbs items={[
  { name: 'Colleges', href: '/colleges' },
  { name: 'Compare Colleges' },
]} />
```

- [ ] **Step 4: Add breadcrumbs to saved page**

Same pattern in `apps/marketing/src/app/[locale]/colleges/saved/page.tsx`:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
// Render:
<Breadcrumbs items={[
  { name: 'Colleges', href: '/colleges' },
  { name: 'Saved Colleges' },
]} />
```

- [ ] **Step 5: Add breadcrumbs to rankings/nirf page**

In `apps/marketing/src/app/[locale]/colleges/rankings/nirf/page.tsx`:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
// Render:
<Breadcrumbs items={[
  { name: 'Colleges', href: '/colleges' },
  { name: 'NIRF Architecture Rankings' },
]} />
```

- [ ] **Step 6: Add breadcrumbs to rankings/archindex page**

In `apps/marketing/src/app/[locale]/colleges/rankings/archindex/page.tsx`:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
// Render:
<Breadcrumbs items={[
  { name: 'Colleges', href: '/colleges' },
  { name: 'ArchIndex Rankings' },
]} />
```

- [ ] **Step 7: Add breadcrumbs to fees/[range] page**

In `apps/marketing/src/app/[locale]/colleges/fees/[range]/page.tsx`:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
// Render (use the range label from FEE_RANGES constant):
<Breadcrumbs items={[
  { name: 'Colleges', href: '/colleges' },
  { name: rangeLabel },
]} />
```

- [ ] **Step 8: Add breadcrumbs to TNEA page**

In `apps/marketing/src/app/[locale]/colleges/tnea/page.tsx`:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
// Render:
<Breadcrumbs items={[
  { name: 'Colleges', href: '/colleges' },
  { name: 'TNEA Colleges' },
]} />
```

- [ ] **Step 9: Add breadcrumbs to JoSAA page**

In `apps/marketing/src/app/[locale]/colleges/josaa/page.tsx`:
```typescript
import Breadcrumbs from '@/components/seo/Breadcrumbs';
// Render:
<Breadcrumbs items={[
  { name: 'Colleges', href: '/colleges' },
  { name: 'JoSAA Colleges' },
]} />
```

- [ ] **Step 10: Commit breadcrumbs**

```bash
git add apps/marketing/src/components/college-hub/CollegePageTemplate.tsx
git add apps/marketing/src/app/[locale]/colleges/
git commit -m "feat(college-hub): add visual breadcrumb navigation to all college pages"
```

---

## Task 6: Enhanced Listing Card (Horizontal + ROI)

**Files:**
- Modify: `apps/marketing/src/components/college-hub/CollegeListingCard.tsx`

- [ ] **Step 1: Rewrite CollegeListingCard**

Replace the entire content of `apps/marketing/src/components/college-hub/CollegeListingCard.tsx` with:

```tsx
'use client';

import { Box, Card, Chip, Stack, Typography, IconButton, Button, Tooltip } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import DescriptionIcon from '@mui/icons-material/Description';
import VerifiedIcon from '@mui/icons-material/Verified';
import SaveCollegeButton from './SaveCollegeButton';
import CompareButton from './CompareButton';
import type { CollegeListItem } from '@/lib/college-hub/types';
import {
  COURSE_DURATION_YEARS,
  CITY_TIER_LIVING_COST,
  DEFAULT_LIVING_COST,
  MATERIALS_TRAVEL_COST,
} from '@/lib/college-hub/constants';

interface CollegeListingCardProps {
  college: CollegeListItem;
  compact?: boolean;
}

function formatFee(min: number | null, max: number | null, approx: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000
    ? `₹${(val / 100000).toFixed(1)}L/yr`
    : `₹${(val / 1000).toFixed(0)}K/yr`;
}

function calcROI(college: CollegeListItem) {
  const annualFee = college.annual_fee_approx ?? college.annual_fee_min;
  const avgPkg = college.avg_placement_salary;
  if (!annualFee || !avgPkg) return null;

  const livingCost = CITY_TIER_LIVING_COST[college.city_slug ?? ''] ?? DEFAULT_LIVING_COST;
  const totalCost = (annualFee + livingCost + MATERIALS_TRAVEL_COST) * COURSE_DURATION_YEARS;
  const paybackYears = totalCost / avgPkg;

  return {
    totalCost,
    avgPkg,
    paybackYears: Math.round(paybackYears * 10) / 10,
  };
}

function formatLakhs(val: number): string {
  return `₹${(val / 100000).toFixed(0)}L`;
}

export default function CollegeListingCard({ college, compact }: CollegeListingCardProps) {
  const roi = calcROI(college);
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;
  const isPremium = college.neram_tier === 'gold' || college.neram_tier === 'platinum';

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': { boxShadow: 3, borderColor: 'primary.light' },
      }}
    >
      <Stack direction={{ xs: 'column', sm: compact ? 'column' : 'row' }}>
        {/* Campus photo */}
        {!compact && (
          <Box
            sx={{
              position: 'relative',
              width: { xs: '100%', sm: 180 },
              height: { xs: 140, sm: 'auto' },
              minHeight: { sm: 200 },
              bgcolor: '#1e293b',
              flexShrink: 0,
            }}
          >
            {college.hero_image_url ? (
              <Image
                src={college.hero_image_url}
                alt={`${college.name} campus`}
                fill
                style={{ objectFit: 'cover' }}
                sizes="(max-width: 600px) 100vw, 180px"
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography variant="h3" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                  {(college.short_name ?? college.name).charAt(0)}
                </Typography>
              </Box>
            )}
            {/* Logo overlay */}
            {college.logo_url && (
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  width: 40,
                  height: 40,
                  bgcolor: 'white',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image src={college.logo_url} alt="" width={36} height={36} style={{ objectFit: 'contain' }} />
              </Box>
            )}
            {/* Featured badge */}
            {isPremium && (
              <Chip
                label="Featured"
                size="small"
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  bgcolor: '#f97316',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  height: 22,
                }}
              />
            )}
          </Box>
        )}

        {/* Info section */}
        <Box sx={{ p: { xs: 1.5, sm: 2 }, flex: 1, minWidth: 0 }}>
          {/* Name & location */}
          <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '0.9rem', sm: '0.95rem' },
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                '&:hover': { color: 'primary.main' },
              }}
            >
              {college.name}
            </Typography>
          </Link>
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
            <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {college.city}, {college.state}
              {college.type ? ` · ${college.type}` : ''}
            </Typography>
          </Stack>

          {/* Badges */}
          <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
            {college.coa_approved && (
              <Chip label="COA ✓" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
            )}
            {college.naac_grade && (
              <Chip label={`NAAC ${college.naac_grade}`} size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
            )}
            {college.accepted_exams?.slice(0, 2).map((exam) => (
              <Chip key={exam} label={exam} size="small" sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
            ))}
            {college.counseling_systems?.slice(0, 2).map((sys) => (
              <Chip key={sys} label={sys} size="small" sx={{ bgcolor: '#f3e8ff', color: '#6b21a8', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
            ))}
          </Stack>

          {/* ROI snapshot */}
          {roi && !compact && (
            <Box
              sx={{
                mt: 1.5,
                p: 1,
                bgcolor: '#f0fdf4',
                border: '1px solid',
                borderColor: '#bbf7d0',
                borderRadius: 1.5,
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Total {COURSE_DURATION_YEARS}yr Cost</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc2626', fontSize: '0.8rem' }}>
                    {formatLakhs(roi.totalCost)}
                  </Typography>
                </Box>
                <Typography color="text.disabled" sx={{ fontSize: '0.8rem' }}>→</Typography>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Avg Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#16a34a', fontSize: '0.8rem' }}>
                    {formatLakhs(roi.avgPkg)}/yr
                  </Typography>
                </Box>
                <Chip
                  label={`~${roi.paybackYears}yr payback`}
                  size="small"
                  sx={{ bgcolor: '#1e40af', color: 'white', fontWeight: 600, fontSize: '0.65rem', height: 24 }}
                />
              </Stack>
            </Box>
          )}

          {/* Fee display for compact mode or when no ROI */}
          {(!roi || compact) && (
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, color: 'primary.main' }}>
              {formatFee(college.annual_fee_min, college.annual_fee_max, college.annual_fee_approx)}
              {college.total_barch_seats ? ` · ${college.total_barch_seats} seats` : ''}
            </Typography>
          )}

          {/* Action buttons */}
          {!compact && (
            <Stack direction="row" gap={0.75} sx={{ mt: 1.5 }} alignItems="center">
              <Button
                component={Link}
                href={href}
                variant="contained"
                size="small"
                sx={{ flex: 1, textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', py: 0.75 }}
              >
                View Details
              </Button>
              {college.admissions_phone && (
                <Tooltip title={`Call ${college.admissions_phone}`}>
                  <IconButton
                    component="a"
                    href={`tel:${college.admissions_phone}`}
                    size="small"
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
                  >
                    <PhoneIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              {college.brochure_url && (
                <Tooltip title="Download Brochure">
                  <IconButton
                    component="a"
                    href={college.brochure_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
                  >
                    <DescriptionIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <CompareButton college={college} />
              <SaveCollegeButton collegeId={college.id} />
            </Stack>
          )}
        </Box>
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 2: Update BrowseAllSection grid for horizontal cards**

In `apps/marketing/src/components/college-hub/landing/BrowseAllSection.tsx`, the listing grid should use fewer columns since cards are now horizontal. Change the Grid item from `xs={12} sm={6} md={4}` to `xs={12} md={6}`:

```typescript
// In the Grid mapping:
<Grid key={college.id} item xs={12} md={6}>
  <CollegeListingCard college={college} />
</Grid>
```

- [ ] **Step 3: Commit listing card**

```bash
git add apps/marketing/src/components/college-hub/CollegeListingCard.tsx
git add apps/marketing/src/components/college-hub/landing/BrowseAllSection.tsx
git commit -m "feat(college-hub): horizontal listing card with ROI snapshot, call, brochure buttons"
```

---

## Task 7: ROI Calculator Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/ROICalculator.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`

- [ ] **Step 1: Create ROICalculator component**

Create `apps/marketing/src/components/college-hub/ROICalculator.tsx`:

```tsx
import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import {
  COURSE_DURATION_YEARS,
  CITY_TIER_LIVING_COST,
  DEFAULT_LIVING_COST,
  MATERIALS_TRAVEL_COST,
} from '@/lib/college-hub/constants';

interface ROICalculatorProps {
  annualFee: number;
  avgSalary: number;
  minSalary: number | null;
  maxSalary: number | null;
  citySlug: string | null;
  city: string;
}

function formatLakhs(val: number): string {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  return `₹${(val / 1000).toFixed(0)}K`;
}

function getCityTierLabel(citySlug: string | null): string {
  if (!citySlug) return 'Tier 3';
  if (CITY_TIER_LIVING_COST[citySlug] === 180000) return 'Tier 1 (Metro)';
  if (CITY_TIER_LIVING_COST[citySlug] === 150000) return 'Tier 2';
  return 'Tier 3';
}

export default function ROICalculator({ annualFee, avgSalary, minSalary, maxSalary, citySlug, city }: ROICalculatorProps) {
  const livingCost = CITY_TIER_LIVING_COST[citySlug ?? ''] ?? DEFAULT_LIVING_COST;
  const tuitionTotal = annualFee * COURSE_DURATION_YEARS;
  const livingTotal = livingCost * COURSE_DURATION_YEARS;
  const materialsTotal = MATERIALS_TRAVEL_COST * COURSE_DURATION_YEARS;
  const totalCost = tuitionTotal + livingTotal + materialsTotal;
  const paybackYears = Math.round((totalCost / avgSalary) * 10) / 10;

  return (
    <Box>
      <Grid container spacing={2}>
        {/* Investment side */}
        <Grid item xs={12} sm={6}>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 2.5, bgcolor: '#fef2f2', borderColor: '#fecaca' }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Investment ({COURSE_DURATION_YEARS} years)
            </Typography>
            <Stack gap={0.75} sx={{ mt: 1.5 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Tuition Fees</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(tuitionTotal)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Hostel + Living</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(livingTotal)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Materials & Travel</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(materialsTotal)}</Typography>
              </Stack>
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ borderTop: '1px solid #fecaca', pt: 1, mt: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc2626' }}>Total</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc2626' }}>{formatLakhs(totalCost)}</Typography>
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        {/* Returns side */}
        <Grid item xs={12} sm={6}>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 2.5, bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Expected Returns
            </Typography>
            <Stack gap={0.75} sx={{ mt: 1.5 }}>
              {minSalary && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Min Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(minSalary)}/yr</Typography>
                </Stack>
              )}
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Avg Package</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(avgSalary)}/yr</Typography>
              </Stack>
              {maxSalary && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Max Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatLakhs(maxSalary)}/yr</Typography>
                </Stack>
              )}
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ borderTop: '1px solid #bbf7d0', pt: 1, mt: 0.5 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#16a34a' }}>Payback Period</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#16a34a' }}>~{paybackYears} years</Typography>
              </Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Disclaimer */}
      <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 1.5 }}>
        <Stack direction="row" gap={0.75} alignItems="flex-start">
          <InfoIcon sx={{ fontSize: 16, color: '#1e40af', mt: 0.25 }} />
          <Typography variant="caption" sx={{ color: '#1e40af' }}>
            Living costs estimated for {getCityTierLabel(citySlug)} city ({city}). Actual costs may vary. Placement data from latest available batch.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Add ROI section to CollegePageTemplate**

In `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`, add import:
```typescript
import ROICalculator from './ROICalculator';
```

Add the ROI section after the Placements section (after `</Section>` for placements, before Infrastructure):
```typescript
{/* ROI Calculator — requires placement salary data */}
{college.avg_placement_salary && (college.annual_fee_approx ?? college.annual_fee_min) && (
  <Section id="roi" title="Return on Investment">
    <TierGate
      requiredTier="gold"
      featureName="ROI Calculator"
      collegeTier={college.neram_tier as CollegeTier}
    >
      <ROICalculator
        annualFee={college.annual_fee_approx ?? college.annual_fee_min!}
        avgSalary={college.avg_placement_salary}
        minSalary={college.min_placement_salary ?? null}
        maxSalary={college.max_placement_salary ?? null}
        citySlug={college.city_slug ?? null}
        city={college.city}
      />
    </TierGate>
  </Section>
)}
```

Also add 'roi' to the `buildNavPills` function if placement data exists:
```typescript
// After the 'placements' pill in buildNavPills:
if (college.avg_placement_salary) {
  pills.push({ id: 'roi', label: 'ROI', icon: <AttachMoneyIcon sx={{ fontSize: 16 }} /> });
}
```

- [ ] **Step 3: Commit ROI calculator**

```bash
git add apps/marketing/src/components/college-hub/ROICalculator.tsx
git add apps/marketing/src/components/college-hub/CollegePageTemplate.tsx
git commit -m "feat(college-hub): add ROI calculator section on college profiles"
```

---

## Task 8: New Dynamic Route Pages

**Files:**
- Create: `apps/marketing/src/app/[locale]/colleges/counseling/[system]/page.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/city/[city]/page.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/type/[type]/page.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/accreditation/[filter]/page.tsx`

- [ ] **Step 1: Create counseling/[system] page**

Create `apps/marketing/src/app/[locale]/colleges/counseling/[system]/page.tsx`:

```tsx
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateCounselingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByCounseling, getActiveCounselingSystems } from '@/lib/college-hub/queries';
import { COUNSELING_LABELS, COUNSELING_SLUGS } from '@/lib/college-hub/constants';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; system: string } };

export async function generateStaticParams() {
  try {
    const systems = await getActiveCounselingSystems();
    const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
    return locales.flatMap((locale) =>
      systems.map((s) => ({ locale, system: s.system.toLowerCase().replace(/_/g, '-') }))
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({ params: { locale, system } }: Props): Promise<Metadata> {
  const systemKey = COUNSELING_SLUGS[system];
  if (!systemKey) return { title: 'Not Found' };
  const colleges = await getCollegesByCounseling(systemKey);
  return generateCounselingMetadata(locale, systemKey, colleges.length);
}

export default async function CounselingCollegesPage({ params: { locale, system } }: Props) {
  setRequestLocale(locale);

  const systemKey = COUNSELING_SLUGS[system];
  if (!systemKey) notFound();

  const colleges = await getCollegesByCounseling(systemKey);
  if (colleges.length === 0) notFound();

  const label = COUNSELING_LABELS[systemKey] ?? systemKey;

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${label} Colleges`, path: `/colleges/counseling/${system}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `${label} Colleges` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            B.Arch Colleges under {label} Counseling
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} architecture colleges accepting {label} counseling
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid key={college.id} item xs={12} md={6}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
```

- [ ] **Step 2: Create city/[city] page**

Create `apps/marketing/src/app/[locale]/colleges/city/[city]/page.tsx`:

```tsx
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateCityMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByCity, getActiveCities } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; city: string } };

export async function generateStaticParams() {
  try {
    const cities = await getActiveCities();
    const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
    return locales.flatMap((locale) =>
      cities.map((c) => ({ locale, city: c.city_slug }))
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({ params: { locale, city } }: Props): Promise<Metadata> {
  const colleges = await getCollegesByCity(city);
  const cityName = colleges[0]?.city ?? city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return generateCityMetadata(locale, cityName, colleges.length);
}

export default async function CityCollegesPage({ params: { locale, city } }: Props) {
  setRequestLocale(locale);

  const colleges = await getCollegesByCity(city);
  if (colleges.length === 0) notFound();

  const cityName = colleges[0]?.city ?? city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${cityName} Colleges`, path: `/colleges/city/${city}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `Architecture Colleges in ${cityName}` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            Architecture Colleges in {cityName}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} B.Arch colleges in {cityName}
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid key={college.id} item xs={12} md={6}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
```

- [ ] **Step 3: Create type/[type] page**

Create `apps/marketing/src/app/[locale]/colleges/type/[type]/page.tsx`:

```tsx
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateTypeMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByType } from '@/lib/college-hub/queries';
import { COLLEGE_TYPE_SLUGS } from '@/lib/college-hub/constants';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; type: string } };

export async function generateStaticParams() {
  const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
  const types = Object.keys(COLLEGE_TYPE_SLUGS);
  return locales.flatMap((locale) => types.map((type) => ({ locale, type })));
}

export async function generateMetadata({ params: { locale, type } }: Props): Promise<Metadata> {
  if (!COLLEGE_TYPE_SLUGS[type]) return { title: 'Not Found' };
  const colleges = await getCollegesByType(COLLEGE_TYPE_SLUGS[type]);
  return generateTypeMetadata(locale, type, colleges.length);
}

export default async function TypeCollegesPage({ params: { locale, type } }: Props) {
  setRequestLocale(locale);

  const typeName = COLLEGE_TYPE_SLUGS[type];
  if (!typeName) notFound();

  const colleges = await getCollegesByType(typeName);
  if (colleges.length === 0) notFound();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${typeName} Colleges`, path: `/colleges/type/${type}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `${typeName} Architecture Colleges` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            {typeName} Architecture Colleges in India
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} {typeName.toLowerCase()} B.Arch colleges across India
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid key={college.id} item xs={12} md={6}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
```

- [ ] **Step 4: Create accreditation/[filter] page**

Create `apps/marketing/src/app/[locale]/colleges/accreditation/[filter]/page.tsx`:

```tsx
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateAccreditationMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByAccreditation } from '@/lib/college-hub/queries';
import { ACCREDITATION_FILTERS } from '@/lib/college-hub/constants';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; filter: string } };

export async function generateStaticParams() {
  const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
  const filters = Object.keys(ACCREDITATION_FILTERS);
  return locales.flatMap((locale) => filters.map((filter) => ({ locale, filter })));
}

export async function generateMetadata({ params: { locale, filter } }: Props): Promise<Metadata> {
  if (!ACCREDITATION_FILTERS[filter]) return { title: 'Not Found' };
  const colleges = await getCollegesByAccreditation(filter);
  return generateAccreditationMetadata(locale, filter, colleges.length);
}

export default async function AccreditationCollegesPage({ params: { locale, filter } }: Props) {
  setRequestLocale(locale);

  const filterConfig = ACCREDITATION_FILTERS[filter];
  if (!filterConfig) notFound();

  const colleges = await getCollegesByAccreditation(filter);
  if (colleges.length === 0) notFound();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: filterConfig.label, path: `/colleges/accreditation/${filter}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `${filterConfig.label} Colleges` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            {filterConfig.label} Architecture Colleges
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} colleges. {filterConfig.description}
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid key={college.id} item xs={12} md={6}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
```

- [ ] **Step 5: Commit new routes**

```bash
git add apps/marketing/src/app/[locale]/colleges/counseling/
git add apps/marketing/src/app/[locale]/colleges/city/
git add apps/marketing/src/app/[locale]/colleges/type/
git add apps/marketing/src/app/[locale]/colleges/accreditation/
git commit -m "feat(college-hub): add counseling, city, type, accreditation listing pages"
```

---

## Task 9: Explore Categories Section (Homepage)

**Files:**
- Create: `apps/marketing/src/components/college-hub/landing/ExploreCategoriesSection.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/page.tsx`

- [ ] **Step 1: Create ExploreCategoriesSection component**

Create `apps/marketing/src/components/college-hub/landing/ExploreCategoriesSection.tsx`:

```tsx
import { Box, Container, Grid, Paper, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import { COUNSELING_LABELS, COLLEGE_TYPE_SLUGS, ACCREDITATION_FILTERS } from '@/lib/college-hub/constants';
import { FEE_RANGES } from '@/lib/college-hub/queries';

interface ExploreCategoriesSectionProps {
  stateData: Array<{ state_slug: string; state: string; count: number }>;
  counselingData: Array<{ system: string; count: number }>;
  cityData: Array<{ city_slug: string; city: string; count: number }>;
}

function CategoryColumn({
  title,
  items,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  items: Array<{ label: string; href: string; count?: number }>;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, height: '100%' }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: 'warning.main', textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, display: 'block' }}
      >
        {title}
      </Typography>
      <Stack gap={0.5}>
        {items.map((item) => (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.primary',
                '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                py: 0.25,
              }}
            >
              {item.label}
              {item.count != null && (
                <Typography component="span" variant="caption" sx={{ color: 'text.disabled', ml: 0.75 }}>
                  ({item.count})
                </Typography>
              )}
            </Typography>
          </Link>
        ))}
        {viewAllHref && (
          <Link href={viewAllHref} style={{ textDecoration: 'none' }}>
            <Typography variant="body2" sx={{ color: 'primary.main', mt: 1, fontSize: '0.8rem' }}>
              {viewAllLabel ?? 'View all'} →
            </Typography>
          </Link>
        )}
      </Stack>
    </Paper>
  );
}

export default function ExploreCategoriesSection({ stateData, counselingData, cityData }: ExploreCategoriesSectionProps) {
  const stateItems = stateData.slice(0, 10).map((s) => ({
    label: s.state,
    href: `/colleges/${s.state_slug}`,
    count: s.count,
  }));

  const counselingItems = counselingData.slice(0, 10).map((c) => ({
    label: COUNSELING_LABELS[c.system] ?? c.system,
    href: `/colleges/counseling/${c.system.toLowerCase().replace(/_/g, '-')}`,
    count: c.count,
  }));

  const cityItems = cityData.slice(0, 8).map((c) => ({
    label: c.city,
    href: `/colleges/city/${c.city_slug}`,
    count: c.count,
  }));

  const rankingItems = [
    { label: 'NIRF Architecture Rankings', href: '/colleges/rankings/nirf' },
    { label: 'ArchIndex Top Rated', href: '/colleges/rankings/archindex' },
    ...Object.entries(ACCREDITATION_FILTERS).map(([key, val]) => ({
      label: val.label,
      href: `/colleges/accreditation/${key}`,
    })),
  ];

  const feeItems = Object.entries(FEE_RANGES).map(([key, range]) => ({
    label: range.label,
    href: `/colleges/fees/${key}`,
  }));

  const typeItems = Object.entries(COLLEGE_TYPE_SLUGS).map(([slug, name]) => ({
    label: `${name} Colleges`,
    href: `/colleges/type/${slug}`,
  }));

  return (
    <Box sx={{ py: { xs: 4, sm: 6 }, bgcolor: '#f8fafc' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 4 } }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', sm: '1.75rem' }, fontWeight: 800 }}>
            Explore Architecture Colleges
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            Browse by state, counseling, rankings, fees, and more
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <CategoryColumn title="📍 By State" items={stateItems} viewAllHref="/colleges" viewAllLabel="All states" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <CategoryColumn title="📝 By Counseling" items={counselingItems} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack gap={2}>
              <CategoryColumn title="🏆 Rankings" items={rankingItems} />
              <CategoryColumn title="🏙️ By City" items={cityItems} />
            </Stack>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack gap={2}>
              <CategoryColumn title="💰 By Fee Range" items={feeItems} />
              <CategoryColumn title="🏫 By Type" items={typeItems} />
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
```

- [ ] **Step 2: Add ExploreCategoriesSection to homepage**

In `apps/marketing/src/app/[locale]/colleges/page.tsx`:

Add import:
```typescript
import ExploreCategoriesSection from '@/components/college-hub/landing/ExploreCategoriesSection';
```

Add `getActiveCities` and `getActiveCounselingSystems` to imports from queries:
```typescript
import { getColleges, getLandingStats, getActiveStates, getCollegeCountByType, getCollegeCountByCounseling, getFeaturedColleges, getActiveCities, getActiveCounselingSystems } from '@/lib/college-hub/queries';
```

Add two more queries to the `Promise.allSettled` call:
```typescript
const [collegesResult, statsResult, statesResult, typesResult, counselingResult, featuredResult, citiesResult, counselingSystemsResult] =
  await Promise.allSettled([
    getColleges(filters),
    getLandingStats(),
    getActiveStates(),
    getCollegeCountByType(),
    getCollegeCountByCounseling(),
    getFeaturedColleges(),
    getActiveCities(),
    getActiveCounselingSystems(),
  ]);
```

Extract the new data:
```typescript
const cityData = citiesResult.status === 'fulfilled' ? citiesResult.value : [];
const counselingSystemData = counselingSystemsResult.status === 'fulfilled' ? counselingSystemsResult.value : [];
```

Render the section between `<BrowseByCategory>` and `<FeaturedCollegesCarousel>`:
```tsx
<ExploreCategoriesSection
  stateData={stateData}
  counselingData={counselingSystemData}
  cityData={cityData}
/>
```

- [ ] **Step 3: Commit explore categories**

```bash
git add apps/marketing/src/components/college-hub/landing/ExploreCategoriesSection.tsx
git add apps/marketing/src/app/[locale]/colleges/page.tsx
git commit -m "feat(college-hub): add explore categories section on hub homepage"
```

---

## Task 10: Enhanced Header Mega-Menu

**Files:**
- Modify: `apps/marketing/src/components/Header.tsx`

- [ ] **Step 1: Update the Colleges NAV_GROUPS config**

In `apps/marketing/src/components/Header.tsx`, replace the `colleges` entry in `NAV_GROUPS` (around lines 133-163) with the new 4-column structure:

```typescript
{
  key: 'colleges',
  labelKey: 'colleges',
  icon: <SchoolIcon fontSize="small" />,
  columns: [
    {
      title: 'By State',
      links: [
        { label: 'Tamil Nadu', href: '/colleges/tamil-nadu' },
        { label: 'Karnataka', href: '/colleges/karnataka' },
        { label: 'Maharashtra', href: '/colleges/maharashtra' },
        { label: 'Delhi NCR', href: '/colleges/delhi' },
        { label: 'Kerala', href: '/colleges/kerala' },
        { label: 'Telangana', href: '/colleges/telangana' },
        { label: 'View all states →', href: '/colleges' },
      ],
    },
    {
      title: 'By Exam & Counseling',
      links: [
        { label: 'NATA Colleges', href: '/colleges' },
        { label: 'JEE Main Paper 2', href: '/colleges' },
        { label: 'TNEA Counseling', href: '/colleges/tnea' },
        { label: 'JoSAA Counseling', href: '/colleges/josaa' },
        { label: 'KEAM Counseling', href: '/colleges/counseling/keam' },
        { label: 'KCET Counseling', href: '/colleges/counseling/kcet' },
        { label: 'All counseling →', href: '/colleges' },
      ],
    },
    {
      title: 'Rankings & Filters',
      links: [
        { label: 'NIRF Architecture', href: '/colleges/rankings/nirf' },
        { label: 'ArchIndex Top Rated', href: '/colleges/rankings/archindex' },
        { label: 'COA Approved', href: '/colleges/accreditation/coa-approved' },
        { label: 'Government Colleges', href: '/colleges/type/government' },
        { label: 'Private Colleges', href: '/colleges/type/private' },
        { label: 'Fee: Under ₹3L', href: '/colleges/fees/0-3L' },
        { label: 'All fee ranges →', href: '/colleges' },
      ],
    },
    {
      title: 'Quick Links',
      links: [
        { label: '⭐ Featured Colleges', href: '/colleges', badge: 'NEW' },
        { label: '🔍 Compare Colleges', href: '/colleges/compare' },
        { label: '💾 Saved Colleges', href: '/colleges/saved' },
        { label: '🏙️ Browse by City', href: '/colleges' },
      ],
    },
  ],
},
```

- [ ] **Step 2: Verify the desktop Popover renders 4 columns**

The existing desktop dropdown rendering code (around lines 603-682) already iterates over `columns` and renders them in a grid. Check that the grid works with 4 columns. If the existing code uses a fixed column width, update to use `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))` or `repeat(4, 1fr)` to accommodate the 4th column.

Look for the Popover rendering and ensure the container has enough width. The Paper component inside the Popover should have:
```typescript
sx={{ p: 3, minWidth: 720, maxWidth: 880 }}
```

And the grid layout should be:
```typescript
<Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
```

- [ ] **Step 3: Verify mobile accordion works with 4 sections**

The mobile drawer already maps over `columns` with accordion toggles. The 4th column should render automatically. No changes needed unless the mobile code hardcodes column count.

- [ ] **Step 4: Commit mega-menu**

```bash
git add apps/marketing/src/components/Header.tsx
git commit -m "feat(college-hub): 4-column mega-menu with state, counseling, rankings, quick links"
```

---

## Task 11: Build Verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd apps/marketing && pnpm type-check
```
Expected: No errors.

- [ ] **Step 2: Run lint**

```bash
cd apps/marketing && pnpm lint
```
Expected: No errors (or only pre-existing warnings).

- [ ] **Step 3: Run build**

```bash
pnpm build --filter=@neram/marketing
```
Expected: Successful build. New pages should appear in the build output.

- [ ] **Step 4: Manual testing**

Start dev server:
```bash
pnpm dev:marketing
```

Test checklist:
1. Visit `/colleges` - verify ExploreCategoriesSection appears with all categories
2. Click a state link - verify breadcrumbs show `Colleges > Tamil Nadu`
3. Click into a college - verify breadcrumbs show `Colleges > Tamil Nadu > College Name`
4. Click "Colleges" breadcrumb - verify navigation back to hub homepage
5. Hover "Colleges" in header - verify 4-column mega-menu dropdown
6. Visit `/colleges/counseling/tnea` - verify page loads with TNEA colleges
7. Visit `/colleges/city/chennai` - verify page loads with Chennai colleges
8. Visit `/colleges/type/government` - verify government colleges listed
9. Visit `/colleges/accreditation/coa-approved` - verify COA colleges listed
10. Check listing cards show horizontal layout with ROI snapshot (if data exists)
11. Check college profile has ROI section after Placements (if data exists)
12. Test mobile viewport (375px): breadcrumbs wrap, cards stack vertically, mega-menu becomes accordion

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(college-hub): College Hub v2 complete - navigation, discovery, ROI, mega-menu"
```
