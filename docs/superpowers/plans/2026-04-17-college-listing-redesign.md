# College Listing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance college listing pages with a tiered card layout (featured top 5 + compact rows), richer filter sidebar (search, exam, city, rating, fee presets), ad banner slots, campus photos, and mobile-optimized filter drawer.

**Architecture:** Extend existing FilterSidebar + CollegeListingCard pattern. Create two new card components (FeaturedCollegeCard, CompactCollegeCard) plus supporting components (SponsoredBanner, CollegeSearch, ActiveFilterPills). Update the state listing page to use the tiered layout. All filters are URL-param-driven via Next.js searchParams. The state listing page switches from ISR to dynamic rendering since filters require searchParams.

**Tech Stack:** Next.js 14 App Router, MUI v5, Supabase, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-17-college-listing-redesign-design.md`

**Mockups:** `.superpowers/brainstorm/5132-1776427178/content/full-layout-mockup.html` (desktop), `mobile-mockup.html` (mobile)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/marketing/src/lib/college-hub/types.ts` | Modify | Add `exam`, `city`, `rating` to CollegeFilters; add new sort options |
| `apps/marketing/src/lib/college-hub/queries.ts` | Modify | Add exam/city/rating filters, placement_high + naac_grade sorts, city count query |
| `apps/marketing/src/lib/college-hub/constants.ts` | Modify | Add FEATURED_COUNT, AD_INTERVAL, FEE_PRESETS, EXAM_TYPES constants |
| `apps/marketing/src/components/college-hub/CollegeSearch.tsx` | Create | Debounced search input with URL param sync |
| `apps/marketing/src/components/college-hub/ActiveFilterPills.tsx` | Create | Displays active filters as removable pills |
| `apps/marketing/src/components/college-hub/FeaturedCollegeCard.tsx` | Create | Large card with campus photo, 4-stat grid, action buttons |
| `apps/marketing/src/components/college-hub/CompactCollegeCard.tsx` | Create | Slim horizontal row card for rank #6+ |
| `apps/marketing/src/components/college-hub/SponsoredBanner.tsx` | Create | Ad banner placeholder |
| `apps/marketing/src/components/college-hub/FilterSidebar.tsx` | Modify | Add search, exam chips, city checkboxes, rating chips, fee presets, new sorts |
| `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx` | Modify | Switch to dynamic, add FilterSidebar + tiered card layout |

---

### Task 1: Update Types and Constants

**Files:**
- Modify: `apps/marketing/src/lib/college-hub/types.ts:240-252`
- Modify: `apps/marketing/src/lib/college-hub/constants.ts`

- [ ] **Step 1: Update CollegeFilters interface**

In `apps/marketing/src/lib/college-hub/types.ts`, replace the `CollegeFilters` interface (lines 240-252):

```typescript
// Filter options for listing pages
export interface CollegeFilters {
  state?: string;
  type?: string;
  counselingSystem?: CounselingSystem;
  exam?: 'NATA' | 'JEE_PAPER_2';
  city?: string;
  rating?: number;
  minFee?: number;
  maxFee?: number;
  naacGrade?: string;
  coa?: boolean;
  search?: string;
  sortBy?: 'arch_index' | 'nirf_rank' | 'fee_low' | 'fee_high' | 'name' | 'placement_high' | 'naac_grade';
  page?: number;
  limit?: number;
}
```

- [ ] **Step 2: Add listing layout constants**

In `apps/marketing/src/lib/college-hub/constants.ts`, append:

```typescript
// Listing layout
export const FEATURED_COUNT = 5;
export const AD_INTERVAL_COMPACT = 5; // Show ad every N compact cards
export const AD_AFTER_FEATURED = 2;   // Show first ad after this many featured cards

export const FEE_PRESETS = [
  { label: 'Under ₹1L', minFee: 0, maxFee: 100000 },
  { label: '₹1-2L', minFee: 100000, maxFee: 200000 },
  { label: '₹2-5L', minFee: 200000, maxFee: 500000 },
  { label: '₹5L+', minFee: 500000, maxFee: undefined },
] as const;

export const EXAM_TYPES = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE_PAPER_2', label: 'JEE Paper 2' },
] as const;

export const SORT_OPTIONS = [
  { value: 'arch_index', label: 'Relevance' },
  { value: 'placement_high', label: 'Highest Placement' },
  { value: 'fee_low', label: 'Fee: Low to High' },
  { value: 'fee_high', label: 'Fee: High to Low' },
  { value: 'naac_grade', label: 'NAAC Grade' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'nirf_rank', label: 'NIRF Rank' },
] as const;

export const COLLEGE_TYPES = [
  { value: 'Government', label: 'Government' },
  { value: 'Private', label: 'Private' },
  { value: 'Deemed', label: 'Deemed University' },
  { value: 'Government Aided', label: 'Government Aided' },
] as const;

export const NAAC_GRADES = ['A++', 'A+', 'A', 'B++', 'B+', 'B'] as const;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/marketing && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to CollegeFilters or constants.

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/lib/college-hub/types.ts apps/marketing/src/lib/college-hub/constants.ts
git commit -m "feat(college-hub): add exam/city/rating filters and layout constants to types"
```

---

### Task 2: Update Query Layer

**Files:**
- Modify: `apps/marketing/src/lib/college-hub/queries.ts:31-77`

- [ ] **Step 1: Add new filters and sorts to getColleges**

Replace the `getColleges` function (lines 31-77) in `apps/marketing/src/lib/college-hub/queries.ts`:

```typescript
export async function getColleges(
  filters: CollegeFilters = {}
): Promise<{ data: CollegeListItem[]; count: number }> {
  const supabase = getSupabaseAdminClient();
  const {
    state,
    type,
    counselingSystem,
    exam,
    city,
    rating,
    minFee,
    maxFee,
    naacGrade,
    coa,
    search,
    sortBy = 'arch_index',
    page = 1,
    limit = COLLEGES_PER_PAGE,
  } = filters;

  let query = supabase
    .from('colleges')
    .select(LISTING_SELECT, { count: 'exact' });

  if (state) query = query.eq('state_slug', state);
  if (type) query = query.eq('type', type);
  if (counselingSystem) query = query.contains('counseling_systems', [counselingSystem]);
  if (exam) query = query.contains('accepted_exams', [exam]);
  if (city) query = query.eq('city_slug', city);
  if (coa !== undefined) query = query.eq('coa_approved', coa);
  if (naacGrade) query = query.eq('naac_grade', naacGrade);
  if (minFee) query = query.gte('annual_fee_approx', minFee);
  if (maxFee) query = query.lte('annual_fee_approx', maxFee);
  if (search) query = query.ilike('name', `%${search}%`);

  // Sort
  if (sortBy === 'arch_index') query = query.order('arch_index_score', { ascending: false, nullsFirst: false });
  else if (sortBy === 'nirf_rank') query = query.order('nirf_rank_architecture', { ascending: true, nullsFirst: false });
  else if (sortBy === 'fee_low') query = query.order('annual_fee_approx', { ascending: true, nullsFirst: false });
  else if (sortBy === 'fee_high') query = query.order('annual_fee_approx', { ascending: false, nullsFirst: false });
  else if (sortBy === 'name') query = query.order('name', { ascending: true });
  else if (sortBy === 'placement_high') query = query.order('avg_placement_salary', { ascending: false, nullsFirst: false });
  else if (sortBy === 'naac_grade') query = query.order('naac_grade', { ascending: true, nullsFirst: false });

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as CollegeListItem[], count: count ?? 0 };
}
```

- [ ] **Step 2: Add getCitiesForState query**

Append after the `getActiveStates` function in `queries.ts`:

