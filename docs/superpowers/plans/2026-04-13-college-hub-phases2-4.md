# College Hub Phases 2-4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the College Hub with engagement features (reviews, Q&A, compare, save), admin management panel, monetization hooks (tier gating, lead capture), and SEO scale pages (rankings, fee ranges, NATA/JEE hubs).

**Architecture:** Phase 2 adds engagement tables to Supabase and client-facing components with API routes. Phase 3 adds feature gating logic in the existing `CollegePageTemplate` and a simple lead capture flow. Phase 4 adds new static ISR route pages for programmatic SEO. Admin pages live in the existing `apps/admin/(dashboard)` route group.

**Tech Stack:** Next.js 14 App Router, Supabase (MCP tools for migrations), MUI v5, Firebase Auth (for review/comment auth gate), React 18, TypeScript.

**Spec reference:** `apps/marketing/Docs/NERAM_COLLEGE_HUB_SPEC.md`
**Progress tracker:** `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`

---

## Phase 2 — Engagement Features

---

### Task 1: DB Migration — Reviews, Comments, Leads Tables

**Files:**
- Create: `supabase/migrations/20260413_college_hub_phase2.sql`

#### What to build
Three tables:
- `college_reviews` — structured ratings + text review, moderated queue
- `college_comments` — threaded Q&A (lighter than reviews)
- `college_leads` — "I'm Interested" lead submissions (used in Phase 3)

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260413_college_hub_phase2.sql`:

```sql
-- ============================================================
-- College Hub Phase 2: Reviews, Comments, Leads
-- ============================================================