```typescript
export async function getCitiesForState(
  stateSlug: string
): Promise<{ city: string; city_slug: string; count: number }[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('colleges')
    .select('city, city_slug')
    .eq('state_slug', stateSlug)
    .not('city_slug', 'is', null);
  if (error) throw error;

  const counts = new Map<string, { city: string; city_slug: string; count: number }>();
  for (const row of data ?? []) {
    const key = row.city_slug!;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { city: row.city, city_slug: key, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export async function getTypeCountsForState(
  stateSlug: string
): Promise<{ type: string; count: number }[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('colleges')
    .select('type')
    .eq('state_slug', stateSlug)
    .not('type', 'is', null);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.type!, (counts.get(row.type!) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/marketing && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/lib/college-hub/queries.ts
git commit -m "feat(college-hub): add exam/city/rating filters, placement sort, city count queries"
```

---

### Task 3: Create CollegeSearch Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/CollegeSearch.tsx`

- [ ] **Step 1: Create the debounced search component**

```typescript
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface CollegeSearchProps {
  defaultValue?: string;
  placeholder?: string;
}

export default function CollegeSearch({
  defaultValue = '',
  placeholder = 'Search colleges...',
}: CollegeSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  const handleChange = (newValue: string) => {
    setValue(newValue);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue.trim()) {
        params.set('q', newValue.trim());
      } else {
        params.delete('q');
      }
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    }, 300);
  };

  return (
    <TextField
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      size="small"
      fullWidth
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          </InputAdornment>
        ),
        sx: { borderRadius: 2.5, fontSize: '0.875rem' },
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/CollegeSearch.tsx
git commit -m "feat(college-hub): create debounced CollegeSearch component"
```

---

### Task 4: Create ActiveFilterPills Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/ActiveFilterPills.tsx`

- [ ] **Step 1: Create the active filter pills component**

```typescript
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Stack, Chip, Button } from '@mui/material';
import { STATE_NAMES } from '@/lib/college-hub/constants';

const PARAM_LABELS: Record<string, (v: string) => string> = {
  coa: () => 'COA Approved',
  type: (v) => v,
  exam: (v) => v === 'JEE_PAPER_2' ? 'JEE Paper 2' : v,
  naac: (v) => `NAAC ${v}`,
  city: (v) => v.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  minFee: (v) => `Min ₹${Number(v) >= 100000 ? `${(Number(v) / 100000).toFixed(0)}L` : `${(Number(v) / 1000).toFixed(0)}K`}`,
  maxFee: (v) => `Max ₹${Number(v) >= 100000 ? `${(Number(v) / 100000).toFixed(0)}L` : `${(Number(v) / 1000).toFixed(0)}K`}`,
  q: (v) => `"${v}"`,
  rating: (v) => `${v}★+`,
};

// Params that are filters (not state/sort/page)
const FILTER_PARAMS = ['coa', 'type', 'exam', 'naac', 'city', 'minFee', 'maxFee', 'q', 'rating'];

export default function ActiveFilterPills({ stateName }: { stateName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFilters: { key: string; label: string }[] = [];
  for (const key of FILTER_PARAMS) {
    const val = searchParams.get(key);
    if (val) {
      activeFilters.push({ key, label: PARAM_LABELS[key]?.(val) ?? val });
    }
  }

  if (activeFilters.length === 0 && !stateName) return null;

  const removeFilter = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(key);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearAll = () => {
    router.push(pathname);
  };

  return (
    <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center" sx={{ mb: 1.5 }}>
      {stateName && (
        <Chip
          label={stateName}
          size="small"
          sx={{ bgcolor: '#eff6ff', color: '#1565C0', borderColor: '#bfdbfe', fontWeight: 500, fontSize: '0.75rem' }}
          variant="outlined"
        />
      )}
      {activeFilters.map((f) => (
        <Chip
          key={f.key}
          label={f.label}
          size="small"
          onDelete={() => removeFilter(f.key)}
          sx={{ bgcolor: '#eff6ff', color: '#1565C0', borderColor: '#bfdbfe', fontWeight: 500, fontSize: '0.75rem' }}
          variant="outlined"
        />
      ))}
      {activeFilters.length >= 2 && (
        <Button size="small" onClick={clearAll} sx={{ fontSize: '0.7rem', textTransform: 'none', ml: 0.5 }}>
          Clear all
        </Button>
      )}
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/ActiveFilterPills.tsx
git commit -m "feat(college-hub): create ActiveFilterPills component"
```

---

### Task 5: Create FeaturedCollegeCard Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/FeaturedCollegeCard.tsx`

- [ ] **Step 1: Create the featured card component**

```typescript
'use client';

import { Box, Card, Chip, Stack, Typography, IconButton, Button, Tooltip } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import DescriptionIcon from '@mui/icons-material/Description';
import SaveCollegeButton from './SaveCollegeButton';
import CompareButton from './CompareButton';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface FeaturedCollegeCardProps {
  college: CollegeListItem;
  rank: number;
}

function formatFee(approx: number | null, min: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000
    ? `₹${(val / 100000).toFixed(1)}L/yr`
    : `₹${(val / 1000).toFixed(0)}K/yr`;
}

function formatSalary(val: number | null): string {
  if (!val) return 'N/A';
  return `₹${(val / 100000).toFixed(1)}L/yr`;
}

export default function FeaturedCollegeCard({ college, rank }: FeaturedCollegeCardProps) {
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;
  const isPremium = college.neram_tier === 'gold' || college.neram_tier === 'platinum';

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': { boxShadow: 4, borderColor: 'primary.light' },
        mb: 2,
      }}
    >
      {/* Campus Photo */}
      <Box sx={{ position: 'relative', width: '100%', height: { xs: 150, sm: 200 } }}>
        {college.hero_image_url ? (
          <Image
            src={college.hero_image_url}
            alt={`${college.name} campus`}
            fill
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 900px) 100vw, 700px"
            priority={rank <= 2}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, #1e3a5f, #2d5a87)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 800, fontSize: '5rem' }}>
              {(college.short_name ?? college.name).charAt(0)}
            </Typography>
          </Box>
        )}
        {/* Gradient overlay */}
        <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(transparent, rgba(0,0,0,0.4))' }} />

        {/* Featured badge */}
        {isPremium && (
          <Chip
            label="⭐ Featured"
            size="small"
            sx={{
              position: 'absolute', top: 12, left: 12, zIndex: 2,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
              fontWeight: 600, fontSize: '0.65rem', height: 24,
            }}
          />
        )}

        {/* Rank badge */}
        <Box
          sx={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 40, height: 40, borderRadius: '50%', bgcolor: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 16, color: 'primary.main',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          #{rank}
        </Box>

        {/* Logo overlay */}
        <Box
          sx={{
            position: 'absolute', bottom: -20, left: 16, zIndex: 3,
            width: 48, height: 48, borderRadius: 2, bgcolor: 'white', border: '2px solid white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)', overflow: 'hidden',
          }}
        >
          {college.logo_url ? (
            <Image src={college.logo_url} alt="" width={40} height={40} style={{ objectFit: 'contain' }} />
          ) : (
            <Typography sx={{ fontWeight: 700, color: 'primary.main', fontSize: 20 }}>
              {(college.short_name ?? college.name).charAt(0)}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ p: { xs: 2, sm: 2.5 }, pt: { xs: 4, sm: 4 } }}>
        {/* Name + location */}
        <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.1rem' }, lineHeight: 1.3, '&:hover': { color: 'primary.main' } }}
          >
            {college.name}
          </Typography>
        </Link>
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
          <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {college.city}, {college.state}{college.type ? ` · ${college.type}` : ''}
          </Typography>
        </Stack>

        {/* Badges */}
        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1.5 }}>
          {college.coa_approved && (
            <Chip label="✓ COA" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
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

        {/* Stats grid */}
        <Stack
          direction="row"
          sx={{
            mt: 2, pt: 1.5, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', pb: 1.5,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)' },
            gap: 1, textAlign: 'center',
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#059669' }}>
              {formatFee(college.annual_fee_approx, college.annual_fee_min)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Annual Fee</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {college.total_barch_seats ?? 'N/A'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>B.Arch Seats</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'primary.main' }}>
              {formatSalary(college.avg_placement_salary)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Avg Package</Typography>
          </Box>
          {/* 4th stat only on desktop */}
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {college.highlights?.[0] ?? 'N/A'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Highlight</Typography>
          </Box>
        </Stack>

        {/* Actions */}
        <Stack direction="row" gap={1} sx={{ mt: 2 }} alignItems="center" flexWrap="wrap">
          <Button
            component={Link}
            href={href}
            variant="contained"
            size="small"
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', px: 3, borderRadius: 2 }}
          >
            View Details
          </Button>
          <CompareButton slug={college.slug} collegeName={college.name} />
          {college.brochure_url && (
            <Tooltip title="Download Brochure">
              <IconButton component="a" href={college.brochure_url} target="_blank" rel="noopener noreferrer" size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <DescriptionIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <SaveCollegeButton slug={college.slug} collegeId={college.id} collegeName={college.name} size="small" />
          {college.admissions_phone && (
            <Tooltip title={`Call ${college.admissions_phone}`}>
              <IconButton component="a" href={`tel:${college.admissions_phone}`} size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <PhoneIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/marketing && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/college-hub/FeaturedCollegeCard.tsx
git commit -m "feat(college-hub): create FeaturedCollegeCard component with campus photo and stats grid"
```