-- ─── college_reviews ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_reviews (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id    UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  reviewer_phone TEXT,
  reviewer_year  TEXT,                  -- "1st Year", "2nd Year", "Alumni 2023", etc.
  firebase_uid   TEXT,                  -- Firebase UID if logged in (nullable for now)

  -- Ratings (1-5, null = not rated)
  rating_overall         SMALLINT CHECK (rating_overall BETWEEN 1 AND 5),
  rating_studio          SMALLINT CHECK (rating_studio BETWEEN 1 AND 5),
  rating_faculty         SMALLINT CHECK (rating_faculty BETWEEN 1 AND 5),
  rating_campus          SMALLINT CHECK (rating_campus BETWEEN 1 AND 5),
  rating_placements      SMALLINT CHECK (rating_placements BETWEEN 1 AND 5),
  rating_value           SMALLINT CHECK (rating_value BETWEEN 1 AND 5),
  rating_infrastructure  SMALLINT CHECK (rating_infrastructure BETWEEN 1 AND 5),

  -- Content
  title       TEXT,
  body        TEXT NOT NULL CHECK (char_length(body) >= 30),
  pros        TEXT,
  cons        TEXT,

  -- Moderation
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  rejected_reason TEXT,
  moderated_by    TEXT,
  moderated_at    TIMESTAMPTZ,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── college_comments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_comments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id   UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  parent_id    UUID REFERENCES college_comments(id) ON DELETE CASCADE,  -- null = top-level, set = reply
  author_name  TEXT NOT NULL,
  author_phone TEXT,
  firebase_uid TEXT,
  body         TEXT NOT NULL CHECK (char_length(body) >= 5),
  is_ambassador BOOLEAN DEFAULT false,

  -- Moderation
  status      TEXT NOT NULL DEFAULT 'approved'  -- comments auto-approved; reviews go through queue
              CHECK (status IN ('approved', 'removed')),
  removed_reason TEXT,

  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── college_leads ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_leads (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id      UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  nata_score      DECIMAL(5,2),
  jee_score       DECIMAL(5,2),
  city            TEXT,
  message         TEXT,
  consent_given   BOOLEAN NOT NULL DEFAULT false,
  source          TEXT DEFAULT 'interested_button',  -- 'interested_button', 'comparison', etc.
  firebase_uid    TEXT,

  -- Lead window snapshot
  lead_window_active BOOLEAN DEFAULT false,

  -- CRM
  status     TEXT NOT NULL DEFAULT 'new'
             CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'dropped')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_college_reviews_college_id ON college_reviews(college_id);
CREATE INDEX IF NOT EXISTS idx_college_reviews_status     ON college_reviews(status);
CREATE INDEX IF NOT EXISTS idx_college_comments_college_id ON college_comments(college_id);
CREATE INDEX IF NOT EXISTS idx_college_comments_parent_id  ON college_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_college_leads_college_id   ON college_leads(college_id);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE college_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_leads    ENABLE ROW LEVEL SECURITY;

-- Public can read approved reviews and comments
CREATE POLICY "Public read approved reviews"
  ON college_reviews FOR SELECT USING (status = 'approved');

CREATE POLICY "Public read approved comments"
  ON college_comments FOR SELECT USING (status = 'approved');

-- No public write (API routes use service role)
-- No public read for leads (service role only)
```

- [ ] **Step 2: Apply migration to staging via MCP**

Use `mcp__supabase-staging__apply_migration` with:
- name: `college_hub_phase2`
- query: (full SQL above)

Expected: success with no errors.

- [ ] **Step 3: Apply migration to production via MCP**

Use `mcp__supabase-prod__apply_migration` with the same SQL.

- [ ] **Step 4: Regenerate Supabase TypeScript types**

Use `mcp__supabase-prod__generate_typescript_types` and write the output to `packages/database/src/types/supabase.ts`.

- [ ] **Step 5: Add types to college-hub types.ts**

Add to `apps/marketing/src/lib/college-hub/types.ts`:

```typescript
export interface CollegeReview {
  id: string;
  college_id: string;
  reviewer_name: string;
  reviewer_phone?: string | null;
  reviewer_year?: string | null;
  firebase_uid?: string | null;
  rating_overall?: number | null;
  rating_studio?: number | null;
  rating_faculty?: number | null;
  rating_campus?: number | null;
  rating_placements?: number | null;
  rating_value?: number | null;
  rating_infrastructure?: number | null;
  title?: string | null;
  body: string;
  pros?: string | null;
  cons?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'flagged';
  rejected_reason?: string | null;
  created_at: string;
}

export interface CollegeComment {
  id: string;
  college_id: string;
  parent_id?: string | null;
  author_name: string;
  author_phone?: string | null;
  firebase_uid?: string | null;
  body: string;
  is_ambassador: boolean;
  status: 'approved' | 'removed';
  created_at: string;
  // Client-side only: nested replies
  replies?: CollegeComment[];
}

export interface CollegeLead {
  id: string;
  college_id: string;
  name: string;
  phone: string;
  email?: string | null;
  nata_score?: number | null;
  city?: string | null;
  message?: string | null;
  consent_given: boolean;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'dropped';
  created_at: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260413_college_hub_phase2.sql apps/marketing/src/lib/college-hub/types.ts packages/database/src/types/supabase.ts
git commit -m "feat(college-hub): Phase 2 DB migration — reviews, comments, leads tables"
```

---

### Task 2: URL-based FilterSidebar + Pagination

Make the listing page fully interactive via URL params (enables deep linking, browser back/forward).

**Files:**
- Modify: `apps/marketing/src/components/college-hub/FilterSidebar.tsx`
- Modify: `apps/marketing/src/app/[locale]/colleges/page.tsx`

- [ ] **Step 1: Rewrite FilterSidebar to use router.push for URL navigation**

Replace the entire `apps/marketing/src/components/college-hub/FilterSidebar.tsx` with:

```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import {
  Box, Typography, Paper, FormGroup, FormControlLabel, Checkbox,
  Slider, Select, MenuItem, FormControl, InputLabel, Button,
  Drawer, IconButton, Divider, Stack, Chip,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import { useState, useCallback } from 'react';
import type { CollegeFilters } from '@/lib/college-hub/types';

const COLLEGE_TYPES = [
  { value: 'Government', label: 'Government' },
  { value: 'Private', label: 'Private' },
  { value: 'Deemed', label: 'Deemed University' },
  { value: 'Autonomous', label: 'Autonomous' },
];

const COUNSELING_SYSTEMS = [
  { value: 'TNEA', label: 'TNEA (Tamil Nadu)' },
  { value: 'JoSAA', label: 'JoSAA (Central)' },
  { value: 'NATA', label: 'NATA Direct' },
];

const NAAC_GRADES = ['A++', 'A+', 'A', 'B++', 'B+', 'B'];

const SORT_OPTIONS = [
  { value: 'arch_index', label: 'ArchIndex Score' },
  { value: 'nirf_rank', label: 'NIRF Rank' },
  { value: 'fee_low', label: 'Fee: Low to High' },
  { value: 'fee_high', label: 'Fee: High to Low' },
  { value: 'name', label: 'Name (A-Z)' },
];

interface FilterSidebarProps {
  filters: CollegeFilters;
  totalCount: number;
}

function SidebarContent({ filters, totalCount, onClose }: FilterSidebarProps & { onClose?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateFilter = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // Reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const clearAll = () => {
    router.push(pathname);
  };

  const activeFilterCount = [
    filters.state, filters.type, filters.counselingSystem,
    filters.naacGrade, filters.coa, filters.minFee, filters.maxFee,
  ].filter(Boolean).length;

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <FilterListIcon sx={{ fontSize: 18 }} />
          <Typography variant="subtitle1" fontWeight={700}>Filters</Typography>
          {activeFilterCount > 0 && (
            <Chip label={activeFilterCount} size="small" color="primary" />
          )}
        </Stack>
        <Stack direction="row" gap={1}>
          {activeFilterCount > 0 && (
            <Button size="small" onClick={clearAll} sx={{ fontSize: '0.75rem' }}>
              Clear all
            </Button>
          )}
          {onClose && (
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Sort */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Sort By
        </Typography>
        <FormControl size="small" fullWidth>
          <Select
            value={filters.sortBy ?? 'arch_index'}
            onChange={(e) => updateFilter('sort', e.target.value)}
          >
            {SORT_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* College Type */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          College Type
        </Typography>
        <FormGroup>
          {COLLEGE_TYPES.map((t) => (
            <FormControlLabel
              key={t.value}
              control={
                <Checkbox
                  size="small"
                  checked={filters.type === t.value}
                  onChange={(e) => updateFilter('type', e.target.checked ? t.value : undefined)}
                />
              }
              label={<Typography variant="body2">{t.label}</Typography>}
            />
          ))}
        </FormGroup>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Counseling System */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Counseling System
        </Typography>
        <FormGroup>
          {COUNSELING_SYSTEMS.map((t) => (
            <FormControlLabel
              key={t.value}
              control={
                <Checkbox
                  size="small"
                  checked={filters.counselingSystem === t.value}
                  onChange={(e) => updateFilter('counseling', e.target.checked ? t.value : undefined)}
                />
              }
              label={<Typography variant="body2">{t.label}</Typography>}
            />
          ))}
        </FormGroup>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* NAAC Grade */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          NAAC Grade
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          {NAAC_GRADES.map((g) => (
            <Chip
              key={g}
              label={g}
              size="small"
              clickable
              variant={filters.naacGrade === g ? 'filled' : 'outlined'}
              color={filters.naacGrade === g ? 'primary' : 'default'}
              onClick={() => updateFilter('naac', filters.naacGrade === g ? undefined : g)}
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* COA Approved */}
      <Box sx={{ mb: 2.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={filters.coa === true}
              onChange={(e) => updateFilter('coa', e.target.checked ? 'true' : undefined)}
            />
          }
          label={<Typography variant="body2">COA Approved only</Typography>}
        />
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Annual Fee Range */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Annual Fee
        </Typography>
        <Stack direction="row" gap={1}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Min</InputLabel>
            <Select
              label="Min"
              value={filters.minFee?.toString() ?? ''}
              onChange={(e) => updateFilter('minFee', e.target.value || undefined)}
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="50000">₹50K</MenuItem>
              <MenuItem value="100000">₹1L</MenuItem>
              <MenuItem value="200000">₹2L</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Max</InputLabel>
            <Select
              label="Max"
              value={filters.maxFee?.toString() ?? ''}
              onChange={(e) => updateFilter('maxFee', e.target.value || undefined)}
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="100000">₹1L</MenuItem>
              <MenuItem value="200000">₹2L</MenuItem>
              <MenuItem value="500000">₹5L</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {/* Result count */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {totalCount.toLocaleString()} colleges match
      </Typography>
    </Box>
  );
}

export default function FilterSidebar({ filters, totalCount }: FilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile: floating filter button */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setMobileOpen(true)}
          size="small"
        >
          Filters &amp; Sort
        </Button>
      </Box>

      {/* Mobile drawer */}
      <Drawer
        anchor="bottom"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{ sx: { maxHeight: '85vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
      >
        <Box sx={{ overflow: 'auto' }}>
          <SidebarContent filters={filters} totalCount={totalCount} onClose={() => setMobileOpen(false)} />
        </Box>
      </Drawer>

      {/* Desktop sticky sidebar */}
      <Paper
        variant="outlined"
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'sticky',
          top: 80,
          maxHeight: 'calc(100vh - 100px)',
          overflow: 'auto',
        }}
      >
        <SidebarContent filters={filters} totalCount={totalCount} />
      </Paper>
    </>
  );
}
```

- [ ] **Step 2: Update the Pagination in `/colleges/page.tsx` to push to URL**

In `apps/marketing/src/app/[locale]/colleges/page.tsx`, the `<Pagination>` component needs an `onChange` handler. Update the pagination block (around line 109-118):

```tsx
{totalPages > 1 && (
  <Stack alignItems="center" sx={{ mt: 4 }}>
    <ClientPagination totalPages={totalPages} currentPage={filters.page ?? 1} />
  </Stack>
)}
```

And add a new client component. Create `apps/marketing/src/components/college-hub/ClientPagination.tsx`:

```tsx
'use client';

import { Pagination } from '@mui/material';
import { useRouter, usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';

export default function ClientPagination({ totalPages, currentPage }: { totalPages: number; currentPage: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (_: React.ChangeEvent<unknown>, page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete('page');
    } else {
      params.set('page', page.toString());
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Pagination
      count={totalPages}
      page={currentPage}
      color="primary"
      shape="rounded"
      onChange={handleChange}
    />
  );
}
```

- [ ] **Step 3: Update the page.tsx import to use ClientPagination**

In `apps/marketing/src/app/[locale]/colleges/page.tsx`, add the import:
```tsx
import ClientPagination from '@/components/college-hub/ClientPagination';
```
And replace the `<Pagination ... />` component with `<ClientPagination totalPages={totalPages} currentPage={filters.page ?? 1} />`.

- [ ] **Step 4: Verify build passes**

```bash
pnpm --filter @neram/marketing build 2>&1 | tail -5
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/components/college-hub/FilterSidebar.tsx apps/marketing/src/components/college-hub/ClientPagination.tsx apps/marketing/src/app/[locale]/colleges/page.tsx
git commit -m "feat(college-hub): URL-based filters and pagination"
```

---

### Task 3: Reviews API + ReviewSection Component

**Files:**
- Create: `apps/marketing/src/app/api/colleges/reviews/route.ts`
- Create: `apps/marketing/src/components/college-hub/ReviewSection.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`

- [ ] **Step 1: Create reviews API route**

Create `apps/marketing/src/app/api/colleges/reviews/route.ts`:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

// GET /api/colleges/reviews?college_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const college_id = searchParams.get('college_id');
  if (!college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_reviews')
    .select('id,reviewer_name,reviewer_year,rating_overall,rating_studio,rating_faculty,rating_campus,rating_placements,rating_value,rating_infrastructure,title,body,pros,cons,created_at')
    .eq('college_id', college_id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/colleges/reviews
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      college_id, reviewer_name, reviewer_year, firebase_uid,
      rating_overall, rating_studio, rating_faculty, rating_campus,
      rating_placements, rating_value, rating_infrastructure,
      title, review_body, pros, cons,
    } = body;

    if (!college_id || !reviewer_name || !review_body || !rating_overall) {
      return NextResponse.json({ error: 'Required: college_id, reviewer_name, review_body, rating_overall' }, { status: 400 });
    }
    if (review_body.length < 30) {
      return NextResponse.json({ error: 'Review must be at least 30 characters' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('college_reviews')
      .insert({
        college_id,
        reviewer_name,
        reviewer_year: reviewer_year ?? null,
        firebase_uid: firebase_uid ?? null,
        rating_overall,
        rating_studio: rating_studio ?? null,
        rating_faculty: rating_faculty ?? null,
        rating_campus: rating_campus ?? null,
        rating_placements: rating_placements ?? null,
        rating_value: rating_value ?? null,
        rating_infrastructure: rating_infrastructure ?? null,
        title: title ?? null,
        body: review_body,
        pros: pros ?? null,
        cons: cons ?? null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create ReviewSection component**

Create `apps/marketing/src/components/college-hub/ReviewSection.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Box, Typography, Stack, Rating, Button, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions, Chip, Avatar, Divider,
  CircularProgress, Alert, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import RateReviewIcon from '@mui/icons-material/RateReview';
import type { CollegeReview } from '@/lib/college-hub/types';

const YEAR_OPTIONS = [
  '1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year',
  'Alumni 2020', 'Alumni 2021', 'Alumni 2022', 'Alumni 2023', 'Alumni 2024', 'Alumni 2025',
];

const RATING_LABELS = [
  { key: 'rating_studio',         label: 'Design Studio' },
  { key: 'rating_faculty',        label: 'Faculty' },
  { key: 'rating_campus',         label: 'Campus & Hostel' },
  { key: 'rating_placements',     label: 'Placements' },
  { key: 'rating_value',          label: 'Value for Money' },
  { key: 'rating_infrastructure', label: 'Infrastructure' },
];

interface ReviewSectionProps {
  collegeId: string;
  collegeName: string;
}

function StarDisplay({ value }: { value: number | null | undefined }) {
  if (!value) return null;
  return (
    <Stack direction="row" alignItems="center" gap={0.5}>
      <StarIcon sx={{ fontSize: 14, color: '#f59e0b' }} />
      <Typography variant="caption" fontWeight={700}>{value.toFixed(1)}</Typography>
    </Stack>
  );
}

function ReviewCard({ review }: { review: CollegeReview }) {
  return (
    <Box sx={{ py: 2 }}>
      <Stack direction="row" alignItems="flex-start" gap={2}>
        <Avatar sx={{ bgcolor: '#2563eb', width: 40, height: 40, fontSize: '1rem' }}>
          {review.reviewer_name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle2" fontWeight={700}>{review.reviewer_name}</Typography>
            {review.reviewer_year && (
              <Chip label={review.reviewer_year} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
            )}
            {review.rating_overall && (
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Rating value={review.rating_overall} readOnly size="small" max={5} />
                <Typography variant="caption" color="text.secondary">
                  {new Date(review.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </Typography>
              </Stack>
            )}
          </Stack>

          {review.title && (
            <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>{review.title}</Typography>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
            {review.body}
          </Typography>

          {(review.pros || review.cons) && (
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mt: 1 }}>
              {review.pros && (
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="success.main" fontWeight={700}>Pros</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>{review.pros}</Typography>
                </Box>
              )}
              {review.cons && (
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="error.main" fontWeight={700}>Cons</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>{review.cons}</Typography>
                </Box>
              )}
            </Stack>
          )}

          {/* Category ratings */}
          <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mt: 1.5 }}>
            {RATING_LABELS.map(({ key, label }) => {
              const val = review[key as keyof CollegeReview] as number | null | undefined;
              if (!val) return null;
              return (
                <Box key={key}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <StarDisplay value={val} />
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

export default function ReviewSection({ collegeId, collegeName }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<CollegeReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Form state
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerYear, setReviewerYear] = useState('');
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [subRatings, setSubRatings] = useState<Record<string, number | null>>({});
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');

  useEffect(() => {
    fetch(`/api/colleges/reviews?college_id=${collegeId}`)
      .then((r) => r.json())
      .then((json) => setReviews(json.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [collegeId]);

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + (r.rating_overall ?? 0), 0) / reviews.length).toFixed(1)
    : null;

  const handleSubmit = async () => {
    if (!reviewerName || !overallRating || reviewBody.length < 30) {
      setSubmitError('Please fill in your name, overall rating, and a review (min 30 chars).');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/colleges/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          reviewer_name: reviewerName,
          reviewer_year: reviewerYear || null,
          rating_overall: overallRating,
          ...Object.fromEntries(
            Object.entries(subRatings).filter(([, v]) => v !== null)
          ),
          title: reviewTitle || null,
          review_body: reviewBody,
          pros: pros || null,
          cons: cons || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubmitSuccess(true);
      setDialogOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Student Reviews</Typography>
          {avgRating && (
            <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
              <Typography variant="h4" fontWeight={800} color="primary">{avgRating}</Typography>
              <Rating value={parseFloat(avgRating)} readOnly precision={0.1} />
              <Typography variant="body2" color="text.secondary">({reviews.length} reviews)</Typography>
            </Stack>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<RateReviewIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ borderRadius: 2 }}
        >
          Write a Review
        </Button>
      </Stack>

      {submitSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Thank you! Your review has been submitted and will appear after moderation (usually within 24-48 hours).
        </Alert>
      )}

      {loading && <CircularProgress size={24} />}

      {!loading && reviews.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary" variant="body2">
            No reviews yet. Be the first to share your experience at {collegeName}.
          </Typography>
        </Box>
      )}

      {reviews.map((review, i) => (
        <Box key={review.id}>
          {i > 0 && <Divider />}
          <ReviewCard review={review} />
        </Box>
      ))}

      {/* Submit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Write a Review for {collegeName}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack gap={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Your Name *"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              fullWidth size="small"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Year / Batch</InputLabel>
              <Select value={reviewerYear} label="Year / Batch" onChange={(e) => setReviewerYear(e.target.value)}>
                <MenuItem value="">Prefer not to say</MenuItem>
                {YEAR_OPTIONS.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
              </Select>
            </FormControl>

            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Overall Rating *</Typography>
              <Rating
                value={overallRating}
                onChange={(_, v) => setOverallRating(v)}
                size="large"
              />
            </Box>

            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Category Ratings (optional)</Typography>
              <Stack gap={1}>
                {RATING_LABELS.map(({ key, label }) => (
                  <Stack key={key} direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                    <Rating
                      size="small"
                      value={subRatings[key] ?? null}
                      onChange={(_, v) => setSubRatings((prev) => ({ ...prev, [key]: v }))}
                    />
                  </Stack>
                ))}
              </Stack>
            </Box>

            <TextField
              label="Review Title"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              fullWidth size="small" inputProps={{ maxLength: 100 }}
            />
            <TextField
              label="Your Review *"
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              fullWidth multiline rows={4}
              helperText={`${reviewBody.length}/2000 (min 30 chars)`}
              inputProps={{ maxLength: 2000 }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Pros (optional)"
                value={pros}
                onChange={(e) => setPros(e.target.value)}
                fullWidth multiline rows={2}
                placeholder="What did you like?"
              />
              <TextField
                label="Cons (optional)"
                value={cons}
                onChange={(e) => setCons(e.target.value)}
                fullWidth multiline rows={2}
                placeholder="What could be better?"
              />
            </Stack>
            {submitError && <Alert severity="error">{submitError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <CircularProgress size={16} /> : 'Submit Review'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

- [ ] **Step 3: Add ReviewSection to CollegePageTemplate**

In `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`:
1. Add import: `import ReviewSection from './ReviewSection';`
2. Find the "Reviews" section in the template (look for `id="reviews"` or a placeholder) and replace its content with `<ReviewSection collegeId={college.id} collegeName={college.name} />`

If there's no reviews section yet, add it after the placements section:
```tsx
{/* Reviews section */}
<Box id="reviews" sx={{ mb: 4 }}>
  <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Student Reviews</Typography>
  <ReviewSection collegeId={college.id} collegeName={college.name} />
</Box>
```

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/app/api/colleges/reviews/route.ts apps/marketing/src/components/college-hub/ReviewSection.tsx apps/marketing/src/components/college-hub/CollegePageTemplate.tsx
git commit -m "feat(college-hub): reviews API and ReviewSection component"
```

---

### Task 4: Comments / Q&A API + CommentSection Component

**Files:**
- Create: `apps/marketing/src/app/api/colleges/comments/route.ts`
- Create: `apps/marketing/src/components/college-hub/CommentSection.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`

- [ ] **Step 1: Create comments API route**

Create `apps/marketing/src/app/api/colleges/comments/route.ts`:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

// GET /api/colleges/comments?college_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const college_id = searchParams.get('college_id');
  if (!college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_comments')
    .select('id,parent_id,author_name,body,is_ambassador,created_at')
    .eq('college_id', college_id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nest replies under their parent
  const topLevel = (data ?? []).filter((c) => !c.parent_id);
  const replies = (data ?? []).filter((c) => c.parent_id);
  const nested = topLevel.map((c) => ({
    ...c,
    replies: replies.filter((r) => r.parent_id === c.id),
  }));

  return NextResponse.json({ data: nested });
}

// POST /api/colleges/comments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { college_id, parent_id, author_name, comment_body, firebase_uid } = body;

    if (!college_id || !author_name || !comment_body) {
      return NextResponse.json({ error: 'Required: college_id, author_name, comment_body' }, { status: 400 });
    }
    if (comment_body.length < 5) {
      return NextResponse.json({ error: 'Comment must be at least 5 characters' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('college_comments')
      .insert({
        college_id,
        parent_id: parent_id ?? null,
        author_name,
        body: comment_body,
        firebase_uid: firebase_uid ?? null,
        status: 'approved',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create CommentSection component**

Create `apps/marketing/src/components/college-hub/CommentSection.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Box, Typography, Stack, Avatar, Button, TextField,
  Alert, CircularProgress, Chip, Divider,
} from '@mui/material';
import ReplyIcon from '@mui/icons-material/Reply';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import type { CollegeComment } from '@/lib/college-hub/types';

interface CommentItemProps {
  comment: CollegeComment & { replies?: CollegeComment[] };
  onReply: (parentId: string, parentAuthor: string) => void;
}

function CommentItem({ comment, onReply }: CommentItemProps) {
  return (
    <Box>
      <Stack direction="row" gap={1.5} alignItems="flex-start">
        <Avatar
          sx={{
            width: 36, height: 36, fontSize: '0.875rem',
            bgcolor: comment.is_ambassador ? '#7c3aed' : '#64748b',
          }}
        >
          {comment.author_name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
              {comment.author_name}
            </Typography>
            {comment.is_ambassador && (
              <Chip label="Ambassador" size="small" color="secondary" sx={{ height: 18, fontSize: '0.65rem' }} />
            )}
            <Typography variant="caption" color="text.secondary">
              {new Date(comment.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.6 }}>{comment.body}</Typography>
          <Button
            size="small"
            startIcon={<ReplyIcon sx={{ fontSize: 14 }} />}
            onClick={() => onReply(comment.id, comment.author_name)}
            sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary', p: 0, minWidth: 'auto' }}
          >
            Reply
          </Button>

          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <Box sx={{ ml: 3, mt: 1.5, borderLeft: '2px solid', borderColor: 'divider', pl: 2 }}>
              {comment.replies.map((reply) => (
                <Box key={reply.id} sx={{ mb: 1.5 }}>
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: reply.is_ambassador ? '#7c3aed' : '#94a3b8' }}>
                      {reply.author_name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Stack direction="row" alignItems="center" gap={0.75}>
                        <Typography variant="caption" fontWeight={700}>{reply.author_name}</Typography>
                        {reply.is_ambassador && (
                          <Chip label="Ambassador" size="small" color="secondary" sx={{ height: 16, fontSize: '0.6rem' }} />
                        )}
                      </Stack>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.6 }}>{reply.body}</Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

interface CommentSectionProps {
  collegeId: string;
  collegeName: string;
}

export default function CommentSection({ collegeId, collegeName }: CommentSectionProps) {
  const [comments, setComments] = useState<(CollegeComment & { replies?: CollegeComment[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadComments = () => {
    setLoading(true);
    fetch(`/api/colleges/comments?college_id=${collegeId}`)
      .then((r) => r.json())
      .then((json) => setComments(json.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadComments(); }, [collegeId]);

  const handleSubmit = async () => {
    if (!authorName || commentBody.length < 5) {
      setSubmitError('Please fill in your name and a comment (min 5 chars).');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/colleges/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          parent_id: replyTo?.id ?? null,
          author_name: authorName,
          comment_body: commentBody,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubmitSuccess(true);
      setCommentBody('');
      setReplyTo(null);
      loadComments();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <QuestionAnswerIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={700}>Questions &amp; Answers</Typography>
        <Typography variant="body2" color="text.secondary">({comments.length})</Typography>
      </Stack>

      {/* Post form */}
      <Box sx={{ mb: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        {replyTo && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              Replying to {replyTo.author}
            </Typography>
            <Button size="small" onClick={() => setReplyTo(null)} sx={{ fontSize: '0.7rem' }}>Cancel reply</Button>
          </Stack>
        )}
        <Stack gap={1.5}>
          <TextField
            label="Your name *"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            size="small" fullWidth
          />
          <TextField
            label={replyTo ? `Reply to ${replyTo.author}...` : `Ask a question about ${collegeName}...`}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            multiline rows={3} size="small" fullWidth
          />
          {submitError && <Alert severity="error" sx={{ py: 0.5 }}>{submitError}</Alert>}
          {submitSuccess && <Alert severity="success" sx={{ py: 0.5 }}>Your question has been posted!</Alert>}
          <Button variant="contained" size="small" onClick={handleSubmit} disabled={submitting} sx={{ alignSelf: 'flex-end' }}>
            {submitting ? <CircularProgress size={14} /> : 'Post'}
          </Button>
        </Stack>
      </Box>

      {loading && <CircularProgress size={24} />}

      {!loading && comments.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No questions yet. Ask the first question about {collegeName}.
        </Typography>
      )}

      <Stack gap={0}>
        {comments.map((comment, i) => (
          <Box key={comment.id}>
            {i > 0 && <Divider sx={{ my: 1.5 }} />}
            <CommentItem
              comment={comment}
              onReply={(id, author) => setReplyTo({ id, author })}
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 3: Add CommentSection to CollegePageTemplate**

In `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`:
1. Add import: `import CommentSection from './CommentSection';`
2. Add after the ReviewSection:
```tsx
{/* Q&A section */}
<Box id="qa" sx={{ mb: 4 }}>
  <CommentSection collegeId={college.id} collegeName={college.name} />
</Box>
```

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/app/api/colleges/comments/ apps/marketing/src/components/college-hub/CommentSection.tsx apps/marketing/src/components/college-hub/CollegePageTemplate.tsx
git commit -m "feat(college-hub): comments/Q&A API and CommentSection component"
```

---

### Task 5: Save College Button

**Files:**
- Create: `apps/marketing/src/components/college-hub/SaveCollegeButton.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/saved/page.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegeListingCard.tsx`

- [ ] **Step 1: Create SaveCollegeButton component**

Create `apps/marketing/src/components/college-hub/SaveCollegeButton.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';

const STORAGE_KEY = 'neram_saved_colleges';

export function getSavedColleges(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function toggleSavedCollege(slug: string): boolean {
  const saved = getSavedColleges();
  const isSaved = saved.includes(slug);
  if (isSaved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.filter((s) => s !== slug)));
    return false;
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...saved, slug]));
    return true;
  }
}

interface SaveCollegeButtonProps {
  slug: string;
  collegeName: string;
  size?: 'small' | 'medium';
}

export default function SaveCollegeButton({ slug, collegeName, size = 'medium' }: SaveCollegeButtonProps) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(getSavedColleges().includes(slug));
  }, [slug]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const isNowSaved = toggleSavedCollege(slug);
    setSaved(isNowSaved);
  };

  return (
    <Tooltip title={saved ? `Remove ${collegeName} from saved` : `Save ${collegeName}`}>
      <IconButton
        size={size}
        onClick={handleToggle}
        aria-label={saved ? 'Remove from saved' : 'Save college'}
        sx={{
          color: saved ? '#ef4444' : 'text.secondary',
          '&:hover': { color: '#ef4444' },
        }}
      >
        {saved ? <FavoriteIcon fontSize={size} /> : <FavoriteBorderIcon fontSize={size} />}
      </IconButton>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Add SaveCollegeButton to CollegeListingCard**

In `apps/marketing/src/components/college-hub/CollegeListingCard.tsx`:
1. Import: `import SaveCollegeButton from './SaveCollegeButton';`
2. Add the button to the card's action area (near the bottom-right). Find the footer Stack in the card and add:
```tsx
<SaveCollegeButton slug={college.slug} collegeName={college.name} size="small" />
```

Also add it to the `HeroSection.tsx` in the college detail page header.

- [ ] **Step 3: Create saved colleges page**

Create `apps/marketing/src/app/[locale]/colleges/saved/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Container, Typography, Box, Grid, Button } from '@mui/material';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import Link from 'next/link';
import { getSavedColleges } from '@/components/college-hub/SaveCollegeButton';

export default function SavedCollegesPage() {
  const [savedSlugs, setSavedSlugs] = useState<string[]>([]);

  useEffect(() => {
    setSavedSlugs(getSavedColleges());
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <BookmarkIcon color="primary" />
        <Typography variant="h4" fontWeight={800}>Saved Colleges</Typography>
      </Box>
      {savedSlugs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography color="text.secondary">No saved colleges yet.</Typography>
          <Button component={Link} href="/colleges" variant="contained" sx={{ mt: 2 }}>
            Browse Colleges
          </Button>
        </Box>
      ) : (
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          You have {savedSlugs.length} saved college{savedSlugs.length !== 1 ? 's' : ''}. Visit each page to view details.
        </Typography>
      )}
      <Grid container spacing={2}>
        {savedSlugs.map((slug) => (
          <Grid item xs={12} sm={6} md={4} key={slug}>
            <Box
              component={Link}
              href={`/colleges/tamil-nadu/${slug}`}
              sx={{
                display: 'block', p: 2, border: '1px solid', borderColor: 'divider',
                borderRadius: 2, textDecoration: 'none', color: 'inherit',
                '&:hover': { borderColor: 'primary.main', bgcolor: '#f0f9ff' },
              }}
            >
              <Typography variant="subtitle2" fontWeight={700}>{slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</Typography>
              <Typography variant="caption" color="text.secondary">Click to view details</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/components/college-hub/SaveCollegeButton.tsx apps/marketing/src/app/[locale]/colleges/saved/ apps/marketing/src/components/college-hub/CollegeListingCard.tsx
git commit -m "feat(college-hub): Save College button with localStorage persistence"
```

---

### Task 6: College Comparison Tool

**Files:**
- Create: `apps/marketing/src/components/college-hub/CompareButton.tsx`
- Create: `apps/marketing/src/components/college-hub/ComparisonTray.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/compare/page.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegeListingCard.tsx`

- [ ] **Step 1: Create CompareButton + comparison state helpers**

Create `apps/marketing/src/components/college-hub/CompareButton.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Button, Tooltip } from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

const STORAGE_KEY = 'neram_compare_colleges';
const MAX_COMPARE = 3;

export function getCompareList(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function addToCompare(slug: string): boolean {
  const list = getCompareList();
  if (list.includes(slug) || list.length >= MAX_COMPARE) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...list, slug]));
  return true;
}

export function removeFromCompare(slug: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getCompareList().filter((s) => s !== slug)));
}

interface CompareButtonProps {
  slug: string;
  collegeName: string;
}

export default function CompareButton({ slug, collegeName }: CompareButtonProps) {
  const [inList, setInList] = useState(false);
  const [listFull, setListFull] = useState(false);

  const refresh = () => {
    const list = getCompareList();
    setInList(list.includes(slug));
    setListFull(list.length >= MAX_COMPARE && !list.includes(slug));
  };

  useEffect(() => { refresh(); }, [slug]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inList) {
      removeFromCompare(slug);
    } else {
      addToCompare(slug);
    }
    refresh();
    // Dispatch custom event so ComparisonTray re-renders
    window.dispatchEvent(new Event('compare-updated'));
  };

  if (listFull && !inList) return null;

  return (
    <Tooltip title={inList ? `Remove ${collegeName} from compare` : `Add ${collegeName} to compare (max 3)`}>
      <Button
        size="small"
        variant={inList ? 'contained' : 'outlined'}
        startIcon={<CompareArrowsIcon sx={{ fontSize: 14 }} />}
        onClick={handleClick}
        sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
      >
        {inList ? 'Added' : 'Compare'}
      </Button>
    </Tooltip>
  );
}
```

- [ ] **Step 2: Create ComparisonTray (floating tray at bottom of screen)**

Create `apps/marketing/src/components/college-hub/ComparisonTray.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Box, Button, Typography, Stack, Chip, Paper } from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import CloseIcon from '@mui/icons-material/Close';
import { getCompareList, removeFromCompare } from './CompareButton';
import { useRouter } from 'next/navigation';

export default function ComparisonTray() {
  const [list, setList] = useState<string[]>([]);
  const router = useRouter();

  const refresh = () => setList(getCompareList());

  useEffect(() => {
    refresh();
    window.addEventListener('compare-updated', refresh);
    return () => window.removeEventListener('compare-updated', refresh);
  }, []);

  if (list.length === 0) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 1200,
        p: 2,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        bgcolor: '#1e293b', color: 'white',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
          <CompareArrowsIcon sx={{ color: '#60a5fa' }} />
          <Typography variant="body2" fontWeight={600}>
            Comparing {list.length}/3
          </Typography>
          <Stack direction="row" gap={1} flexWrap="wrap">
            {list.map((slug) => (
              <Chip
                key={slug}
                label={slug.replace(/-architecture$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                size="small"
                onDelete={() => { removeFromCompare(slug); refresh(); window.dispatchEvent(new Event('compare-updated')); }}
                deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                sx={{ bgcolor: '#334155', color: 'white', '& .MuiChip-deleteIcon': { color: '#94a3b8' } }}
              />
            ))}
          </Stack>
        </Stack>
        <Button
          variant="contained"
          size="small"
          disabled={list.length < 2}
          onClick={() => router.push(`/colleges/compare?slugs=${list.join(',')}`)}
          sx={{ bgcolor: '#2563eb', whiteSpace: 'nowrap' }}
        >
          Compare Now
        </Button>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 3: Create compare page**

Create `apps/marketing/src/app/[locale]/colleges/compare/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Container, Typography, Box, Grid, Paper, Chip, Stack, CircularProgress, Button } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { CollegeDetail } from '@/lib/college-hub/types';

// Comparison row definition
const COMPARE_ROWS = [
  { label: 'Type', key: 'type' },
  { label: 'Established', key: 'established_year' },
  { label: 'COA Approved', key: 'coa_approved', format: (v: unknown) => v ? 'Yes' : 'No' },
  { label: 'NAAC Grade', key: 'naac_grade' },
  { label: 'NIRF Rank (Arch)', key: 'nirf_rank_architecture', format: (v: unknown) => v ? `#${v}` : 'Not ranked' },
  { label: 'ArchIndex', key: 'arch_index_score', format: (v: unknown) => v ? `${v}/100` : 'N/A' },
  { label: 'Annual Fee (Approx)', key: 'annual_fee_approx', format: (v: unknown) => v ? `₹${Number(v).toLocaleString('en-IN')}` : 'N/A' },
  { label: 'Total B.Arch Seats', key: 'total_barch_seats' },
  { label: 'Accepted Exams', key: 'accepted_exams', format: (v: unknown) => Array.isArray(v) ? v.join(', ') : (v as string) ?? 'N/A' },
  { label: 'Counseling', key: 'counseling_systems', format: (v: unknown) => Array.isArray(v) ? v.join(', ') : (v as string) ?? 'N/A' },
  { label: 'City', key: 'city' },
  { label: 'State', key: 'state' },
];

export default function ComparePage() {
  const searchParams = useSearchParams();
  const slugsParam = searchParams.get('slugs') ?? '';
  const slugs = slugsParam.split(',').filter(Boolean).slice(0, 3);

  const [colleges, setColleges] = useState<(CollegeDetail | null)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slugs.length === 0) { setLoading(false); return; }
    Promise.all(
      slugs.map((slug) =>
        fetch(`/api/colleges/detail?slug=${slug}`)
          .then((r) => r.json())
          .then((j) => j.data ?? null)
          .catch(() => null)
      )
    ).then(setColleges).finally(() => setLoading(false));
  }, [slugsParam]);

  if (loading) return <Container sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Container>;

  if (slugs.length < 2) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>Select colleges to compare</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Browse the college listing and click "Compare" on 2-3 colleges.</Typography>
        <Button variant="contained" component={Link} href="/colleges">Browse Colleges</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Typography variant="h4" fontWeight={800} gutterBottom>Compare Colleges</Typography>

      {/* College headers */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={3}>
          <Box sx={{ height: 80 }} /> {/* spacer for row labels */}
        </Grid>
        {colleges.map((college, i) => (
          <Grid item xs={12} sm={12 / colleges.length} key={i}>
            {college ? (
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2, position: 'relative' }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '0.9rem' }}>
                  {college.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">{college.city}, {college.state}</Typography>
                <Box sx={{ mt: 1 }}>
                  <Button size="small" component={Link} href={`/colleges/${college.state_slug}/${college.slug}`} sx={{ fontSize: '0.7rem' }}>
                    View Profile
                  </Button>
                </Box>
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2, bgcolor: '#f8fafc' }}>
                <Typography color="text.secondary" variant="caption">Not found</Typography>
              </Paper>
            )}
          </Grid>
        ))}
      </Grid>

      {/* Comparison rows */}
      {COMPARE_ROWS.map(({ label, key, format }) => (
        <Grid container spacing={2} key={key} sx={{ mb: 1 }}>
          <Grid item xs={12} sm={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 1 }}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>
            </Box>
          </Grid>
          {colleges.map((college, i) => {
            const raw = college ? (college as Record<string, unknown>)[key] : null;
            const display = raw != null ? (format ? format(raw) : String(raw)) : 'N/A';
            return (
              <Grid item xs={12} sm={12 / colleges.length} key={i}>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1, bgcolor: '#fafafa', minHeight: 48, display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2">{display}</Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ))}

      <Box sx={{ mt: 3, textAlign: 'center' }}>
        <Button variant="outlined" component={Link} href="/colleges">
          Back to Colleges
        </Button>
      </Box>
    </Container>
  );
}
```

- [ ] **Step 4: Create college detail API for compare page**

Create `apps/marketing/src/app/api/colleges/detail/route.ts`:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCollegeBySlug } from '@/lib/college-hub/queries';

// GET /api/colleges/detail?slug=xxx
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  try {
    const data = await getCollegeBySlug(slug);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch college' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Add ComparisonTray to marketing layout**

In `apps/marketing/src/app/[locale]/layout.tsx` (or the root layout that wraps all pages), add:
```tsx
import ComparisonTray from '@/components/college-hub/ComparisonTray';
// Inside the body, before </body>:
<ComparisonTray />
```

- [ ] **Step 6: Add CompareButton to CollegeListingCard**

In `apps/marketing/src/components/college-hub/CollegeListingCard.tsx`:
1. Import: `import CompareButton from './CompareButton';`
2. Add `<CompareButton slug={college.slug} collegeName={college.name} />` near the footer.

- [ ] **Step 7: Commit**

```bash
git add apps/marketing/src/components/college-hub/CompareButton.tsx apps/marketing/src/components/college-hub/ComparisonTray.tsx apps/marketing/src/app/[locale]/colleges/compare/ apps/marketing/src/app/api/colleges/detail/ apps/marketing/src/components/college-hub/CollegeListingCard.tsx
git commit -m "feat(college-hub): college comparison tool with floating tray"
```

---

### Task 7: NATA Hub + JEE B.Arch Hub Pages

**Files:**
- Create: `apps/marketing/src/app/[locale]/nata-hub/page.tsx`
- Create: `apps/marketing/src/app/[locale]/jee-barch-hub/page.tsx`
- Modify: `apps/marketing/src/app/sitemap.ts` (add hub pages)

- [ ] **Step 1: Create NATA Hub page**

Create `apps/marketing/src/app/[locale]/nata-hub/page.tsx`:

```tsx
import { Metadata } from 'next';
import { Container, Typography, Box, Grid, Paper, Stack, Chip, Button } from '@mui/material';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getTNEAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'NATA 2026 — B.Arch Colleges Accepting NATA Score | Neram',
    description: 'Complete list of B.Arch colleges in India accepting NATA scores. Compare fees, cutoffs, placements. All COA-approved architecture colleges with NATA admission.',
    keywords: ['NATA colleges', 'B.Arch NATA', 'NATA score colleges', 'architecture colleges NATA'],
  };
}

const FAQ_ITEMS = [
  {
    q: 'Which colleges accept NATA score for B.Arch admission?',
    a: 'Most private and state-aided B.Arch colleges across India accept NATA scores. Central government institutions (NITs, SPAs) use JEE Paper 2 via JoSAA. State colleges under TNEA (Tamil Nadu), KCET (Karnataka), etc., accept NATA as per their respective counseling norms.',
  },
  {
    q: 'What is the minimum NATA score for admission to top B.Arch colleges?',
    a: 'Top colleges typically require 120-140+ out of 200 in NATA. For COA approval, you need a minimum 50% in 10+2 PCM/PCB + qualifying NATA score. Management quota may have lower cutoffs.',
  },
  {
    q: 'Is NATA mandatory for all B.Arch colleges?',
    a: 'Yes — COA (Council of Architecture) mandates NATA or JEE Paper 2 score for all B.Arch admissions since 2019. No B.Arch college can admit students without a valid architecture entrance exam score.',
  },
];

export default async function NATAHubPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const colleges = await getTNEAColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      {/* Hero */}
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <Chip label="NATA 2026" color="primary" sx={{ mb: 1.5, fontWeight: 700 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' }, fontWeight: 900, mb: 1.5 }}>
          NATA B.Arch Colleges in India
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640, mx: 'auto', lineHeight: 1.7 }}>
          National Aptitude Test in Architecture (NATA) is conducted by the Council of Architecture. 
          Browse all B.Arch colleges accepting NATA score, compare fees, cutoffs, and placements.
        </Typography>
        <Stack direction="row" justifyContent="center" gap={2} sx={{ mt: 3, flexWrap: 'wrap' }}>
          <Button variant="contained" component={Link} href="/colleges" size="large">
            Browse All Colleges
          </Button>
          <Button variant="outlined" component={Link} href="/nata-2026" size="large">
            NATA 2026 Guide
          </Button>
        </Stack>
      </Box>

      {/* Key Stats */}
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {[
          { label: 'Colleges Accept NATA', value: '550+', desc: 'across India' },
          { label: 'COA Approved', value: '100%', desc: 'all listed colleges' },
          { label: 'NATA Score Range', value: '40-200', desc: 'exam out of 200' },
          { label: 'Exam Frequency', value: '2x/year', desc: 'Jan-Apr, Apr-Jun' },
        ].map((stat) => (
          <Grid item xs={6} sm={3} key={stat.label}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight={900} color="primary.main">{stat.value}</Typography>
              <Typography variant="body2" fontWeight={600}>{stat.label}</Typography>
              <Typography variant="caption" color="text.secondary">{stat.desc}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* How NATA Works */}
      <Box sx={{ mb: 5, p: { xs: 2.5, sm: 4 }, bgcolor: '#f0f9ff', borderRadius: 3, border: '1px solid #bae6fd' }}>
        <Typography variant="h5" fontWeight={800} gutterBottom>How NATA Admission Works</Typography>
        <Grid container spacing={3} sx={{ mt: 0.5 }}>
          {[
            { step: '1', title: 'Appear in NATA', body: 'Register on nata.in, appear in the online test. NATA 2026 is conducted twice. Best score is considered.' },
            { step: '2', title: 'Score Card', body: 'Download score card valid for current academic year. Minimum qualifying score is required for COA approval.' },
            { step: '3', title: 'Apply to Colleges', body: 'Apply directly to colleges (management quota) or through state counseling systems (TNEA, KCET, etc.).' },
            { step: '4', title: 'Counseling & Allotment', body: 'Get seat allotted based on NATA score + academics. Pay fees, submit documents, and confirm admission.' },
          ].map(({ step, title, body }) => (
            <Grid item xs={12} sm={6} key={step}>
              <Stack direction="row" gap={2}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                  {step}
                </Box>
                <Box>
                  <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
                  <Typography variant="body2" color="text.secondary">{body}</Typography>
                </Box>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* TNEA Colleges list */}
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
        Tamil Nadu B.Arch Colleges (TNEA + NATA)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {colleges.length} colleges listed in Tamil Nadu. Admission through TNEA counseling + NATA score.
      </Typography>
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {colleges.slice(0, 12).map((college) => (
          <Grid item xs={12} sm={6} md={4} key={college.id}>
            <CollegeListingCard college={college} />
          </Grid>
        ))}
      </Grid>
      {colleges.length > 12 && (
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Button variant="outlined" component={Link} href="/colleges/tamil-nadu">
            View All {colleges.length} Tamil Nadu Colleges
          </Button>
        </Box>
      )}

      {/* FAQ */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 2.5 }}>Frequently Asked Questions</Typography>
        <Stack gap={2}>
          {FAQ_ITEMS.map(({ q, a }) => (
            <Paper key={q} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>{q}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{a}</Typography>
            </Paper>
          ))}
        </Stack>
      </Box>
    </Container>
  );
}
```

- [ ] **Step 2: Create JEE B.Arch Hub page**

Create `apps/marketing/src/app/[locale]/jee-barch-hub/page.tsx`:

```tsx
import { Metadata } from 'next';
import { Container, Typography, Box, Grid, Paper, Stack, Chip, Button } from '@mui/material';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getJoSAAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'JEE Paper 2 B.Arch Colleges — NITs, SPAs, IITs | JoSAA 2026 | Neram',
    description: 'Complete list of NIT, SPA, IIT architecture colleges admitting through JEE Main Paper 2 via JoSAA counseling. Compare cutoffs, fees, and placements.',
    keywords: ['JEE Paper 2 B.Arch', 'JoSAA architecture', 'NIT architecture', 'SPA architecture', 'IIT B.Arch'],
  };
}

const FAQ_ITEMS = [
  {
    q: 'Which colleges accept JEE Main Paper 2 for B.Arch?',
    a: 'JEE Main Paper 2 is used for admission to NITs (National Institutes of Technology), SPAs (School of Planning and Architecture), IITs (with B.Arch programs), and other centrally funded institutions via JoSAA counseling.',
  },
  {
    q: 'What is the cutoff for NIT Trichy B.Arch?',
    a: 'NIT Trichy B.Arch general category cutoff typically ranges from rank 500-1500 depending on the year. Home state category (Tamil Nadu) cutoffs may be different. Check the JoSAA portal for round-wise cutoffs.',
  },
  {
    q: 'Is JEE Paper 2 harder than NATA?',
    a: 'JEE Paper 2 is more competitive due to limited NIT/SPA seats (~2000 total nationally). NATA has a broader pool of colleges. Strong math is critical for JEE Paper 2. Both are valid pathways to B.Arch.',
  },
];

export default async function JEEBArchHubPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const colleges = await getJoSAAColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      {/* Hero */}
      <Box sx={{ textAlign: 'center', mb: 5 }}>
        <Chip label="JoSAA 2026" color="secondary" sx={{ mb: 1.5, fontWeight: 700 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.5rem' }, fontWeight: 900, mb: 1.5 }}>
          JEE Paper 2 — NITs, SPAs, IITs for B.Arch
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640, mx: 'auto', lineHeight: 1.7 }}>
          JEE Main Paper 2B (Architecture) is the gateway to top government architecture colleges. 
          NIT Trichy, MNNIT Allahabad, SPA Delhi, and more — compare cutoffs, fees, and placements.
        </Typography>
        <Stack direction="row" justifyContent="center" gap={2} sx={{ mt: 3, flexWrap: 'wrap' }}>
          <Button variant="contained" component={Link} href="/colleges/josaa" size="large">
            All JoSAA Colleges
          </Button>
          <Button variant="outlined" component={Link} href="/jee-paper-2-preparation" size="large">
            JEE Paper 2 Guide
          </Button>
        </Stack>
      </Box>

      {/* Key Stats */}
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {[
          { label: 'JoSAA Architecture Colleges', value: `${colleges.length}+`, desc: 'NITs, SPAs, IITs' },
          { label: 'Total Seats', value: '~2,000', desc: 'across all JoSAA colleges' },
          { label: 'JEE Paper 2 Marks', value: '300', desc: 'Math 100 + Aptitude 200' },
          { label: 'JoSAA Rounds', value: '6', desc: 'June-July counseling' },
        ].map((stat) => (
          <Grid item xs={6} sm={3} key={stat.label}>
            <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h4" fontWeight={900} color="secondary.main">{stat.value}</Typography>
              <Typography variant="body2" fontWeight={600}>{stat.label}</Typography>
              <Typography variant="caption" color="text.secondary">{stat.desc}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* JoSAA college list */}
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>
        JoSAA B.Arch Colleges ({colleges.length} found)
      </Typography>
      <Grid container spacing={2} sx={{ mb: 5 }}>
        {colleges.map((college) => (
          <Grid item xs={12} sm={6} md={4} key={college.id}>
            <CollegeListingCard college={college} />
          </Grid>
        ))}
      </Grid>

      {colleges.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4, mb: 4 }}>
          <Typography color="text.secondary">JoSAA college data coming soon. Check back after data entry is complete.</Typography>
        </Box>
      )}

      {/* FAQ */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={800} sx={{ mb: 2.5 }}>Frequently Asked Questions</Typography>
        <Stack gap={2}>
          {FAQ_ITEMS.map(({ q, a }) => (
            <Paper key={q} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>{q}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{a}</Typography>
            </Paper>
          ))}
        </Stack>
      </Box>
    </Container>
  );
}
```

- [ ] **Step 3: Add hub pages to sitemap**

In `apps/marketing/src/app/sitemap.ts`, add these to `staticPages`:
```typescript
{ path: '/nata-hub', lastModified: '2026-04-13', i18n: true },
{ path: '/jee-barch-hub', lastModified: '2026-04-13', i18n: true },
```

- [ ] **Step 4: Commit**

```bash
git add apps/marketing/src/app/[locale]/nata-hub/ apps/marketing/src/app/[locale]/jee-barch-hub/ apps/marketing/src/app/sitemap.ts
git commit -m "feat(college-hub): NATA Hub and JEE B.Arch Hub pillar pages"
```

---

### Task 8: Admin Panel — College Hub Section

Add a new "College Hub" group to the admin sidebar with 4 pages: overview, colleges list, review moderation, and tier management.

**Files:**
- Modify: `apps/admin/src/components/Sidebar.tsx`
- Create: `apps/admin/src/app/(dashboard)/college-hub/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/college-hub/colleges/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/college-hub/reviews/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/college-hub/tiers/page.tsx`
- Create: `apps/admin/src/app/api/college-hub/colleges/route.ts`
- Create: `apps/admin/src/app/api/college-hub/reviews/route.ts`

- [ ] **Step 1: Add College Hub group to Sidebar.tsx**

In `apps/admin/src/components/Sidebar.tsx`, add this group after the "Marketing" group (before "System"):

```typescript
import DomainIcon from '@mui/icons-material/Domain';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
```

Add to `menuGroups` array before the "System" entry:
```typescript
{
  label: 'College Hub',
  items: [
    { text: 'Overview', icon: DomainIcon, path: '/college-hub' },
    { text: 'Colleges', icon: LeaderboardIcon, path: '/college-hub/colleges' },
    { text: 'Review Queue', icon: StarHalfIcon, path: '/college-hub/reviews' },
    { text: 'Tier Management', icon: EmojiEventsIcon, path: '/college-hub/tiers' },
  ],
},
```

- [ ] **Step 2: Create admin API for colleges list**

Create `apps/admin/src/app/api/college-hub/colleges/route.ts`:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('colleges')
    .select('id,slug,name,short_name,city,state,type,neram_tier,coa_approved,naac_grade,nirf_rank_architecture,arch_index_score,verified,data_completeness,claimed')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('colleges').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create admin API for reviews moderation**

Create `apps/admin/src/app/api/college-hub/reviews/route.ts`:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  const status = new URL(request.url).searchParams.get('status') ?? 'pending';
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_reviews')
    .select('*, colleges(name, slug)')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const { id, status, rejected_reason } = await request.json();
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('college_reviews')
    .update({ status, rejected_reason: rejected_reason ?? null, moderated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create College Hub overview page**

Create `apps/admin/src/app/(dashboard)/college-hub/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Grid, Paper, Stack, CircularProgress } from '@mui/material';
import DomainIcon from '@mui/icons-material/Domain';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';

export default function CollegeHubOverviewPage() {
  const [stats, setStats] = useState({ total: 0, pending_reviews: 0, verified: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/college-hub/colleges').then((r) => r.json()),
      fetch('/api/college-hub/reviews?status=pending').then((r) => r.json()),
    ]).then(([colleges, reviews]) => {
      const all = colleges.data ?? [];
      setStats({
        total: all.length,
        pending_reviews: (reviews.data ?? []).length,
        verified: all.filter((c: { verified: boolean }) => c.verified).length,
      });
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const STAT_CARDS = [
    { label: 'Total Colleges', value: stats.total, icon: <DomainIcon sx={{ color: '#2563eb' }} />, color: '#eff6ff' },
    { label: 'Reviews Pending', value: stats.pending_reviews, icon: <StarHalfIcon sx={{ color: '#d97706' }} />, color: '#fffbeb' },
    { label: 'Verified Profiles', value: stats.verified, icon: <LeaderboardIcon sx={{ color: '#16a34a' }} />, color: '#f0fdf4' },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box sx={{ width: 42, height: 42, bgcolor: '#2563eb', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DomainIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>College Hub</Typography>
      </Stack>

      {loading ? <CircularProgress /> : (
        <Grid container spacing={2}>
          {STAT_CARDS.map(({ label, value, icon, color }) => (
            <Grid item xs={12} sm={4} key={label}>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: color }}>
                <Stack direction="row" alignItems="center" gap={1.5}>
                  {icon}
                  <Box>
                    <Typography variant="h4" fontWeight={800}>{value}</Typography>
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Create colleges admin list page**

Create `apps/admin/src/app/(dashboard)/college-hub/colleges/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, TextField, Chip, CircularProgress,
  Select, MenuItem, FormControl, InputLabel, Button, Dialog,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';

const TIER_OPTIONS = ['free', 'silver', 'gold', 'platinum'];

const TIER_COLORS: Record<string, string> = {
  free: '#64748b',
  silver: '#64748b',
  gold: '#d97706',
  platinum: '#7c3aed',
};

export default function AdminCollegesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/college-hub/colleges')
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) =>
    !search || (r.name as string).toLowerCase().includes(search.toLowerCase())
  );

  const saveTier = async () => {
    if (!editRow) return;
    setSaving(true);
    await fetch('/api/college-hub/colleges', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editRow.id, neram_tier: editRow.neram_tier }),
    });
    setSaving(false);
    setEditRow(null);
    load();
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'College', flex: 2, minWidth: 200 },
    { field: 'city', headerName: 'City', width: 120 },
    { field: 'type', headerName: 'Type', width: 120 },
    {
      field: 'neram_tier', headerName: 'Tier', width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Chip label={params.value ?? 'free'} size="small"
          sx={{ bgcolor: TIER_COLORS[params.value as string] ?? '#64748b', color: 'white', fontWeight: 600, fontSize: '0.7rem' }}
        />
      ),
    },
    { field: 'arch_index_score', headerName: 'ArchIndex', width: 100, type: 'number' },
    { field: 'nirf_rank_architecture', headerName: 'NIRF', width: 80, type: 'number' },
    {
      field: 'verified', headerName: 'Verified', width: 90,
      renderCell: (params: GridRenderCellParams) => (
        <Chip label={params.value ? 'Yes' : 'No'} size="small" color={params.value ? 'success' : 'default'} />
      ),
    },
    { field: 'data_completeness', headerName: 'Data %', width: 80, type: 'number' },
    {
      field: 'actions', headerName: '', width: 80,
      renderCell: (params: GridRenderCellParams) => (
        <Button size="small" onClick={() => setEditRow(params.row as Record<string, unknown>)}>Edit Tier</Button>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box sx={{ width: 42, height: 42, bgcolor: '#2563eb', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LeaderboardIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>Colleges ({rows.length})</Typography>
      </Stack>

      <TextField
        placeholder="Search colleges..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small" sx={{ mb: 2, width: 300 }}
      />

      <Paper variant="outlined" sx={{ height: 600 }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={loading}
          pageSizeOptions={[25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          density="compact"
        />
      </Paper>

      {/* Edit Tier Dialog */}
      <Dialog open={!!editRow} onClose={() => setEditRow(null)}>
        <DialogTitle>Edit Tier: {editRow?.name as string}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Neram Tier</InputLabel>
            <Select
              label="Neram Tier"
              value={(editRow?.neram_tier as string) ?? 'free'}
              onChange={(e) => setEditRow((prev) => prev ? { ...prev, neram_tier: e.target.value } : null)}
            >
              {TIER_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveTier} disabled={saving}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

- [ ] **Step 6: Create review moderation page**

Create `apps/admin/src/app/(dashboard)/college-hub/reviews/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Chip, Button, CircularProgress,
  Rating, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

type ReviewStatus = 'pending' | 'approved' | 'rejected';

interface ReviewRow {
  id: string;
  reviewer_name: string;
  reviewer_year: string;
  rating_overall: number;
  title: string;
  body: string;
  pros: string;
  cons: string;
  created_at: string;
  colleges: { name: string; slug: string };
}

export default function ReviewModerationPage() {
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/college-hub/reviews?status=${status}`)
      .then((r) => r.json())
      .then((j) => setReviews(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const moderate = async (id: string, newStatus: ReviewStatus, reason?: string) => {
    await fetch('/api/college-hub/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus, rejected_reason: reason }),
    });
    setActionMsg(`Review ${newStatus}.`);
    setRejectDialogId(null);
    setRejectReason('');
    load();
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box sx={{ width: 42, height: 42, bgcolor: '#d97706', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StarHalfIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>Review Moderation</Typography>
      </Stack>

      <ToggleButtonGroup value={status} exclusive onChange={(_, v) => v && setStatus(v)} size="small" sx={{ mb: 3 }}>
        <ToggleButton value="pending">Pending</ToggleButton>
        <ToggleButton value="approved">Approved</ToggleButton>
        <ToggleButton value="rejected">Rejected</ToggleButton>
      </ToggleButtonGroup>

      {actionMsg && <Alert severity="success" onClose={() => setActionMsg('')} sx={{ mb: 2 }}>{actionMsg}</Alert>}

      {loading && <CircularProgress />}

      {!loading && reviews.length === 0 && (
        <Typography color="text.secondary">No {status} reviews.</Typography>
      )}

      <Stack gap={2}>
        {reviews.map((review) => (
          <Paper key={review.id} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="flex-start" gap={1}>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={700}>{review.reviewer_name}</Typography>
                  {review.reviewer_year && <Chip label={review.reviewer_year} size="small" />}
                  <Chip label={review.colleges?.name ?? 'Unknown'} size="small" color="primary" variant="outlined" />
                  <Typography variant="caption" color="text.secondary">
                    {new Date(review.created_at).toLocaleDateString('en-IN')}
                  </Typography>
                </Stack>
                {review.rating_overall && <Rating value={review.rating_overall} readOnly size="small" />}
                {review.title && <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>{review.title}</Typography>}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>{review.body}</Typography>
                {review.pros && <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>Pros: {review.pros}</Typography>}
                {review.cons && <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>Cons: {review.cons}</Typography>}
              </Box>
              {status === 'pending' && (
                <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
                  <Button
                    size="small" variant="contained" color="success"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => moderate(review.id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small" variant="outlined" color="error"
                    startIcon={<CancelIcon />}
                    onClick={() => setRejectDialogId(review.id)}
                  >
                    Reject
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialogId} onClose={() => setRejectDialogId(null)}>
        <DialogTitle>Reject Review</DialogTitle>
        <DialogContent>
          <TextField
            label="Reason for rejection"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            multiline rows={3} fullWidth size="small" sx={{ mt: 1 }}
            placeholder="Spam, inappropriate content, off-topic, etc."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => rejectDialogId && moderate(rejectDialogId, 'rejected', rejectReason)}>
            Reject Review
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

- [ ] **Step 7: Create tier management page**

Create `apps/admin/src/app/(dashboard)/college-hub/tiers/page.tsx`:

```tsx
'use client';

import { Box, Typography, Stack, Paper, Grid, Chip } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const TIER_FEATURES = [
  {
    tier: 'free',
    label: 'Basic (Free)',
    color: '#64748b',
    bg: '#f1f5f9',
    price: '₹0',
    features: ['College name, city, state listed', 'COA approval status', 'Basic fee info', 'Accepted exams'],
    limit: 'No lead notifications, no analytics',
  },
  {
    tier: 'silver',
    label: 'Silver',
    color: '#475569',
    bg: '#f8fafc',
    price: '₹15,000/yr',
    features: ['All Basic features', 'Gallery photos (up to 10)', 'Detailed fee breakdown', 'Faculty profiles', 'Infrastructure details'],
    limit: 'No leads, no cutoff data',
  },
  {
    tier: 'gold',
    label: 'Gold',
    color: '#d97706',
    bg: '#fffbeb',
    price: '₹40,000/yr',
    features: ['All Silver features', 'Placement stats', 'TNEA cutoffs (5-year)', 'Verified badge', 'Lead notifications (20/month)', 'Priority in listings'],
    limit: 'No AI agent, no ambassador tools',
  },
  {
    tier: 'platinum',
    label: 'Platinum',
    color: '#7c3aed',
    bg: '#faf5ff',
    price: '₹80,000/yr',
    features: ['All Gold features', 'Unlimited lead notifications', 'Analytics dashboard', 'Admin profile editor', 'AI chat widget (Aintra)', 'Ambassador program access', 'Virtual tour upload'],
    limit: 'Full access',
  },
];

export default function TierManagementPage() {
  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box sx={{ width: 42, height: 42, bgcolor: '#7c3aed', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmojiEventsIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>Tier Management</Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Assign tiers to colleges from the Colleges page. This page shows what each tier includes.
        Tier changes take effect immediately. Contact billing team to invoice the college.
      </Typography>

      <Grid container spacing={2}>
        {TIER_FEATURES.map(({ tier, label, color, bg, price, features, limit }) => (
          <Grid item xs={12} sm={6} key={tier}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: bg, borderColor: color + '40', height: '100%' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Chip label={label} sx={{ bgcolor: color, color: 'white', fontWeight: 700 }} />
                <Typography variant="h6" fontWeight={800} sx={{ color }}>{price}</Typography>
              </Stack>
              <Stack gap={0.75}>
                {features.map((f) => (
                  <Typography key={f} variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>✓</Box> {f}
                  </Typography>
                ))}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>{limit}</Typography>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/components/Sidebar.tsx apps/admin/src/app/(dashboard)/college-hub/ apps/admin/src/app/api/college-hub/
git commit -m "feat(admin): College Hub section — overview, colleges list, review queue, tier management"
```

---

## Phase 3 — Monetization Foundation

---

### Task 9: Premium Tier Feature Gating in CollegePageTemplate

Lock certain sections behind tier gates to incentivize colleges to upgrade.

**Files:**
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`
- Create: `apps/marketing/src/components/college-hub/TierGate.tsx`

- [ ] **Step 1: Create TierGate component**

Create `apps/marketing/src/components/college-hub/TierGate.tsx`:

```tsx
import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import Link from 'next/link';
import { TIER_CONFIG } from '@/lib/college-hub/constants';
import type { CollegeTier } from '@/lib/college-hub/types';

interface TierGateProps {
  requiredTier: CollegeTier;
  featureName: string;
  children: React.ReactNode;
  collegeTier: CollegeTier | null;
  isAdmin?: boolean;  // Admin bypass
}

const TIER_ORDER: Record<CollegeTier, number> = { free: 0, silver: 1, gold: 2, platinum: 3 };

export function hasTierAccess(collegeTier: CollegeTier | null | undefined, requiredTier: CollegeTier): boolean {
  const current = TIER_ORDER[collegeTier as CollegeTier] ?? 0;
  const required = TIER_ORDER[requiredTier] ?? 0;
  return current >= required;
}

export default function TierGate({ requiredTier, featureName, children, collegeTier, isAdmin = false }: TierGateProps) {
  if (isAdmin || hasTierAccess(collegeTier, requiredTier)) {
    return <>{children}</>;
  }

  const tierInfo = TIER_CONFIG[requiredTier];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3, textAlign: 'center', borderRadius: 2,
        bgcolor: '#f8fafc', borderStyle: 'dashed',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <Stack alignItems="center" gap={1.5}>
        <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LockIcon sx={{ color: '#94a3b8' }} />
        </Box>
        <Typography variant="subtitle1" fontWeight={700} color="text.secondary">
          {featureName} — {tierInfo.label} Feature
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This section is available for colleges on the {tierInfo.label} plan and above.
          Upgrade to unlock detailed {featureName.toLowerCase()} data.
        </Typography>
        <Button
          variant="outlined"
          size="small"
          component={Link}
          href="/college-dashboard"
          sx={{ color: tierInfo.color, borderColor: tierInfo.borderColor }}
        >
          Claim &amp; Upgrade Profile
        </Button>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 2: Wrap gated sections in CollegePageTemplate**

In `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`:

1. Import: `import TierGate from './TierGate';`
2. Wrap the following sections (find them by their id or component name):
   - Placements section: gate behind `gold`
   - Faculty section: gate behind `silver`
   - Infrastructure section: gate behind `silver`
   - Reviews + Q&A: always free (no gate)

Example wrapping for placements section:
```tsx
<TierGate requiredTier="gold" featureName="Placement Statistics" collegeTier={college.neram_tier as CollegeTier}>
  <PlacementStats placements={college.placements} />
</TierGate>
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/college-hub/TierGate.tsx apps/marketing/src/components/college-hub/CollegePageTemplate.tsx
git commit -m "feat(college-hub): tier feature gating for silver/gold sections"
```

---

### Task 10: Lead Capture — "I'm Interested" Button

**Files:**
- Create: `apps/marketing/src/app/api/colleges/leads/route.ts`
- Create: `apps/marketing/src/components/college-hub/LeadCaptureButton.tsx`
- Modify: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`

- [ ] **Step 1: Create leads API route**

Create `apps/marketing/src/app/api/colleges/leads/route.ts`:

```typescript
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { college_id, name, phone, email, nata_score, city, message, consent_given, firebase_uid } = body;

    if (!college_id || !name || !phone || !consent_given) {
      return NextResponse.json({ error: 'Required: college_id, name, phone, consent_given=true' }, { status: 400 });
    }
    if (!phone.match(/^[6-9]\d{9}$/)) {
      return NextResponse.json({ error: 'Valid 10-digit Indian mobile number required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('college_leads')
      .insert({
        college_id, name, phone,
        email: email ?? null,
        nata_score: nata_score ?? null,
        city: city ?? null,
        message: message ?? null,
        consent_given: true,
        firebase_uid: firebase_uid ?? null,
        lead_window_active: true,
        source: 'interested_button',
        status: 'new',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create LeadCaptureButton component**

Create `apps/marketing/src/components/college-hub/LeadCaptureButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Stack, Alert, CircularProgress, Typography, Checkbox,
  FormControlLabel, Box,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';

interface LeadCaptureButtonProps {
  collegeId: string;
  collegeName: string;
}

export default function LeadCaptureButton({ collegeId, collegeName }: LeadCaptureButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nataScore, setNataScore] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name || !phone || !consent) {
      setError('Please fill in your name, phone number, and agree to share details.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/colleges/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          name, phone,
          email: email || null,
          nata_score: nataScore ? parseFloat(nataScore) : null,
          city: city || null,
          consent_given: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Alert severity="success" icon={<SchoolIcon />}>
        Your interest has been registered. The college admissions team will contact you shortly.
      </Alert>
    );
  }

  return (
    <>
      <Button
        variant="contained"
        size="large"
        startIcon={<SchoolIcon />}
        onClick={() => setOpen(true)}
        sx={{
          bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' },
          borderRadius: 2, px: 3, fontWeight: 700,
        }}
        fullWidth
      >
        I'm Interested — Get Admission Info
      </Button>

      <Dialog open={open} onClose={() => !submitting && setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Apply to {collegeName}</Typography>
          <Typography variant="body2" color="text.secondary">Share your details and the college will contact you.</Typography>
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <TextField label="Your Name *" value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" />
            <TextField
              label="Mobile Number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              fullWidth size="small"
              inputProps={{ inputMode: 'numeric' }}
              helperText="10-digit Indian mobile number"
            />
            <TextField label="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth size="small" type="email" />
            <TextField
              label="NATA Score (optional)"
              value={nataScore}
              onChange={(e) => setNataScore(e.target.value)}
              fullWidth size="small"
              inputProps={{ inputMode: 'decimal' }}
              helperText="Out of 200"
            />
            <TextField label="Your City (optional)" value={city} onChange={(e) => setCity(e.target.value)} fullWidth size="small" />
            <FormControlLabel
              control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} size="small" />}
              label={
                <Typography variant="caption">
                  I agree to share my name, phone, and score with {collegeName} for admission inquiries.
                </Typography>
              }
            />
            {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting || !consent} sx={{ bgcolor: '#16a34a' }}>
            {submitting ? <CircularProgress size={16} /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Add LeadCaptureButton to CollegePageTemplate sidebar**

In `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`, find the desktop sidebar (Quick Facts / Contact section) and add:

```tsx
import LeadCaptureButton from './LeadCaptureButton';
// Inside the sidebar Paper, after Quick Facts:
<Box sx={{ mt: 2 }}>
  <LeadCaptureButton collegeId={college.id} collegeName={college.name} />
</Box>
```

Also add a mobile version inside the main content (below the HeroSection on mobile):
```tsx
<Box sx={{ display: { xs: 'block', lg: 'none' }, mb: 3 }}>
  <LeadCaptureButton collegeId={college.id} collegeName={college.name} />
</Box>
```

- [ ] **Step 4: Add admin page for leads**

Create `apps/admin/src/app/(dashboard)/college-hub/leads/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Stack, Paper, CircularProgress, Chip } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import PeopleIcon from '@mui/icons-material/People';

export default function CollegeLeadsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/college-hub/leads')
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    { field: 'college_name', headerName: 'College', flex: 1, minWidth: 180 },
    { field: 'city', headerName: 'City', width: 120 },
    { field: 'nata_score', headerName: 'NATA', width: 90, type: 'number' },
    { field: 'status', headerName: 'Status', width: 110,
      renderCell: (p) => <Chip label={p.value} size="small" color={p.value === 'new' ? 'warning' : 'default'} /> },
    { field: 'created_at', headerName: 'Date', width: 120,
      renderCell: (p) => new Date(p.value as string).toLocaleDateString('en-IN') },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box sx={{ width: 42, height: 42, bgcolor: '#16a34a', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PeopleIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>College Hub Leads</Typography>
      </Stack>
      <Paper variant="outlined" sx={{ height: 600 }}>
        <DataGrid rows={rows} columns={columns} loading={loading} density="compact"
          pageSizeOptions={[25, 50]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} />
      </Paper>
    </Box>
  );
}
```

Create `apps/admin/src/app/api/college-hub/leads/route.ts`:

```typescript
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET() {
  const supabase = createAdminClient();
  // Join with colleges to get name
  const { data, error } = await supabase
    .from('college_leads')
    .select('*, colleges(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    ...r,
    college_name: (r.colleges as { name: string } | null)?.name ?? 'Unknown',
  }));
  return NextResponse.json({ data: rows });
}
```

Update `apps/admin/src/components/Sidebar.tsx` to add the Leads item to the College Hub group:
```typescript
{ text: 'Leads', icon: PeopleIcon, path: '/college-hub/leads' },
```
(Import `PeopleIcon` from `@mui/icons-material/People` at top of Sidebar.tsx.)

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/app/api/colleges/leads/ apps/marketing/src/components/college-hub/LeadCaptureButton.tsx apps/marketing/src/components/college-hub/CollegePageTemplate.tsx apps/admin/src/app/(dashboard)/college-hub/leads/ apps/admin/src/app/api/college-hub/leads/
git commit -m "feat(college-hub): lead capture button and admin leads view"
```

---

## Phase 4 — SEO Scale

---

### Task 11: Rankings Pages (NIRF + ArchIndex)

**Files:**
- Create: `apps/marketing/src/app/[locale]/colleges/rankings/nirf/page.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/rankings/archindex/page.tsx`
- Modify: `apps/marketing/src/lib/college-hub/queries.ts` (add ranking queries)
- Modify: `apps/marketing/src/app/sitemap.ts`

- [ ] **Step 1: Add ranking queries**

Add to `apps/marketing/src/lib/college-hub/queries.ts`:

```typescript
// ISR: NIRF ranked colleges
export const getNIRFRankedColleges = cache(async (): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .not('nirf_rank_architecture', 'is', null)
    .order('nirf_rank_architecture', { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) return [];
  return (data ?? []) as CollegeListItem[];
});

// ISR: ArchIndex ranked colleges
export const getArchIndexRankedColleges = cache(async (): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .not('arch_index_score', 'is', null)
    .order('arch_index_score', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) return [];
  return (data ?? []) as CollegeListItem[];
});
```

- [ ] **Step 2: Create NIRF Rankings page**

Create `apps/marketing/src/app/[locale]/colleges/rankings/nirf/page.tsx`:

```tsx
import { Metadata } from 'next';
import { Container, Typography, Box, Table, TableHead, TableBody, TableRow, TableCell, Paper, Chip, Button } from '@mui/material';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getNIRFRankedColleges } from '@/lib/college-hub/queries';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'NIRF Ranked B.Arch Colleges 2026 — Architecture Rankings | Neram',
    description: 'NIRF 2025 Architecture ranking of B.Arch colleges in India. Compare NIRF ranked architecture colleges — fees, cutoffs, placements, and ArchIndex scores.',
  };
}

export default async function NIRFRankingsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const colleges = await getNIRFRankedColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Box sx={{ mb: 3 }}>
        <Chip label="NIRF 2025" color="primary" sx={{ mb: 1, fontWeight: 700 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 900, mb: 1 }}>
          NIRF Architecture Rankings 2026
        </Typography>
        <Typography color="text.secondary" variant="body2">
          National Institutional Ranking Framework (NIRF) rankings for B.Arch Architecture discipline.
          Sorted by NIRF rank. {colleges.length} ranked colleges found.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ overflow: 'auto', borderRadius: 2 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>NIRF Rank</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>College</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ArchIndex</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Annual Fee</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {colleges.map((college) => (
              <TableRow key={college.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    #{college.nirf_rank_architecture}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{college.name}</Typography>
                  {college.naac_grade && (
                    <Chip label={`NAAC ${college.naac_grade}`} size="small" sx={{ mt: 0.25, height: 18, fontSize: '0.65rem' }} />
                  )}
                </TableCell>
                <TableCell><Typography variant="body2">{college.city}, {college.state}</Typography></TableCell>
                <TableCell><Typography variant="caption" color="text.secondary">{college.type}</Typography></TableCell>
                <TableCell>
                  {college.arch_index_score ? (
                    <Chip label={`${college.arch_index_score}/100`} size="small" color="success" sx={{ fontWeight: 700 }} />
                  ) : '—'}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {college.annual_fee_approx ? `₹${(college.annual_fee_approx / 100000).toFixed(1)}L/yr` : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Button size="small" component={Link} href={`/colleges/${college.state_slug}/${college.slug}`} sx={{ fontSize: '0.7rem' }}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {colleges.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">NIRF ranking data will be updated after the annual NIRF rankings release.</Typography>
        </Box>
      )}
    </Container>
  );
}
```

- [ ] **Step 3: Create ArchIndex Rankings page**

Create `apps/marketing/src/app/[locale]/colleges/rankings/archindex/page.tsx`:

```tsx
import { Metadata } from 'next';
import { Container, Typography, Box, Table, TableHead, TableBody, TableRow, TableCell, Paper, Chip, Button, Tooltip } from '@mui/material';
import Link from 'next/link';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { setRequestLocale } from 'next-intl/server';
import { getArchIndexRankedColleges } from '@/lib/college-hub/queries';
import ArchIndexRing from '@/components/college-hub/ArchIndexRing';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Neram ArchIndex — Best B.Arch Colleges Ranking 2026 | Neram',
    description: 'Neram ArchIndex is a composite 0-100 score rating B.Arch colleges on studio quality, faculty strength, placements, infrastructure, and alumni outcomes.',
  };
}

export default async function ArchIndexRankingsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const colleges = await getArchIndexRankedColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Box sx={{ mb: 3 }}>
        <Chip label="Neram Exclusive" color="secondary" sx={{ mb: 1, fontWeight: 700 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 900, mb: 1 }}>
          ArchIndex Rankings — Best B.Arch Colleges
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ maxWidth: 600 }}>
          ArchIndex is Neram's proprietary 0-100 score for B.Arch colleges, combining studio quality (25%), 
          faculty (20%), placements (20%), infrastructure (15%), student satisfaction (10%), and alumni network (10%).
          It goes deeper than NIRF by measuring what matters to architecture students.
        </Typography>
      </Box>

      {/* Methodology note */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 3, p: 2, bgcolor: '#eff6ff', borderRadius: 2 }}>
        <InfoOutlinedIcon sx={{ color: '#2563eb', fontSize: 18, mt: 0.25, flexShrink: 0 }} />
        <Typography variant="caption" color="#1e40af">
          ArchIndex scores are calculated from verified placement data, student surveys, faculty credentials, 
          infrastructure audits, and alumni success outcomes. Colleges can provide verified data via their college dashboard 
          to improve their score accuracy.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ overflow: 'auto', borderRadius: 2 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Rank</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>College</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ArchIndex</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>NIRF</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Annual Fee</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {colleges.map((college, i) => (
              <TableRow key={college.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={700} color={i < 3 ? 'warning.main' : 'text.primary'}>
                    #{i + 1}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{college.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{college.type}</Typography>
                </TableCell>
                <TableCell><Typography variant="body2">{college.city}</Typography></TableCell>
                <TableCell>
                  <ArchIndexRing score={college.arch_index_score!} size={48} showLabel={false} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {college.nirf_rank_architecture ? `#${college.nirf_rank_architecture}` : '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {college.annual_fee_approx ? `₹${(college.annual_fee_approx / 100000).toFixed(1)}L/yr` : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Button size="small" component={Link} href={`/colleges/${college.state_slug}/${college.slug}`} sx={{ fontSize: '0.7rem' }}>
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {colleges.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">ArchIndex scores are being calculated. Data coming soon.</Typography>
        </Box>
      )}
    </Container>
  );
}
```

- [ ] **Step 4: Add rankings pages to sitemap**

In `apps/marketing/src/app/sitemap.ts`, add:
```typescript
{ path: '/colleges/rankings/nirf', lastModified: '2026-04-13', i18n: true },
{ path: '/colleges/rankings/archindex', lastModified: '2026-04-13', i18n: true },
```

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/app/[locale]/colleges/rankings/ apps/marketing/src/lib/college-hub/queries.ts apps/marketing/src/app/sitemap.ts
git commit -m "feat(college-hub): NIRF and ArchIndex rankings pages"
```

---

### Task 12: Fee-Based Programmatic SEO Pages

**Files:**
- Create: `apps/marketing/src/app/[locale]/colleges/fees/[range]/page.tsx`
- Modify: `apps/marketing/src/lib/college-hub/queries.ts` (fee range query)
- Modify: `apps/marketing/src/app/sitemap.ts`

- [ ] **Step 1: Add fee range query**

Add to `apps/marketing/src/lib/college-hub/queries.ts`:

```typescript
export const FEE_RANGES = {
  'below-1-lakh':   { label: 'Below ₹1 Lakh/year', min: 0,      max: 100000 },
  'below-2-lakhs':  { label: 'Below ₹2 Lakhs/year', min: 0,      max: 200000 },
  'below-3-lakhs':  { label: 'Below ₹3 Lakhs/year', min: 0,      max: 300000 },
  'below-5-lakhs':  { label: 'Below ₹5 Lakhs/year', min: 0,      max: 500000 },
  '5-to-10-lakhs':  { label: '₹5L - ₹10L/year',     min: 500000, max: 1000000 },
  'above-10-lakhs': { label: 'Above ₹10 Lakhs/year', min: 1000000, max: 99999999 },
} as const;

export type FeeRangeKey = keyof typeof FEE_RANGES;

export const getCollegesByFeeRange = cache(async (rangeKey: FeeRangeKey): Promise<CollegeListItem[]> => {
  const range = FEE_RANGES[rangeKey];
  if (!range) return [];
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .gte('annual_fee_approx', range.min)
    .lte('annual_fee_approx', range.max)
    .order('arch_index_score', { ascending: false, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as CollegeListItem[];
});
```

- [ ] **Step 2: Create fee range page**

Create `apps/marketing/src/app/[locale]/colleges/fees/[range]/page.tsx`:

```tsx
import { Metadata } from 'next';
import { Container, Typography, Box, Grid, Chip, Button } from '@mui/material';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getCollegesByFeeRange, FEE_RANGES, type FeeRangeKey } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import { notFound } from 'next/navigation';

export const revalidate = 86400;

export async function generateStaticParams() {
  return Object.keys(FEE_RANGES).map((range) => ({ range }));
}

export async function generateMetadata({ params }: { params: { range: string; locale: string } }): Promise<Metadata> {
  const rangeInfo = FEE_RANGES[params.range as FeeRangeKey];
  if (!rangeInfo) return {};
  return {
    title: `B.Arch Colleges ${rangeInfo.label} — India | Neram`,
    description: `List of COA-approved B.Arch colleges in India with annual fees ${rangeInfo.label.toLowerCase()}. Compare fees, placements, and cutoffs.`,
  };
}

export default async function CollegeFeeRangePage({ params }: { params: { range: string; locale: string } }) {
  setRequestLocale(params.locale);
  const rangeInfo = FEE_RANGES[params.range as FeeRangeKey];
  if (!rangeInfo) notFound();

  const colleges = await getCollegesByFeeRange(params.range as FeeRangeKey);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Box sx={{ mb: 3 }}>
        <Chip label="Fee Filter" color="primary" sx={{ mb: 1 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 900, mb: 1 }}>
          B.Arch Colleges {rangeInfo.label}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {colleges.length} COA-approved B.Arch colleges in India with annual fees {rangeInfo.label.toLowerCase()}.
          Sorted by Neram ArchIndex score.
        </Typography>
      </Box>

      {/* Fee range navigation */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {Object.entries(FEE_RANGES).map(([key, info]) => (
          <Button
            key={key}
            size="small"
            variant={key === params.range ? 'contained' : 'outlined'}
            component={Link}
            href={`/colleges/fees/${key}`}
            sx={{ fontSize: '0.75rem' }}
          >
            {info.label}
          </Button>
        ))}
      </Box>

      {colleges.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No colleges found in this fee range yet.</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid item xs={12} sm={6} md={4} key={college.id}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
```

- [ ] **Step 3: Add fee pages to sitemap**

In `apps/marketing/src/app/sitemap.ts`, add after the college hub entries:
```typescript
// Fee-based programmatic pages
const FEE_RANGE_SLUGS = ['below-1-lakh', 'below-2-lakhs', 'below-3-lakhs', 'below-5-lakhs', '5-to-10-lakhs', 'above-10-lakhs'];
for (const range of FEE_RANGE_SLUGS) {
  entries.push({
    url: `${baseUrl}/colleges/fees/${range}`,
    lastModified: new Date('2026-04-13'),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  });
}
```

- [ ] **Step 4: Final build check**

```bash
pnpm --filter @neram/marketing build 2>&1 | tail -10
pnpm --filter @neram/admin build 2>&1 | tail -5
```
Expected: both pass with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/app/[locale]/colleges/fees/ apps/marketing/src/lib/college-hub/queries.ts apps/marketing/src/app/sitemap.ts
git commit -m "feat(college-hub): fee-based programmatic SEO pages (6 fee ranges)"
```

---

### Task 13: Update Progress Tracker + Final Verification

**Files:**
- Modify: `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md`

- [ ] **Step 1: Update progress tracker**

Mark Phase 2 and Phase 3 deliverables as complete in `COLLEGE_HUB_PROGRESS.md`.

- [ ] **Step 2: Final build verification**

```bash
pnpm --filter @neram/marketing build 2>&1 | grep -E "Error|error" | grep -v "console\|Warning" | head -10
```
Expected: no errors.

- [ ] **Step 3: Final commit**

```bash
git add apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md
git commit -m "docs: update College Hub progress tracker — Phases 2+3+4 complete"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] FilterSidebar URL-based (Task 2) — spec §8
- [x] Pagination URL-based (Task 2) — spec §8
- [x] Review system (Task 3) — spec §12
- [x] Q&A / Comments (Task 4) — spec §13
- [x] Save College (Task 5) — spec §15 (Soft Interest)
- [x] Comparison tool (Task 6) — spec §9
- [x] NATA Hub (Task 7) — spec §21
- [x] JEE B.Arch Hub (Task 7) — spec §21
- [x] Admin College Hub (Task 8) — spec §18
- [x] Tier feature gating (Task 9) — spec §7
- [x] Lead capture (Task 10) — spec §15 (Hard Inquiry)
- [x] NIRF rankings page (Task 11) — spec §3 URLs
- [x] ArchIndex rankings page (Task 11) — spec §22 + §3 URLs
- [x] Fee-based programmatic pages (Task 12) — spec §3 URLs
- [ ] Virtual tour — DEFERRED (requires 360° photo content from colleges; Pannellum integration in Phase 4 refresh)
- [ ] College admin dashboard — DEFERRED (requires separate auth flow; Phase 3 follow-up)
- [ ] Ambassador program WhatsApp — DEFERRED (requires WhatsApp business flow setup; Phase 3 follow-up)
- [ ] National expansion (Karnataka, Maharashtra data) — DEFERRED (requires manual data entry)

**Placeholder scan:** No TBDs found.
**Type consistency:** `CollegeReview`, `CollegeComment`, `CollegeLead` types defined in Task 1 and used consistently across Tasks 3-4 and 10.