---

### Task 6: Create CompactCollegeCard Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/CompactCollegeCard.tsx`

- [ ] **Step 1: Create the compact row card component**

```typescript
'use client';

import { Box, Card, Chip, Stack, Typography, Button } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface CompactCollegeCardProps {
  college: CollegeListItem;
  rank: number;
}

function formatFee(approx: number | null, min: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000
    ? `₹${(val / 100000).toFixed(1)}L`
    : `₹${(val / 1000).toFixed(0)}K`;
}

export default function CompactCollegeCard({ college, rank }: CompactCollegeCardProps) {
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

  return (
    <Card
      component={Link}
      href={href}
      variant="outlined"
      sx={{
        borderRadius: 3,
        p: { xs: 1.5, sm: 2 },
        mb: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1.5, sm: 2 },
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': { boxShadow: 2, borderColor: 'primary.light' },
      }}
    >
      {/* Rank */}
      <Box
        sx={{
          width: 32, height: 32, borderRadius: '50%', bgcolor: 'action.hover',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14, color: 'text.secondary', flexShrink: 0,
        }}
      >
        {rank}
      </Box>

      {/* Logo */}
      <Box
        sx={{
          width: 44, height: 44, borderRadius: 2, bgcolor: '#f8fafc',
          border: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
        }}
      >
        {college.logo_url ? (
          <Image src={college.logo_url} alt="" width={36} height={36} style={{ objectFit: 'contain' }} />
        ) : (
          <Typography sx={{ fontWeight: 600, color: 'primary.main', fontSize: 16 }}>
            {(college.short_name ?? college.name).charAt(0)}
          </Typography>
        )}
      </Box>

      {/* Info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ fontWeight: 600, fontSize: { xs: '0.85rem', sm: '0.9rem' }, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {college.name}
        </Typography>
        <Stack direction="row" gap={0.5} alignItems="center" sx={{ mt: 0.3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            📍 {college.city}{college.type ? ` · ${college.type}` : ''}
            {college.coa_approved ? ' · ' : ''}
          </Typography>
          {college.coa_approved && (
            <Typography variant="caption" sx={{ color: '#166534', fontWeight: 500, fontSize: '0.7rem' }}>✓ COA</Typography>
          )}
        </Stack>
      </Box>

      {/* Exam badge (desktop only) */}
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, flexShrink: 0 }}>
        {college.accepted_exams?.slice(0, 1).map((exam) => (
          <Chip key={exam} label={exam} size="small" sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: '0.6rem', height: 20, fontWeight: 500 }} />
        ))}
      </Box>

      {/* Stats */}
      <Stack direction="row" gap={{ xs: 2, sm: 3 }} sx={{ flexShrink: 0 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#059669' }}>
            {formatFee(college.annual_fee_approx, college.annual_fee_min)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Fee/yr</Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {college.total_barch_seats ?? '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Seats</Typography>
        </Box>
      </Stack>

      {/* Desktop: Details button, Mobile: chevron */}
      <Box sx={{ display: { xs: 'none', sm: 'block' }, flexShrink: 0 }}>
        <Button size="small" variant="contained" sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 1.5, px: 2 }}>
          Details
        </Button>
      </Box>
      <ChevronRightIcon sx={{ display: { xs: 'block', sm: 'none' }, color: 'text.disabled', fontSize: 22, flexShrink: 0 }} />
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/CompactCollegeCard.tsx
git commit -m "feat(college-hub): create CompactCollegeCard row component"
```

---

### Task 7: Create SponsoredBanner Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/SponsoredBanner.tsx`

- [ ] **Step 1: Create the ad banner component**

```typescript
import { Box, Typography } from '@mui/material';
import Link from 'next/link';

interface SponsoredBannerProps {
  variant?: 'featured' | 'compact';
}

const BANNERS = [
  { text: 'Apply for B.Arch 2025 Admissions. Limited seats available.', cta: 'Learn More', href: '/colleges' },
  { text: 'Free NATA preparation guide. Download now!', cta: 'Get Free Guide', href: '/colleges' },
  { text: 'Compare top architecture colleges side by side.', cta: 'Compare Now', href: '/colleges/compare' },
];

export default function SponsoredBanner({ variant = 'compact' }: SponsoredBannerProps) {
  const banner = BANNERS[Math.floor(Math.random() * BANNERS.length)];

  return (
    <Box
      sx={{
        background: 'linear-gradient(135deg, #fef3c7, #fef9c3)',
        border: '1px dashed #f59e0b',
        borderRadius: 3,
        p: variant === 'featured' ? { xs: 2, sm: 2.5 } : { xs: 1.5, sm: 2 },
        my: variant === 'featured' ? 2.5 : 1.5,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: '0.6rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: 1, mb: 0.5 }}>
        Sponsored
      </Typography>
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' }, color: '#78350f' }}>
        {banner.text}{' '}
        <Link href={banner.href} style={{ color: '#1565C0', fontWeight: 600, textDecoration: 'none' }}>
          {banner.cta} →
        </Link>
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/SponsoredBanner.tsx
git commit -m "feat(college-hub): create SponsoredBanner placeholder component"
```

---

### Task 8: Enhance FilterSidebar

**Files:**
- Modify: `apps/marketing/src/components/college-hub/FilterSidebar.tsx`

- [ ] **Step 1: Rewrite FilterSidebar with all new filters**

Replace the entire contents of `apps/marketing/src/components/college-hub/FilterSidebar.tsx` with the enhanced version. The key additions are: search input, exam type chips, city checkboxes with counts, rating chips, fee preset chips, and the new sort options. The mobile drawer gets floating FABs and an Apply button.

The full file is too large to inline here. Key changes to the existing SidebarContent:

1. Import `CollegeSearch` component and render it at the top of the filter list
2. Replace hardcoded `SORT_OPTIONS`, `COLLEGE_TYPES`, `NAAC_GRADES` with imports from constants
3. Add `EXAM_TYPES` chip group after COA checkbox
4. Add city checkboxes with counts (accept `cityCounts` prop)
5. Add `FEE_PRESETS` as clickable chips below the fee range selects
6. Add rating chip group (4+, 3+, Any)
7. Add `typeCounts` prop for showing college counts next to type checkboxes
8. Update `activeFilterCount` to include new filter params
9. Mobile: replace simple button with two floating FABs (Filters + Sort)
10. Mobile drawer: add sticky Apply button showing result count

New props interface:

```typescript
interface FilterSidebarProps {
  filters: CollegeFilters;
  totalCount: number;
  cityCounts?: { city: string; city_slug: string; count: number }[];
  typeCounts?: { type: string; count: number }[];
  onChange?: () => void;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/marketing && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/college-hub/FilterSidebar.tsx
git commit -m "feat(college-hub): enhance FilterSidebar with search, exam, city, rating, fee presets"
```

---

### Task 9: Update State Listing Page with Tiered Layout

**Files:**
- Modify: `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx`

- [ ] **Step 1: Rewrite the state listing page**

Replace the entire file with the new tiered layout:

```typescript
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box, Stack, Divider } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateStateListingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getColleges, getActiveStates, getCitiesForState, getTypeCountsForState } from '@/lib/college-hub/queries';
import { STATE_NAMES, FEATURED_COUNT, AD_INTERVAL_COMPACT, AD_AFTER_FEATURED } from '@/lib/college-hub/constants';
import type { CollegeFilters } from '@/lib/college-hub/types';
import FilterSidebar from '@/components/college-hub/FilterSidebar';
import FeaturedCollegeCard from '@/components/college-hub/FeaturedCollegeCard';
import CompactCollegeCard from '@/components/college-hub/CompactCollegeCard';
import SponsoredBanner from '@/components/college-hub/SponsoredBanner';
import CollegeSearch from '@/components/college-hub/CollegeSearch';
import ActiveFilterPills from '@/components/college-hub/ActiveFilterPills';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

// Dynamic: filters require searchParams
export const dynamic = 'force-dynamic';

type Props = {
  params: { locale: string; state: string };
  searchParams: Record<string, string | undefined>;
};

export async function generateMetadata({ params: { locale, state } }: Props): Promise<Metadata> {
  const stateName = STATE_NAMES[state] ?? state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const { count } = await getColleges({ state, limit: 1 });
  return generateStateListingMetadata(locale, state, stateName, count);
}

export default async function StateCollegesPage({ params: { locale, state }, searchParams }: Props) {
  setRequestLocale(locale);

  const stateName = STATE_NAMES[state] ?? state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const filters: CollegeFilters = {
    state,
    type: searchParams.type,
    exam: searchParams.exam as CollegeFilters['exam'],
    city: searchParams.city,
    coa: searchParams.coa === 'true' ? true : undefined,
    naacGrade: searchParams.naac,
    minFee: searchParams.minFee ? Number(searchParams.minFee) : undefined,
    maxFee: searchParams.maxFee ? Number(searchParams.maxFee) : undefined,
    search: searchParams.q,
    sortBy: (searchParams.sort as CollegeFilters['sortBy']) ?? 'arch_index',
    page: searchParams.page ? Number(searchParams.page) : 1,
    limit: 50,
  };

  const [{ data: colleges, count: totalCount }, cityCounts, typeCounts] = await Promise.all([
    getColleges(filters),
    getCitiesForState(state),
    getTypeCountsForState(state),
  ]);

  if (colleges.length === 0 && !searchParams.q && !searchParams.type) notFound();

  const featured = colleges.slice(0, FEATURED_COUNT);
  const compact = colleges.slice(FEATURED_COUNT);

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `B.Arch in ${stateName}`, path: `/colleges/${state}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: stateName },
        ]} />

        {/* Page Header */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.4rem', sm: '1.8rem' }, fontWeight: 800 }}>
            Best B.Arch Colleges in {stateName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            <strong style={{ color: '#1565C0' }}>{totalCount}</strong> colleges, compare fees, NATA cutoffs, NAAC grades, and placements
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Filter Sidebar */}
          <Grid item xs={12} md={3.5}>
            <FilterSidebar
              filters={filters}
              totalCount={totalCount}
              cityCounts={cityCounts}
              typeCounts={typeCounts}
            />
          </Grid>

          {/* Content */}
          <Grid item xs={12} md={8.5}>
            {/* Search bar (desktop) */}
            <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 2 }}>
              <CollegeSearch defaultValue={filters.search} />
            </Box>

            <ActiveFilterPills stateName={stateName} />

            {/* Results count */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Showing <strong>{colleges.length}</strong> of {totalCount} colleges
            </Typography>

            {/* Featured cards */}
            {featured.map((college, i) => (
              <Box key={college.id}>
                <FeaturedCollegeCard college={college} rank={i + 1} />
                {i + 1 === AD_AFTER_FEATURED && <SponsoredBanner variant="featured" />}
              </Box>
            ))}

            {/* Divider */}
            {compact.length > 0 && (
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ my: 3 }}>
                <Divider sx={{ flex: 1 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  More Colleges
                </Typography>
                <Divider sx={{ flex: 1 }} />
              </Stack>
            )}

            {/* Compact cards */}
            {compact.map((college, i) => (
              <Box key={college.id}>
                <CompactCollegeCard college={college} rank={FEATURED_COUNT + i + 1} />
                {(i + 1) % AD_INTERVAL_COMPACT === 0 && i + 1 < compact.length && (
                  <SponsoredBanner variant="compact" />
                )}
              </Box>
            ))}

            {/* Empty state */}
            {colleges.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography variant="h6" color="text.secondary">No colleges match your filters</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Try adjusting your filters or clearing them to see all colleges.
                </Typography>
              </Box>
            )}
          </Grid>
        </Grid>
      </Container>
    </>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

Run: `cd apps/marketing && npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 3: Start dev server and visually verify**

Run: `pnpm dev:marketing`

Navigate to `http://localhost:3010/colleges/tamil-nadu` and verify:
- Filter sidebar appears on the left (desktop)
- Search bar appears above results
- Top 5 colleges render as FeaturedCollegeCards with campus photos
- Ad banner appears after card #2
- "More Colleges" divider appears
- Remaining colleges render as CompactCollegeCards
- Filters update URL params and re-fetch data
- Resize to 375px: sidebar hides, floating filter button appears

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/app/\\[locale\\]/colleges/\\[state\\]/page.tsx
git commit -m "feat(college-hub): tiered listing layout with featured cards, compact rows, filters, and ad banners"
```

---

### Task 10: Final Verification and Cleanup

- [ ] **Step 1: Run full type check**

Run: `cd apps/marketing && npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 2: Run lint**

Run: `cd apps/marketing && npx next lint`
Expected: No errors (warnings are acceptable).

- [ ] **Step 3: Visual QA at mobile viewport**

Open browser DevTools, set viewport to 375x812 (iPhone SE).
Navigate to `http://localhost:3010/colleges/tamil-nadu`.

Verify:
- No horizontal overflow
- Featured cards stack vertically with 150px photos
- Compact cards show rank + name + fee + chevron
- Floating filter button visible at bottom
- Tapping filter button opens drawer
- All touch targets are 44px+
- Search bar appears below header
- Ad banners render full-width

- [ ] **Step 4: Test filter interactions**

On desktop, test each filter:
- Toggle COA checkbox: URL updates with `?coa=true`, results filter
- Select exam chip (NATA): URL updates with `?exam=NATA`
- Select college type: URL updates with `?type=Government`
- Select NAAC grade chip: URL updates with `?naac=A+`
- Click fee preset chip (Under 1L): URL updates with `?minFee=0&maxFee=100000`
- Select a city: URL updates with `?city=chennai`
- Type in search: URL updates with `?q=measi` after 300ms debounce
- Change sort to "Highest Placement"
- Verify active filter pills appear and can be removed

- [ ] **Step 5: Commit any cleanup**

```bash
git add -A
git commit -m "fix(college-hub): cleanup and polish for college listing redesign"
```

---

## Summary

| Task | What it does | Est. complexity |
|------|-------------|-----------------|
| 1 | Types + constants | Small |
| 2 | Query layer (filters, sorts, city counts) | Medium |
| 3 | CollegeSearch component | Small |
| 4 | ActiveFilterPills component | Small |
| 5 | FeaturedCollegeCard component | Medium |
| 6 | CompactCollegeCard component | Medium |
| 7 | SponsoredBanner component | Small |
| 8 | Enhanced FilterSidebar | Large |
| 9 | State listing page rewrite | Large |
| 10 | Verification and QA | Medium |
