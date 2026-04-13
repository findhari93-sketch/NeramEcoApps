# College Hub Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build College Hub Phase 1 — all ~55 Tamil Nadu B.Arch colleges live at `neramclasses.com/colleges/` with mobile-first design, full SEO/AEO, and public data.

**Architecture:** DB migrations first (extend existing `colleges` table + 6 new tables), then components, then pages, then SEO. Parallel execution: DB agent runs Tasks 1-2, Frontend agent runs Tasks 3-19 concurrently, SEO agent runs Tasks 20-22 after pages exist.

**Tech Stack:** Next.js 14 App Router, MUI v5, Supabase (via `@neram/database`), next-intl, Recharts (install in Task 1), Tailwind CSS

**Reference files (read before starting any task):**
- Spec: `apps/marketing/Docs/NERAM_COLLEGE_HUB_SPEC.md`
- Design doc: `docs/superpowers/specs/2026-04-12-college-hub-design.md`
- Progress tracker: `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md` — update checkboxes as tasks complete

---

## PARALLEL EXECUTION MAP

```
DB Agent      → Task 1-2  (migrations, must complete before pages wire to DB)
Frontend Agent → Task 3-19 (types → components → pages; can start Task 3-6 immediately)
SEO Agent     → Task 20-22 (after pages scaffold exists)
Integration   → Task 23-25 (i18n, tests, deploy — after all above)
```

---

## Task 1: Install Recharts

**Files:**
- Modify: `apps/marketing/package.json`

- [ ] **Step 1: Install recharts in the marketing app**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem
pnpm add recharts --filter @neram/marketing
```

Expected output: `+ recharts X.X.X` added to `apps/marketing/package.json`

- [ ] **Step 2: Verify install**

```bash
cd apps/marketing && grep recharts package.json
```

Expected: `"recharts": "^X.X.X"` in dependencies

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/package.json pnpm-lock.yaml
git commit -m "chore(marketing): add recharts for college hub cutoff charts"
```

---

## Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260412_college_hub_phase1.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260412_college_hub_phase1.sql`:

```sql
-- ================================================================
-- COLLEGE HUB PHASE 1: Database Migration
-- Extends existing colleges table (32 live records preserved)
-- Creates 6 new supporting tables
-- Safe: all ALTER TABLE use ADD COLUMN IF NOT EXISTS
-- ================================================================

-- ── 1. Extend colleges table ─────────────────────────────────────
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS state_slug TEXT,
  ADD COLUMN IF NOT EXISTS location_type TEXT,
  ADD COLUMN IF NOT EXISTS nearest_railway TEXT,
  ADD COLUMN IF NOT EXISTS nearest_airport TEXT,
  ADD COLUMN IF NOT EXISTS railway_distance_km DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS airport_distance_km DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS coa_validity_till DATE,
  ADD COLUMN IF NOT EXISTS naac_valid_till DATE,
  ADD COLUMN IF NOT EXISTS nba_accredited BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS nba_valid_till DATE,
  ADD COLUMN IF NOT EXISTS nirf_score DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS nirf_year INTEGER,
  ADD COLUMN IF NOT EXISTS arch_index_score INTEGER,
  ADD COLUMN IF NOT EXISTS accepted_exams TEXT[],
  ADD COLUMN IF NOT EXISTS counseling_systems TEXT[],
  ADD COLUMN IF NOT EXISTS has_management_quota BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_nri_quota BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS affiliated_university TEXT,
  ADD COLUMN IF NOT EXISTS admissions_email TEXT,
  ADD COLUMN IF NOT EXISTS admissions_phone TEXT,
  ADD COLUMN IF NOT EXISTS youtube_channel_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS instagram_handle TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS tier_start_date DATE,
  ADD COLUMN IF NOT EXISTS tier_end_date DATE,
  ADD COLUMN IF NOT EXISTS tier_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS claimed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_by UUID,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery_images TEXT[],
  ADD COLUMN IF NOT EXISTS highlights TEXT[],
  ADD COLUMN IF NOT EXISTS about TEXT,
  ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS data_completeness INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_data_update TIMESTAMPTZ;

-- ── 2. Indexes for new searchable columns ────────────────────────
CREATE INDEX IF NOT EXISTS idx_colleges_state_slug ON colleges(state_slug);
CREATE INDEX IF NOT EXISTS idx_colleges_accepted_exams ON colleges USING GIN(accepted_exams);
CREATE INDEX IF NOT EXISTS idx_colleges_counseling_systems ON colleges USING GIN(counseling_systems);
CREATE INDEX IF NOT EXISTS idx_colleges_arch_index ON colleges(arch_index_score DESC NULLS LAST);

-- ── 3. Backfill state_slug ────────────────────────────────────────
-- Converts "Tamil Nadu" → "tamil-nadu" for URL generation
UPDATE colleges
SET state_slug = regexp_replace(lower(trim(state)), '\s+', '-', 'g')
WHERE state_slug IS NULL AND state IS NOT NULL;

-- ── 4. Backfill accepted_exams + counseling_systems for TN colleges
UPDATE colleges
SET
  accepted_exams = ARRAY['NATA'],
  counseling_systems = ARRAY['TNEA']
WHERE
  state = 'Tamil Nadu'
  AND accepted_exams IS NULL;

-- ── 5. college_fees ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_fees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  year_number INTEGER NOT NULL CHECK (year_number BETWEEN 1 AND 5),
  fee_category TEXT NOT NULL DEFAULT 'general'
    CHECK (fee_category IN ('general', 'obc', 'obc_ncl', 'sc', 'st', 'ews', 'management', 'nri')),
  tuition DECIMAL(10,2),
  hostel DECIMAL(10,2),
  mess DECIMAL(10,2),
  exam_fees DECIMAL(10,2),
  lab_fees DECIMAL(10,2),
  library_fees DECIMAL(10,2),
  caution_deposit DECIMAL(10,2),
  other_fees DECIMAL(10,2),
  estimated_materials DECIMAL(10,2),
  estimated_field_trips DECIMAL(10,2),
  verified BOOLEAN DEFAULT false,
  verified_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, academic_year, year_number, fee_category)
);
CREATE INDEX IF NOT EXISTS idx_college_fees_college ON college_fees(college_id);

-- ── 6. college_cutoffs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_cutoffs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  counseling_system TEXT NOT NULL
    CHECK (counseling_system IN ('TNEA','JoSAA','KEAM','KCET','AP_EAPCET','TS_EAPCET','other')),
  round_number INTEGER,
  category TEXT NOT NULL
    CHECK (category IN ('general','obc','obc_ncl','sc','st','ews','pwd','nri','management')),
  cutoff_type TEXT NOT NULL CHECK (cutoff_type IN ('rank','score','percentile')),
  cutoff_value DECIMAL(10,2),
  total_seats INTEGER,
  filled_seats INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, academic_year, counseling_system, round_number, category)
);
CREATE INDEX IF NOT EXISTS idx_college_cutoffs_college ON college_cutoffs(college_id);

-- ── 7. college_placements ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_placements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  highest_package_lpa DECIMAL(6,2),
  average_package_lpa DECIMAL(6,2),
  median_package_lpa DECIMAL(6,2),
  placement_rate_percent DECIMAL(5,2),
  students_placed INTEGER,
  total_eligible INTEGER,
  top_recruiters TEXT[],
  top_sectors TEXT[],
  higher_studies_percent DECIMAL(5,2),
  entrepreneurship_percent DECIMAL(5,2),
  verified BOOLEAN DEFAULT false,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_college_placements_college ON college_placements(college_id);

-- ── 8. college_infrastructure ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_infrastructure (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE UNIQUE,
  design_studios INTEGER,
  studio_student_ratio TEXT,
  workshops TEXT[],
  software_available TEXT[],
  has_digital_fabrication BOOLEAN DEFAULT false,
  has_model_making_lab BOOLEAN DEFAULT false,
  has_material_library BOOLEAN DEFAULT false,
  has_library BOOLEAN DEFAULT true,
  library_books_count INTEGER,
  has_hostel_boys BOOLEAN,
  has_hostel_girls BOOLEAN,
  hostel_capacity INTEGER,
  hostel_type TEXT CHECK (hostel_type IN ('on_campus','off_campus','both')),
  has_mess BOOLEAN,
  has_wifi BOOLEAN DEFAULT true,
  has_sports BOOLEAN,
  sports_facilities TEXT[],
  campus_area_acres DECIMAL(6,2),
  campus_type TEXT CHECK (campus_type IN ('urban','suburban','campus_town','rural')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. college_faculty ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_faculty (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  specialization TEXT,
  qualification TEXT,
  is_practicing_architect BOOLEAN DEFAULT false,
  profile_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_college_faculty_college ON college_faculty(college_id);

-- ── 10. college_admins ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS college_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin','viewer')),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_college_admins_college ON college_admins(college_id);

-- ── 11. FK: colleges.claimed_by → college_admins ─────────────────
ALTER TABLE colleges
  DROP CONSTRAINT IF EXISTS fk_colleges_claimed_by;
ALTER TABLE colleges
  ADD CONSTRAINT fk_colleges_claimed_by
  FOREIGN KEY (claimed_by) REFERENCES college_admins(id) ON DELETE SET NULL;

-- ── 12. RLS: enable on all new tables ────────────────────────────
ALTER TABLE college_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_cutoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_infrastructure ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_admins ENABLE ROW LEVEL SECURITY;

-- ── 13. RLS policies: public read on college data ─────────────────
CREATE POLICY "Public read fees" ON college_fees FOR SELECT USING (true);
CREATE POLICY "Public read cutoffs" ON college_cutoffs FOR SELECT USING (true);
CREATE POLICY "Public read placements" ON college_placements FOR SELECT USING (true);
CREATE POLICY "Public read infrastructure" ON college_infrastructure FOR SELECT USING (true);
CREATE POLICY "Public read faculty" ON college_faculty FOR SELECT USING (true);
-- college_admins: no public read (email addresses are sensitive)
```

- [ ] **Step 2: Apply migration to staging via Supabase MCP**

Use the `mcp__supabase-staging__apply_migration` tool:
- name: `college_hub_phase1`
- query: (full SQL from Step 1)

- [ ] **Step 3: Verify staging — check new columns exist**

Use `mcp__supabase-staging__execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'colleges' AND column_name IN
  ('state_slug','arch_index_score','accepted_exams','counseling_systems','tier_start_date','claimed')
ORDER BY column_name;
```
Expected: 6 rows returned.

- [ ] **Step 4: Verify backfill worked**

```sql
SELECT slug, state, state_slug, accepted_exams, counseling_systems
FROM colleges LIMIT 5;
```
Expected: `state_slug` shows `tamil-nadu`, `accepted_exams` shows `{NATA}`, `counseling_systems` shows `{TNEA}`.

- [ ] **Step 5: Apply migration to production via Supabase MCP**

Use `mcp__supabase-prod__apply_migration` with the same SQL.

- [ ] **Step 6: Regenerate TypeScript types**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem
pnpm supabase:gen:types
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260412_college_hub_phase1.sql
git commit -m "feat(db): add college hub phase 1 schema — extend colleges table + 6 new tables"
```

---

## Task 3: Types and Constants

**Files:**
- Create: `apps/marketing/src/lib/college-hub/types.ts`
- Create: `apps/marketing/src/lib/college-hub/constants.ts`

- [ ] **Step 1: Create types.ts**

Create `apps/marketing/src/lib/college-hub/types.ts`:

```typescript
// College Hub — TypeScript interfaces
// Column names match the Supabase database exactly.
// Note: DB uses 'type' (not 'college_type') and 'neram_tier' (not 'tier').

export type CollegeTier = 'free' | 'silver' | 'gold' | 'platinum';
export type FeeCategory = 'general' | 'obc' | 'obc_ncl' | 'sc' | 'st' | 'ews' | 'management' | 'nri';
export type CounselingSystem = 'TNEA' | 'JoSAA' | 'KEAM' | 'KCET' | 'AP_EAPCET' | 'TS_EAPCET' | 'other';
export type CutoffType = 'rank' | 'score' | 'percentile';

export interface College {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string;
  state: string;
  state_slug: string | null;
  district: string | null;
  address: string | null;
  pincode: string | null;
  type: string | null;
  affiliation: string | null;
  affiliated_university: string | null;
  established_year: number | null;
  intake_capacity: number | null;
  total_barch_seats: number | null;
  annual_fee_min: number | null;
  annual_fee_max: number | null;
  annual_fee_approx: number | null;
  // Accreditation
  coa_approved: boolean;
  coa_validity_till: string | null;
  naac_grade: string | null;
  naac_valid_till: string | null;
  nba_accredited: boolean;
  nirf_rank: number | null;
  nirf_rank_architecture: number | null;
  nirf_score: number | null;
  arch_index_score: number | null;
  // Exams
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
  has_management_quota: boolean;
  has_nri_quota: boolean;
  // Contact
  website: string | null;
  email: string | null;
  phone: string | null;
  admissions_email: string | null;
  admissions_phone: string | null;
  // Social
  youtube_channel_url: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  // Premium tier
  neram_tier: CollegeTier | null;
  tier_start_date: string | null;
  tier_end_date: string | null;
  // Verification
  claimed: boolean;
  verified: boolean;
  // Media
  logo_url: string | null;
  hero_image_url: string | null;
  gallery_images: string[] | null;
  images: string[] | null;
  // Content
  description: string | null;
  about: string | null;
  highlights: string[] | null;
  // SEO
  meta_title: string | null;
  meta_description: string | null;
  // Quality
  data_completeness: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollegeFee {
  id: string;
  college_id: string;
  academic_year: string;
  year_number: number;
  fee_category: FeeCategory;
  tuition: number | null;
  hostel: number | null;
  mess: number | null;
  exam_fees: number | null;
  lab_fees: number | null;
  library_fees: number | null;
  caution_deposit: number | null;
  other_fees: number | null;
  estimated_materials: number | null;
  estimated_field_trips: number | null;
  verified: boolean;
  verified_source: string | null;
}

export interface CollegeCutoff {
  id: string;
  college_id: string;
  academic_year: string;
  counseling_system: CounselingSystem;
  round_number: number | null;
  category: string;
  cutoff_type: CutoffType;
  cutoff_value: number | null;
  total_seats: number | null;
  source: string | null;
}

export interface CollegePlacement {
  id: string;
  college_id: string;
  academic_year: string;
  highest_package_lpa: number | null;
  average_package_lpa: number | null;
  median_package_lpa: number | null;
  placement_rate_percent: number | null;
  students_placed: number | null;
  total_eligible: number | null;
  top_recruiters: string[] | null;
  top_sectors: string[] | null;
  higher_studies_percent: number | null;
  verified: boolean;
}

export interface CollegeInfrastructure {
  id: string;
  college_id: string;
  design_studios: number | null;
  studio_student_ratio: string | null;
  workshops: string[] | null;
  software_available: string[] | null;
  has_digital_fabrication: boolean;
  has_model_making_lab: boolean;
  has_material_library: boolean;
  has_library: boolean;
  has_hostel_boys: boolean | null;
  has_hostel_girls: boolean | null;
  hostel_capacity: number | null;
  hostel_type: 'on_campus' | 'off_campus' | 'both' | null;
  has_mess: boolean | null;
  has_wifi: boolean;
  campus_area_acres: number | null;
  campus_type: 'urban' | 'suburban' | 'campus_town' | 'rural' | null;
}

export interface CollegeFaculty {
  id: string;
  college_id: string;
  name: string;
  designation: string | null;
  specialization: string | null;
  qualification: string | null;
  is_practicing_architect: boolean;
  display_order: number;
}

// Used in listing pages — only fields needed for cards
export type CollegeListItem = Pick<College,
  | 'id' | 'slug' | 'name' | 'short_name' | 'city' | 'state' | 'state_slug'
  | 'type' | 'neram_tier' | 'naac_grade' | 'nirf_rank' | 'nirf_rank_architecture'
  | 'arch_index_score' | 'coa_approved' | 'nba_accredited' | 'logo_url'
  | 'annual_fee_approx' | 'annual_fee_min' | 'annual_fee_max' | 'intake_capacity'
  | 'accepted_exams' | 'counseling_systems' | 'verified' | 'claimed'
  | 'established_year' | 'data_completeness'
>;

// Full college with all related data (for detail page)
export interface CollegeWithDetails extends College {
  fees: CollegeFee[];
  cutoffs: CollegeCutoff[];
  placements: CollegePlacement[];
  infrastructure: CollegeInfrastructure | null;
  faculty: CollegeFaculty[];
}

// Filter params for listing pages (from URL searchParams)
export interface CollegeFilters {
  state?: string;
  type?: string;
  exam?: string;
  counseling?: string;
  naac?: string;
  fee_max?: number;
  tier?: CollegeTier;
  verified?: boolean;
  page?: number;
}
```

- [ ] **Step 2: Create constants.ts**

Create `apps/marketing/src/lib/college-hub/constants.ts`:

```typescript
export const COLLEGE_TYPES = [
  { value: 'central_govt', label: 'Central Government' },
  { value: 'state_govt', label: 'State Government' },
  { value: 'aided', label: 'Government Aided' },
  { value: 'self_financing', label: 'Self Financing' },
  { value: 'deemed', label: 'Deemed University' },
  { value: 'private', label: 'Private' },
] as const;

export const NAAC_GRADES = ['A++', 'A+', 'A', 'B++', 'B+', 'B', 'C'] as const;

export const COUNSELING_SYSTEMS = [
  { value: 'TNEA', label: 'TNEA (Tamil Nadu)' },
  { value: 'JoSAA', label: 'JoSAA (IITs/NITs/SPAs)' },
  { value: 'KEAM', label: 'KEAM (Kerala)' },
  { value: 'KCET', label: 'KCET (Karnataka)' },
  { value: 'AP_EAPCET', label: 'AP EAPCET' },
  { value: 'TS_EAPCET', label: 'TS EAPCET' },
] as const;

export const EXAMS = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE Main Paper 2', label: 'JEE Paper 2' },
] as const;

export const TIER_CONFIG = {
  free:     { label: 'Free',     color: '#9E9E9E', bg: '#F5F5F5' },
  silver:   { label: 'Silver',   color: '#607D8B', bg: '#ECEFF1' },
  gold:     { label: 'Gold',     color: '#E8A817', bg: '#FFF8E1' },
  platinum: { label: 'Platinum', color: '#00838F', bg: '#E0F2F1' },
} as const;

export const ARCH_INDEX_CONFIG = {
  excellent: { min: 85, color: '#2E7D32', label: 'Excellent' },
  good:      { min: 70, color: '#00838F', label: 'Good' },
  average:   { min: 50, color: '#E8A817', label: 'Average' },
  below:     { min: 0,  color: '#C62828', label: 'Below Average' },
} as const;

export function getArchIndexColor(score: number | null): string {
  if (!score) return '#9E9E9E';
  if (score >= 85) return ARCH_INDEX_CONFIG.excellent.color;
  if (score >= 70) return ARCH_INDEX_CONFIG.good.color;
  if (score >= 50) return ARCH_INDEX_CONFIG.average.color;
  return ARCH_INDEX_CONFIG.below.color;
}

export const STATE_SLUGS: Record<string, string> = {
  'Tamil Nadu': 'tamil-nadu',
  'Karnataka': 'karnataka',
  'Maharashtra': 'maharashtra',
  'Kerala': 'kerala',
  'Andhra Pradesh': 'andhra-pradesh',
  'Telangana': 'telangana',
  'Rajasthan': 'rajasthan',
  'Gujarat': 'gujarat',
  'Delhi': 'delhi',
  'West Bengal': 'west-bengal',
  'Uttar Pradesh': 'uttar-pradesh',
  'Madhya Pradesh': 'madhya-pradesh',
  'Goa': 'goa',
  'Puducherry': 'puducherry',
  'Chandigarh': 'chandigarh',
};

export const FEE_RANGES = [
  { label: 'Under 3 Lakhs', max: 300000 },
  { label: '3 to 5 Lakhs', min: 300000, max: 500000 },
  { label: '5 to 10 Lakhs', min: 500000, max: 1000000 },
  { label: '10 to 20 Lakhs', min: 1000000, max: 2000000 },
  { label: 'Above 20 Lakhs', min: 2000000 },
] as const;

export const ITEMS_PER_PAGE = 20;
export const BASE_URL = 'https://neramclasses.com';
export const CURRENT_YEAR = new Date().getFullYear();
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/lib/college-hub/
git commit -m "feat(college-hub): add TypeScript types and constants"
```

---

## Task 4: Query Functions

**Files:**
- Create: `apps/marketing/src/lib/college-hub/queries.ts`

- [ ] **Step 1: Create queries.ts**

Create `apps/marketing/src/lib/college-hub/queries.ts`:

```typescript
import { createAdminClient } from '@neram/database';
import type {
  College, CollegeListItem, CollegeWithDetails,
  CollegeFee, CollegeCutoff, CollegePlacement,
  CollegeInfrastructure, CollegeFaculty, CollegeFilters,
} from './types';
import { ITEMS_PER_PAGE } from './constants';

function getClient() {
  return createAdminClient();
}

// ── Listing queries ───────────────────────────────────────────────

export async function getColleges(
  filters: CollegeFilters = {},
  page = 1
): Promise<{ colleges: CollegeListItem[]; total: number }> {
  const supabase = getClient();
  const from = (page - 1) * ITEMS_PER_PAGE;
  const to = from + ITEMS_PER_PAGE - 1;

  let query = supabase
    .from('colleges')
    .select(`
      id, slug, name, short_name, city, state, state_slug, type, neram_tier,
      naac_grade, nirf_rank, nirf_rank_architecture, arch_index_score,
      coa_approved, nba_accredited, logo_url, annual_fee_approx,
      annual_fee_min, annual_fee_max, intake_capacity, accepted_exams,
      counseling_systems, verified, claimed, established_year, data_completeness
    `, { count: 'exact' })
    .eq('is_active', true)
    .order('arch_index_score', { ascending: false, nullsFirst: false })
    .order('nirf_rank', { ascending: true, nullsFirst: false })
    .range(from, to);

  if (filters.state) query = query.eq('state_slug', filters.state);
  if (filters.type)  query = query.eq('type', filters.type);
  if (filters.exam)  query = query.contains('accepted_exams', [filters.exam]);
  if (filters.counseling) query = query.contains('counseling_systems', [filters.counseling]);
  if (filters.naac)  query = query.eq('naac_grade', filters.naac);
  if (filters.tier)  query = query.eq('neram_tier', filters.tier);
  if (filters.verified) query = query.eq('verified', true);
  if (filters.fee_max) query = query.lte('annual_fee_approx', filters.fee_max);

  const { data, count, error } = await query;
  if (error) throw new Error(`getColleges: ${error.message}`);

  return { colleges: (data ?? []) as CollegeListItem[], total: count ?? 0 };
}

export async function getStateColleges(stateslug: string): Promise<{
  colleges: CollegeListItem[];
  stateName: string;
  total: number;
}> {
  const supabase = getClient();
  const { data, count, error } = await supabase
    .from('colleges')
    .select(`
      id, slug, name, short_name, city, state, state_slug, type, neram_tier,
      naac_grade, nirf_rank, nirf_rank_architecture, arch_index_score,
      coa_approved, nba_accredited, logo_url, annual_fee_approx,
      annual_fee_min, annual_fee_max, intake_capacity, accepted_exams,
      counseling_systems, verified, claimed, established_year, data_completeness
    `, { count: 'exact' })
    .eq('state_slug', stateslug)
    .eq('is_active', true)
    .order('arch_index_score', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`getStateColleges: ${error.message}`);
  const stateName = (data?.[0] as CollegeListItem)?.state ?? stateslug;
  return { colleges: (data ?? []) as CollegeListItem[], stateName, total: count ?? 0 };
}

export async function getTNEAColleges(): Promise<CollegeListItem[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('colleges')
    .select(`
      id, slug, name, short_name, city, state, state_slug, type, neram_tier,
      naac_grade, nirf_rank, arch_index_score, coa_approved, logo_url,
      annual_fee_approx, intake_capacity, accepted_exams, counseling_systems,
      verified, claimed, established_year, data_completeness
    `)
    .contains('counseling_systems', ['TNEA'])
    .eq('is_active', true)
    .order('arch_index_score', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`getTNEAColleges: ${error.message}`);
  return (data ?? []) as CollegeListItem[];
}

export async function getJoSAAColleges(): Promise<CollegeListItem[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('colleges')
    .select(`
      id, slug, name, short_name, city, state, state_slug, type, neram_tier,
      naac_grade, nirf_rank, arch_index_score, coa_approved, logo_url,
      annual_fee_approx, intake_capacity, accepted_exams, counseling_systems,
      verified, claimed, established_year, data_completeness
    `)
    .contains('counseling_systems', ['JoSAA'])
    .eq('is_active', true)
    .order('nirf_rank', { ascending: true, nullsFirst: false });

  if (error) throw new Error(`getJoSAAColleges: ${error.message}`);
  return (data ?? []) as CollegeListItem[];
}

// ── Detail query ──────────────────────────────────────────────────

export async function getCollegeBySlug(
  slug: string
): Promise<CollegeWithDetails | null> {
  const supabase = getClient();

  const [collegeRes, feesRes, cutoffsRes, placementsRes, infraRes, facultyRes] =
    await Promise.all([
      supabase.from('colleges').select('*').eq('slug', slug).eq('is_active', true).single(),
      supabase.from('college_fees').select('*').eq('college_id',
        supabase.from('colleges').select('id').eq('slug', slug).single() as unknown as string
      ),
      supabase.from('college_cutoffs').select('*').order('academic_year', { ascending: false }),
      supabase.from('college_placements').select('*').order('academic_year', { ascending: false }),
      supabase.from('college_infrastructure').select('*').single(),
      supabase.from('college_faculty').select('*').eq('is_active', true).order('display_order'),
    ]);

  // Simpler approach: fetch college first, then related data by college_id
  if (collegeRes.error || !collegeRes.data) return null;
  const college = collegeRes.data as College;

  const [fees, cutoffs, placements, infra, faculty] = await Promise.all([
    supabase.from('college_fees').select('*').eq('college_id', college.id)
      .order('academic_year', { ascending: false }).order('year_number'),
    supabase.from('college_cutoffs').select('*').eq('college_id', college.id)
      .order('academic_year', { ascending: false }),
    supabase.from('college_placements').select('*').eq('college_id', college.id)
      .order('academic_year', { ascending: false }),
    supabase.from('college_infrastructure').select('*').eq('college_id', college.id).maybeSingle(),
    supabase.from('college_faculty').select('*').eq('college_id', college.id)
      .eq('is_active', true).order('display_order'),
  ]);

  return {
    ...college,
    fees: (fees.data ?? []) as CollegeFee[],
    cutoffs: (cutoffs.data ?? []) as CollegeCutoff[],
    placements: (placements.data ?? []) as CollegePlacement[],
    infrastructure: (infra.data ?? null) as CollegeInfrastructure | null,
    faculty: (faculty.data ?? []) as CollegeFaculty[],
  };
}

// ── Static params helpers ─────────────────────────────────────────

export async function getAllCollegeSlugs(): Promise<Array<{ state: string; slug: string }>> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('colleges')
    .select('slug, state_slug')
    .eq('is_active', true);

  if (error) return [];
  return (data ?? []).map((c) => ({ state: c.state_slug ?? 'india', slug: c.slug }));
}

export async function getActiveStates(): Promise<Array<{ state: string; slug: string; count: number }>> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('colleges')
    .select('state, state_slug')
    .eq('is_active', true);

  if (error) return [];

  const counts: Record<string, { state: string; slug: string; count: number }> = {};
  for (const row of data ?? []) {
    const key = row.state_slug ?? '';
    if (!counts[key]) counts[key] = { state: row.state, slug: key, count: 0 };
    counts[key].count++;
  }
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

export async function getSimilarColleges(
  college: CollegeListItem,
  limit = 4
): Promise<CollegeListItem[]> {
  const supabase = getClient();
  const { data } = await supabase
    .from('colleges')
    .select(`
      id, slug, name, short_name, city, state, state_slug, type, neram_tier,
      naac_grade, nirf_rank, arch_index_score, coa_approved, logo_url,
      annual_fee_approx, intake_capacity, verified, claimed, data_completeness
    `)
    .eq('state_slug', college.state_slug ?? '')
    .eq('is_active', true)
    .neq('id', college.id)
    .order('arch_index_score', { ascending: false, nullsFirst: false })
    .limit(limit);

  return (data ?? []) as CollegeListItem[];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/lib/college-hub/queries.ts
git commit -m "feat(college-hub): add Supabase query functions for college hub"
```

---

## Task 5: ArchIndex Calculation

**Files:**
- Create: `apps/marketing/src/lib/college-hub/archindex.ts`
- Create: `apps/marketing/src/lib/college-hub/archindex.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/marketing/src/lib/college-hub/archindex.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateArchIndex } from './archindex';
import type { CollegeWithDetails } from './types';

const baseCollege: Partial<CollegeWithDetails> = {
  fees: [], cutoffs: [], placements: [], infrastructure: null, faculty: [],
};

describe('calculateArchIndex', () => {
  it('returns null when no data available', () => {
    expect(calculateArchIndex(baseCollege as CollegeWithDetails)).toBeNull();
  });

  it('returns a number between 0 and 100', () => {
    const college = {
      ...baseCollege,
      placements: [{ academic_year: '2024', placement_rate_percent: 80, average_package_lpa: 6 }],
      infrastructure: { design_studios: 3, software_available: ['AutoCAD', 'Revit'], has_wifi: true },
    } as CollegeWithDetails;
    const score = calculateArchIndex(college);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('gives higher score to better-equipped college', () => {
    const good: Partial<CollegeWithDetails> = {
      ...baseCollege,
      placements: [{ academic_year: '2024', placement_rate_percent: 90, average_package_lpa: 8 }],
      infrastructure: {
        design_studios: 5, software_available: ['AutoCAD','Revit','Rhino','Grasshopper'],
        has_digital_fabrication: true, has_model_making_lab: true, has_wifi: true,
      },
    };
    const poor: Partial<CollegeWithDetails> = {
      ...baseCollege,
      placements: [{ academic_year: '2024', placement_rate_percent: 40, average_package_lpa: 3 }],
      infrastructure: { design_studios: 1, software_available: ['AutoCAD'], has_wifi: false },
    };
    const goodScore = calculateArchIndex(good as CollegeWithDetails);
    const poorScore = calculateArchIndex(poor as CollegeWithDetails);
    expect(goodScore!).toBeGreaterThan(poorScore!);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem
pnpm --filter @neram/marketing test archindex
```
Expected: FAIL — `calculateArchIndex` not found.

- [ ] **Step 3: Implement archindex.ts**

Create `apps/marketing/src/lib/college-hub/archindex.ts`:

```typescript
import type { CollegeWithDetails, CollegePlacement, CollegeInfrastructure, CollegeFaculty } from './types';

function placementScore(placements: CollegePlacement[]): number {
  const latest = placements[0];
  if (!latest) return 0;
  const rateScore = ((latest.placement_rate_percent ?? 0) / 100) * 60;
  const pkgScore = Math.min((latest.average_package_lpa ?? 0) / 15, 1) * 40;
  return rateScore + pkgScore;
}

function infraScore(infra: CollegeInfrastructure | null): number {
  if (!infra) return 20; // default baseline
  let score = 0;
  score += Math.min((infra.design_studios ?? 0) * 10, 30);
  score += Math.min((infra.software_available?.length ?? 0) * 5, 25);
  if (infra.has_digital_fabrication) score += 15;
  if (infra.has_model_making_lab) score += 15;
  if (infra.has_material_library) score += 10;
  if (infra.has_wifi) score += 5;
  return Math.min(score, 100);
}

function facultyScore(faculty: CollegeFaculty[]): number {
  if (!faculty.length) return 30; // default baseline
  const practitioners = faculty.filter((f) => f.is_practicing_architect).length;
  const practitionerRatio = practitioners / faculty.length;
  return Math.min(30 + practitionerRatio * 70, 100);
}

/**
 * Calculates Neram's proprietary ArchIndex score (0-100).
 * Returns null if there is insufficient data to compute a meaningful score.
 * Methodology is published at /colleges/archindex-methodology/ for AEO trust.
 */
export function calculateArchIndex(college: CollegeWithDetails): number | null {
  const hasAnyData =
    college.placements.length > 0 ||
    college.infrastructure !== null ||
    college.faculty.length > 0;

  if (!hasAnyData) return null;

  const placement = placementScore(college.placements);   // weight 20%
  const infra     = infraScore(college.infrastructure);    // weight 15%
  const faculty   = facultyScore(college.faculty);         // weight 20%

  // Studio quality proxy: from infrastructure design_studios (stand-in for review data in Phase 1)
  const studioProxy = college.infrastructure
    ? Math.min((college.infrastructure.design_studios ?? 1) / 6, 1) * 100
    : 50;

  const score = Math.round(
    studioProxy * 0.25 +
    faculty    * 0.20 +
    placement  * 0.20 +
    infra      * 0.15 +
    50         * 0.10 + // satisfaction: default until reviews exist (Phase 2)
    50         * 0.10   // alumni: default until data available
  );

  return Math.max(0, Math.min(100, score));
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm --filter @neram/marketing test archindex
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/lib/college-hub/archindex.ts apps/marketing/src/lib/college-hub/archindex.test.ts
git commit -m "feat(college-hub): add ArchIndex calculation with tests"
```

---

## Task 6: ArchIndexRing Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/ArchIndexRing.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/marketing/src/components/college-hub/ArchIndexRing.tsx
import { Box, Typography } from '@mui/material';
import { getArchIndexColor } from '@/lib/college-hub/constants';

interface ArchIndexRingProps {
  score: number | null;
  size?: number;      // px, default 60
  strokeWidth?: number;
}

export function ArchIndexRing({ score, size = 60, strokeWidth = 4 }: ArchIndexRingProps) {
  if (score === null) return null;

  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(score, 100));
  const dashArray = `${(filled / 100) * circumference} ${circumference}`;
  const color = getArchIndexColor(score);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <Box
      role="img"
      aria-label={`ArchIndex score: ${score} out of 100`}
      sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#E0E0E0" strokeWidth={strokeWidth} />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          strokeLinecap="round"
        />
      </svg>
      <Box sx={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Typography
          component="span"
          sx={{ fontWeight: 700, fontSize: size < 56 ? 10 : 12, color, lineHeight: 1 }}
        >
          {score}
        </Typography>
        <Typography
          component="span"
          sx={{ fontSize: size < 56 ? 6 : 8, color: 'text.secondary', lineHeight: 1 }}
        >
          AI
        </Typography>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/ArchIndexRing.tsx
git commit -m "feat(college-hub): add ArchIndexRing SVG component"
```

---

## Task 7: BadgePills Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/BadgePills.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/marketing/src/components/college-hub/BadgePills.tsx
import { Stack, Chip } from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import { TIER_CONFIG } from '@/lib/college-hub/constants';
import type { CollegeTier } from '@/lib/college-hub/types';

interface BadgePillsProps {
  coa_approved: boolean;
  naac_grade?: string | null;
  nba_accredited?: boolean;
  nirf_rank?: number | null;
  neram_tier?: CollegeTier | null;
  verified?: boolean;
  size?: 'small' | 'medium';
}

export function BadgePills({
  coa_approved, naac_grade, nba_accredited,
  nirf_rank, neram_tier, verified, size = 'small',
}: BadgePillsProps) {
  return (
    <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap>
      {coa_approved && (
        <Chip label="COA Approved" size={size}
          sx={{ bgcolor: '#E8F5E9', color: '#2E7D32', fontWeight: 600, fontSize: 11 }} />
      )}
      {naac_grade && (
        <Chip label={`NAAC ${naac_grade}`} size={size}
          sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 600, fontSize: 11 }} />
      )}
      {nba_accredited && (
        <Chip label="NBA" size={size}
          sx={{ bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 600, fontSize: 11 }} />
      )}
      {nirf_rank && (
        <Chip label={`NIRF #${nirf_rank}`} size={size}
          sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 600, fontSize: 11 }} />
      )}
      {neram_tier && neram_tier !== 'free' && (
        <Chip
          label={TIER_CONFIG[neram_tier].label}
          size={size}
          sx={{
            bgcolor: TIER_CONFIG[neram_tier].bg,
            color: TIER_CONFIG[neram_tier].color,
            fontWeight: 700, fontSize: 11,
          }}
        />
      )}
      {verified && (
        <Chip
          icon={<VerifiedIcon sx={{ fontSize: '14px !important' }} />}
          label="Verified"
          size={size}
          sx={{ bgcolor: '#E0F2F1', color: '#00838F', fontWeight: 600, fontSize: 11 }}
        />
      )}
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/BadgePills.tsx
git commit -m "feat(college-hub): add BadgePills component"
```

---

## Task 8: NavPills Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/NavPills.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/marketing/src/components/college-hub/NavPills.tsx
'use client';
import { useState, useEffect } from 'react';
import { Box, Button, Stack } from '@mui/material';

const NAV_SECTIONS = [
  { id: 'overview',       label: 'Overview' },
  { id: 'fees',           label: 'Fees' },
  { id: 'admissions',     label: 'Admissions' },
  { id: 'placements',     label: 'Placements' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'reviews',        label: 'Reviews' },
] as const;

export function NavPills() {
  const [active, setActive] = useState<string>('overview');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box
      component="nav"
      aria-label="College page sections"
      sx={{
        position: 'sticky',
        top: { xs: 56, md: 64 },
        zIndex: 10,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        overflowX: 'auto',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      <Stack direction="row" sx={{ px: { xs: 1, md: 3 }, py: 0.5, minWidth: 'max-content' }}>
        {NAV_SECTIONS.map(({ id, label }) => (
          <Button
            key={id}
            onClick={() => scrollTo(id)}
            size="small"
            sx={{
              color: active === id ? '#00838F' : 'text.secondary',
              fontWeight: active === id ? 700 : 400,
              borderBottom: active === id ? '2px solid #00838F' : '2px solid transparent',
              borderRadius: 0,
              px: 2,
              py: 1.5,
              minWidth: 'auto',
              whiteSpace: 'nowrap',
              '&:hover': { bgcolor: 'transparent', color: '#00838F' },
            }}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/NavPills.tsx
git commit -m "feat(college-hub): add sticky NavPills with intersection observer"
```

---

## Task 9: HeroSection Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/HeroSection.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/marketing/src/components/college-hub/HeroSection.tsx
import { Box, Typography, Stack, Avatar, Chip, Divider } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SchoolIcon from '@mui/icons-material/School';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { ArchIndexRing } from './ArchIndexRing';
import { BadgePills } from './BadgePills';
import type { College } from '@/lib/college-hub/types';

interface HeroSectionProps {
  college: College;
}

function formatFee(approx: number | null, min: number | null, max: number | null): string {
  if (approx) return `~${(approx / 100000).toFixed(1)}L/yr`;
  if (min && max) return `${(min / 100000).toFixed(1)}-${(max / 100000).toFixed(1)}L/yr`;
  if (min) return `from ${(min / 100000).toFixed(1)}L/yr`;
  return 'Fees N/A';
}

export function HeroSection({ college }: HeroSectionProps) {
  const displayName = college.short_name || college.name;
  const fee = formatFee(college.annual_fee_approx, college.annual_fee_min, college.annual_fee_max);

  return (
    <Box
      id="overview"
      sx={{
        bgcolor: 'white',
        borderBottom: '1px solid',
        borderColor: 'divider',
        pt: { xs: 2, md: 4 },
        pb: { xs: 2, md: 3 },
        px: { xs: 2, md: 4 },
      }}
    >
      {/* Top row: logo + name + ArchIndex */}
      <Stack direction="row" alignItems="flex-start" gap={2} mb={1.5}>
        <Avatar
          src={college.logo_url || college.hero_image_url || undefined}
          alt={`${displayName} logo`}
          variant="rounded"
          sx={{ width: { xs: 56, md: 72 }, height: { xs: 56, md: 72 }, flexShrink: 0, bgcolor: '#E0F2F1' }}
        >
          <SchoolIcon sx={{ color: '#00838F', fontSize: 32 }} />
        </Avatar>

        <Box flex={1} minWidth={0}>
          <Typography
            variant="h1"
            sx={{ fontSize: { xs: '1.1rem', md: '1.4rem' }, fontWeight: 700, lineHeight: 1.3, mb: 0.5 }}
          >
            {college.name}
          </Typography>
          {college.short_name && college.short_name !== college.name && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {college.short_name}
            </Typography>
          )}
          <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap">
            <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {college.city}, {college.state}
            </Typography>
          </Stack>
        </Box>

        <ArchIndexRing score={college.arch_index_score} size={64} />
      </Stack>

      {/* Badges */}
      <Box mb={1.5}>
        <BadgePills
          coa_approved={college.coa_approved}
          naac_grade={college.naac_grade}
          nba_accredited={college.nba_accredited}
          nirf_rank={college.nirf_rank_architecture || college.nirf_rank}
          neram_tier={college.neram_tier}
          verified={college.verified}
        />
      </Box>

      {/* Quick stats bar */}
      <Divider sx={{ mb: 1.5 }} />
      <Stack
        direction="row"
        divider={<Divider orientation="vertical" flexItem />}
        gap={2}
        sx={{ overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}
      >
        {college.established_year && (
          <Box sx={{ textAlign: 'center', minWidth: 64 }}>
            <Typography variant="caption" color="text.secondary" display="block">Est.</Typography>
            <Typography variant="body2" fontWeight={600}>{college.established_year}</Typography>
          </Box>
        )}
        {(college.intake_capacity || college.total_barch_seats) && (
          <Box sx={{ textAlign: 'center', minWidth: 64 }}>
            <Typography variant="caption" color="text.secondary" display="block">Seats</Typography>
            <Typography variant="body2" fontWeight={600}>
              {college.total_barch_seats || college.intake_capacity}
            </Typography>
          </Box>
        )}
        <Box sx={{ textAlign: 'center', minWidth: 80 }}>
          <Typography variant="caption" color="text.secondary" display="block">Annual Fee</Typography>
          <Typography variant="body2" fontWeight={600} color="#00838F">{fee}</Typography>
        </Box>
        {college.type && (
          <Box sx={{ textAlign: 'center', minWidth: 80 }}>
            <Typography variant="caption" color="text.secondary" display="block">Type</Typography>
            <Typography variant="body2" fontWeight={600} sx={{ textTransform: 'capitalize' }}>
              {college.type.replace(/_/g, ' ')}
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/HeroSection.tsx
git commit -m "feat(college-hub): add college HeroSection component"
```

---

## Task 10: FeeBreakdown Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/FeeBreakdown.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/marketing/src/components/college-hub/FeeBreakdown.tsx
import { Box, Typography, Table, TableBody, TableCell, TableHead, TableRow, Chip, Alert } from '@mui/material';
import type { CollegeFee } from '@/lib/college-hub/types';

interface FeeBreakdownProps {
  fees: CollegeFee[];
  annualFeeApprox: number | null;
  collegeName: string;
}

function fmt(n: number | null): string {
  if (!n) return '-';
  return `₹${n.toLocaleString('en-IN')}`;
}

function yearLabel(n: number): string {
  return ['1st', '2nd', '3rd', '4th', '5th'][n - 1] + ' Year';
}

export function FeeBreakdown({ fees, annualFeeApprox, collegeName }: FeeBreakdownProps) {
  const generalFees = fees.filter((f) => f.fee_category === 'general');
  const hasDetailedFees = generalFees.length > 0;

  return (
    <Box id="fees" sx={{ py: 3, px: { xs: 2, md: 4 } }}>
      <Typography variant="h2" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2 }}>
        Fee Structure
      </Typography>

      {!hasDetailedFees && annualFeeApprox && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Approximate annual fee: <strong>₹{annualFeeApprox.toLocaleString('en-IN')}</strong>.
          Detailed year-by-year breakdown not yet available.
        </Alert>
      )}

      {!hasDetailedFees && !annualFeeApprox && (
        <Alert severity="warning">
          Fee details for {collegeName} are not yet available. Check the official college website.
        </Alert>
      )}

      {hasDetailedFees && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#F5F5F5' }}>
                <TableCell sx={{ fontWeight: 700 }}>Year</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Tuition</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Hostel</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Mess</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Other</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#00838F' }}>Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {generalFees.map((fee) => {
                const total = [fee.tuition, fee.hostel, fee.mess, fee.exam_fees,
                  fee.lab_fees, fee.library_fees, fee.other_fees, fee.estimated_materials]
                  .reduce((sum, v) => sum + (v ?? 0), 0);
                return (
                  <TableRow key={fee.id} hover>
                    <TableCell>
                      {yearLabel(fee.year_number)}
                      {fee.verified && (
                        <Chip label="Verified" size="small" sx={{ ml: 1, height: 16, fontSize: 9, bgcolor: '#E8F5E9', color: '#2E7D32' }} />
                      )}
                    </TableCell>
                    <TableCell align="right">{fmt(fee.tuition)}</TableCell>
                    <TableCell align="right">{fmt(fee.hostel)}</TableCell>
                    <TableCell align="right">{fmt(fee.mess)}</TableCell>
                    <TableCell align="right">{fmt(fee.other_fees)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#00838F' }}>
                      {fmt(total)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Fee data for academic year {generalFees[0]?.academic_year}.
            Actual fees may vary. Verify with the college admissions office.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/FeeBreakdown.tsx
git commit -m "feat(college-hub): add FeeBreakdown component"
```

---

## Task 11: CutoffSparkline Component

**Files:**
- Create: `apps/marketing/src/components/college-hub/CutoffSparkline.tsx`

- [ ] **Step 1: Create component**

```tsx
// apps/marketing/src/components/college-hub/CutoffSparkline.tsx
'use client';
import { Box, Typography, Stack, Chip, Alert } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import type { CollegeCutoff } from '@/lib/college-hub/types';

interface CutoffSparklineProps {
  cutoffs: CollegeCutoff[];
  collegeName: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  general: '#00838F',
  obc:     '#E8A817',
  sc:      '#7B1FA2',
  st:      '#1565C0',
  ews:     '#2E7D32',
};

export function CutoffSparkline({ cutoffs, collegeName }: CutoffSparklineProps) {
  const id = 'admissions';

  if (!cutoffs.length) {
    return (
      <Box id={id} sx={{ py: 3, px: { xs: 2, md: 4 } }}>
        <Typography variant="h2" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2 }}>
          Admissions and Cutoffs
        </Typography>
        <Alert severity="info">
          Cutoff history for {collegeName} is not yet available. Check back after TNEA/JoSAA counseling.
        </Alert>
      </Box>
    );
  }

  // Group by year for chart
  const years = [...new Set(cutoffs.map((c) => c.academic_year))].sort();
  const categories = [...new Set(cutoffs.filter((c) => c.category !== 'nri' && c.category !== 'management').map((c) => c.category))];

  const chartData = years.map((year) => {
    const row: Record<string, string | number> = { year };
    categories.forEach((cat) => {
      const entry = cutoffs.find((c) => c.academic_year === year && c.category === cat);
      if (entry?.cutoff_value) row[cat] = entry.cutoff_value;
    });
    return row;
  });

  const latestYear = years[years.length - 1];
  const latestCutoffs = cutoffs.filter((c) => c.academic_year === latestYear);

  return (
    <Box id={id} sx={{ py: 3, px: { xs: 2, md: 4 } }}>
      <Typography variant="h2" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 1 }}>
        Admissions and Cutoffs
      </Typography>

      {/* Latest year summary chips */}
      <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
        {latestCutoffs.slice(0, 4).map((c) => (
          <Chip
            key={c.id}
            label={`${c.category.toUpperCase()}: ${c.cutoff_value}`}
            size="small"
            sx={{ bgcolor: '#E0F2F1', color: '#00838F', fontWeight: 600 }}
          />
        ))}
        <Chip label={`${latestYear} data`} size="small" variant="outlined" />
      </Stack>

      {/* Trend chart */}
      {chartData.length > 1 && (
        <Box sx={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) => [value, name.toUpperCase()]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {categories.map((cat) => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke={CATEGORY_COLORS[cat] || '#9E9E9E'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">
        Source: TNEA/JoSAA official data. Cutoffs vary each year based on applicant pool.
      </Typography>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/components/college-hub/CutoffSparkline.tsx
git commit -m "feat(college-hub): add CutoffSparkline with Recharts line chart"
```

---

## Task 12: PlacementStats, InfrastructureSection, SimilarColleges, ClaimProfileCTA

**Files:**
- Create: `apps/marketing/src/components/college-hub/PlacementStats.tsx`
- Create: `apps/marketing/src/components/college-hub/InfrastructureSection.tsx`
- Create: `apps/marketing/src/components/college-hub/SimilarColleges.tsx`
- Create: `apps/marketing/src/components/college-hub/ClaimProfileCTA.tsx`

- [ ] **Step 1: Create PlacementStats.tsx**

```tsx
// apps/marketing/src/components/college-hub/PlacementStats.tsx
import { Box, Typography, Stack, Paper, Alert, Chip } from '@mui/material';
import WorkIcon from '@mui/icons-material/Work';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import type { CollegePlacement } from '@/lib/college-hub/types';

interface PlacementStatsProps {
  placements: CollegePlacement[];
  collegeName: string;
}

export function PlacementStats({ placements, collegeName }: PlacementStatsProps) {
  const latest = placements[0];

  return (
    <Box id="placements" sx={{ py: 3, px: { xs: 2, md: 4 }, bgcolor: '#FAFAFA' }}>
      <Typography variant="h2" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2 }}>
        Placements
      </Typography>

      {!latest ? (
        <Alert severity="info">
          Placement data for {collegeName} is not yet available.
        </Alert>
      ) : (
        <>
          <Stack direction="row" flexWrap="wrap" gap={2} mb={2}>
            {latest.highest_package_lpa && (
              <Paper elevation={0} sx={{ p: 2, border: '1px solid #E0E0E0', borderRadius: 2, minWidth: 120, textAlign: 'center' }}>
                <TrendingUpIcon sx={{ color: '#2E7D32', fontSize: 20, mb: 0.5 }} />
                <Typography variant="h6" fontWeight={700} color="#2E7D32">
                  {latest.highest_package_lpa} LPA
                </Typography>
                <Typography variant="caption" color="text.secondary">Highest Package</Typography>
              </Paper>
            )}
            {latest.average_package_lpa && (
              <Paper elevation={0} sx={{ p: 2, border: '1px solid #E0E0E0', borderRadius: 2, minWidth: 120, textAlign: 'center' }}>
                <WorkIcon sx={{ color: '#00838F', fontSize: 20, mb: 0.5 }} />
                <Typography variant="h6" fontWeight={700} color="#00838F">
                  {latest.average_package_lpa} LPA
                </Typography>
                <Typography variant="caption" color="text.secondary">Avg Package</Typography>
              </Paper>
            )}
            {latest.placement_rate_percent && (
              <Paper elevation={0} sx={{ p: 2, border: '1px solid #E0E0E0', borderRadius: 2, minWidth: 120, textAlign: 'center' }}>
                <Typography variant="h6" fontWeight={700} color="#1B3A4B">
                  {latest.placement_rate_percent}%
                </Typography>
                <Typography variant="caption" color="text.secondary">Placement Rate</Typography>
              </Paper>
            )}
          </Stack>

          {latest.top_recruiters && latest.top_recruiters.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={600} mb={1}>Top Recruiters</Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {latest.top_recruiters.slice(0, 8).map((r) => (
                  <Chip key={r} label={r} size="small" variant="outlined" />
                ))}
              </Stack>
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Data for academic year {latest.academic_year}.
            {!latest.verified && ' Unverified — sourced from public data.'}
          </Typography>
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Create InfrastructureSection.tsx**

```tsx
// apps/marketing/src/components/college-hub/InfrastructureSection.tsx
import { Box, Typography, Stack, Chip, Alert } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import type { CollegeInfrastructure } from '@/lib/college-hub/types';

interface InfrastructureSectionProps {
  infrastructure: CollegeInfrastructure | null;
  collegeName: string;
}

function BoolItem({ label, value }: { label: string; value: boolean | null }) {
  if (value === null) return null;
  return (
    <Stack direction="row" alignItems="center" gap={0.5}>
      {value
        ? <CheckCircleIcon sx={{ fontSize: 16, color: '#2E7D32' }} />
        : <CancelIcon sx={{ fontSize: 16, color: '#9E9E9E' }} />}
      <Typography variant="body2" color={value ? 'text.primary' : 'text.secondary'}>{label}</Typography>
    </Stack>
  );
}

export function InfrastructureSection({ infrastructure: infra, collegeName }: InfrastructureSectionProps) {
  return (
    <Box id="infrastructure" sx={{ py: 3, px: { xs: 2, md: 4 } }}>
      <Typography variant="h2" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2 }}>
        Infrastructure and Facilities
      </Typography>

      {!infra ? (
        <Alert severity="info">
          Infrastructure details for {collegeName} are not yet available.
        </Alert>
      ) : (
        <Stack spacing={2}>
          {/* Architecture-specific */}
          {(infra.design_studios || infra.workshops?.length) && (
            <Box>
              <Typography variant="body2" fontWeight={600} mb={1} color="#00838F">
                Architecture Facilities
              </Typography>
              <Stack spacing={0.5}>
                {infra.design_studios && (
                  <Typography variant="body2">
                    Design Studios: <strong>{infra.design_studios}</strong>
                    {infra.studio_student_ratio && ` (${infra.studio_student_ratio} ratio)`}
                  </Typography>
                )}
                <BoolItem label="Digital Fabrication Lab" value={infra.has_digital_fabrication} />
                <BoolItem label="Model Making Lab" value={infra.has_model_making_lab} />
                <BoolItem label="Material Library" value={infra.has_material_library} />
              </Stack>
              {infra.workshops && infra.workshops.length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={0.5} mt={1}>
                  {infra.workshops.map((w) => <Chip key={w} label={w} size="small" variant="outlined" />)}
                </Stack>
              )}
            </Box>
          )}

          {/* Software */}
          {infra.software_available && infra.software_available.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={600} mb={1} color="#00838F">
                Software Available
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {infra.software_available.map((s) => (
                  <Chip key={s} label={s} size="small"
                    sx={{ bgcolor: '#E0F2F1', color: '#00695C', fontSize: 11 }} />
                ))}
              </Stack>
            </Box>
          )}

          {/* General */}
          <Box>
            <Typography variant="body2" fontWeight={600} mb={1} color="#00838F">
              General Facilities
            </Typography>
            <Stack spacing={0.5}>
              <BoolItem label="Library" value={infra.has_library} />
              <BoolItem label="Boys Hostel" value={infra.has_hostel_boys ?? null} />
              <BoolItem label="Girls Hostel" value={infra.has_hostel_girls ?? null} />
              <BoolItem label="Mess" value={infra.has_mess ?? null} />
              <BoolItem label="Wi-Fi Campus" value={infra.has_wifi} />
              <BoolItem label="Sports Facilities" value={infra.has_sports ?? null} />
            </Stack>
            {infra.campus_area_acres && (
              <Typography variant="body2" mt={1}>
                Campus area: <strong>{infra.campus_area_acres} acres</strong>
              </Typography>
            )}
          </Box>
        </Stack>
      )}
    </Box>
  );
}
```

- [ ] **Step 3: Create SimilarColleges.tsx**

```tsx
// apps/marketing/src/components/college-hub/SimilarColleges.tsx
import { Box, Typography, Stack } from '@mui/material';
import type { CollegeListItem } from '@/lib/college-hub/types';
import { CollegeListingCard } from './CollegeListingCard';

interface SimilarCollegesProps {
  colleges: CollegeListItem[];
  currentState: string;
}

export function SimilarColleges({ colleges, currentState }: SimilarCollegesProps) {
  if (!colleges.length) return null;
  return (
    <Box sx={{ py: 3, px: { xs: 2, md: 4 }, bgcolor: '#FAFAFA' }}>
      <Typography variant="h2" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2 }}>
        Similar Colleges in {currentState}
      </Typography>
      <Stack spacing={1.5}>
        {colleges.map((c) => (
          <CollegeListingCard key={c.id} college={c} />
        ))}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 4: Create ClaimProfileCTA.tsx**

```tsx
// apps/marketing/src/components/college-hub/ClaimProfileCTA.tsx
import { Box, Typography, Button, Stack } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface ClaimProfileCTAProps {
  collegeName: string;
}

export function ClaimProfileCTA({ collegeName }: ClaimProfileCTAProps) {
  return (
    <Box
      sx={{
        mx: { xs: 2, md: 4 },
        my: 2,
        p: 2,
        border: '1px dashed #B0BEC5',
        borderRadius: 2,
        bgcolor: '#F8FAFB',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" gap={2}>
        <InfoOutlinedIcon sx={{ color: '#607D8B', fontSize: 28, flexShrink: 0 }} />
        <Box flex={1}>
          <Typography variant="body2" fontWeight={600}>
            Are you from {collegeName}?
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Claim this profile to update fee details, upload photos, respond to reviews, and get leads from interested students.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          href="mailto:colleges@neramclasses.com?subject=Claim College Profile"
          sx={{
            borderColor: '#00838F', color: '#00838F', whiteSpace: 'nowrap',
            flexShrink: 0,
            '&:hover': { borderColor: '#00838F', bgcolor: '#E0F2F1' },
          }}
        >
          Claim Profile
        </Button>
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/components/college-hub/PlacementStats.tsx \
        apps/marketing/src/components/college-hub/InfrastructureSection.tsx \
        apps/marketing/src/components/college-hub/SimilarColleges.tsx \
        apps/marketing/src/components/college-hub/ClaimProfileCTA.tsx
git commit -m "feat(college-hub): add PlacementStats, InfrastructureSection, SimilarColleges, ClaimProfileCTA"
```

---

## Task 13: CollegeListingCard and FilterSidebar

**Files:**
- Create: `apps/marketing/src/components/college-hub/CollegeListingCard.tsx`
- Create: `apps/marketing/src/components/college-hub/FilterSidebar.tsx`

- [ ] **Step 1: Create CollegeListingCard.tsx**

```tsx
// apps/marketing/src/components/college-hub/CollegeListingCard.tsx
import Link from 'next/link';
import { Box, Typography, Stack, Paper } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { ArchIndexRing } from './ArchIndexRing';
import { BadgePills } from './BadgePills';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface CollegeListingCardProps {
  college: CollegeListItem;
}

export function CollegeListingCard({ college }: CollegeListingCardProps) {
  const stateslug = college.state_slug ?? 'india';
  const href = `/colleges/${stateslug}/${college.slug}`;
  const feeText = college.annual_fee_approx
    ? `~₹${(college.annual_fee_approx / 100000).toFixed(1)}L/yr`
    : college.annual_fee_min
    ? `from ₹${(college.annual_fee_min / 100000).toFixed(1)}L/yr`
    : null;

  return (
    <Paper
      component={Link}
      href={href}
      elevation={0}
      sx={{
        display: 'block',
        p: { xs: 1.5, md: 2 },
        border: '1px solid #E0E0E0',
        borderRadius: 2,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        '&:hover': {
          borderColor: '#00838F',
          boxShadow: '0 2px 8px rgba(0,131,143,0.12)',
        },
      }}
    >
      <Stack direction="row" alignItems="flex-start" gap={1.5}>
        <ArchIndexRing score={college.arch_index_score} size={52} />
        <Box flex={1} minWidth={0}>
          <Typography
            variant="body1"
            fontWeight={700}
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: { xs: 'normal', sm: 'nowrap' },
              lineHeight: 1.3,
              mb: 0.25,
            }}
          >
            {college.name}
          </Typography>
          <Stack direction="row" alignItems="center" gap={0.25} mb={0.75}>
            <LocationOnIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {college.city}, {college.state}
            </Typography>
            {feeText && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ mx: 0.5 }}>·</Typography>
                <Typography variant="caption" fontWeight={600} color="#00838F">{feeText}</Typography>
              </>
            )}
            {college.intake_capacity && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ mx: 0.5 }}>·</Typography>
                <Typography variant="caption" color="text.secondary">{college.intake_capacity} seats</Typography>
              </>
            )}
          </Stack>
          <BadgePills
            coa_approved={college.coa_approved}
            naac_grade={college.naac_grade}
            nirf_rank={college.nirf_rank_architecture || college.nirf_rank}
            neram_tier={college.neram_tier}
            verified={college.verified}
            size="small"
          />
        </Box>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 2: Create FilterSidebar.tsx**

```tsx
// apps/marketing/src/components/college-hub/FilterSidebar.tsx
'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import {
  Box, Typography, Stack, Chip, Divider, Button,
  FormGroup, FormControlLabel, Checkbox,
} from '@mui/material';
import { COLLEGE_TYPES, NAAC_GRADES, COUNSELING_SYSTEMS, EXAMS, FEE_RANGES } from '@/lib/college-hub/constants';

interface FilterSidebarProps {
  states: Array<{ state: string; slug: string; count: number }>;
}

export function FilterSidebar({ states }: FilterSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const isActive = (key: string, value: string) => searchParams.get(key) === value;
  const hasFilters = [...searchParams.keys()].some((k) => k !== 'page');

  return (
    <Box sx={{ position: { md: 'sticky' }, top: { md: 120 }, maxHeight: { md: '80vh' }, overflowY: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="body1" fontWeight={700}>Filters</Typography>
        {hasFilters && (
          <Button size="small" onClick={() => router.push(pathname)} sx={{ color: '#00838F', fontSize: 12 }}>
            Clear all
          </Button>
        )}
      </Stack>

      {/* State filter */}
      <Box mb={2}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          State
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
          {states.slice(0, 8).map(({ state, slug, count }) => (
            <Chip
              key={slug}
              label={`${state} (${count})`}
              size="small"
              onClick={() => setFilter('state', isActive('state', slug) ? null : slug)}
              sx={{
                bgcolor: isActive('state', slug) ? '#00838F' : undefined,
                color: isActive('state', slug) ? 'white' : undefined,
                cursor: 'pointer',
              }}
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Exam filter */}
      <Box mb={2}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Entrance Exam
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
          {EXAMS.map(({ value, label }) => (
            <Chip
              key={value}
              label={label}
              size="small"
              onClick={() => setFilter('exam', isActive('exam', value) ? null : value)}
              sx={{
                bgcolor: isActive('exam', value) ? '#00838F' : undefined,
                color: isActive('exam', value) ? 'white' : undefined,
                cursor: 'pointer',
              }}
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* College type */}
      <Box mb={2}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          College Type
        </Typography>
        <FormGroup sx={{ mt: 0.5 }}>
          {COLLEGE_TYPES.slice(0, 5).map(({ value, label }) => (
            <FormControlLabel
              key={value}
              control={
                <Checkbox
                  checked={isActive('type', value)}
                  onChange={() => setFilter('type', isActive('type', value) ? null : value)}
                  size="small"
                  sx={{ py: 0.25, color: '#00838F', '&.Mui-checked': { color: '#00838F' } }}
                />
              }
              label={<Typography variant="body2">{label}</Typography>}
            />
          ))}
        </FormGroup>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* NAAC Grade */}
      <Box mb={2}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          NAAC Grade
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
          {NAAC_GRADES.slice(0, 5).map((grade) => (
            <Chip
              key={grade}
              label={grade}
              size="small"
              onClick={() => setFilter('naac', isActive('naac', grade) ? null : grade)}
              sx={{
                bgcolor: isActive('naac', grade) ? '#1565C0' : undefined,
                color: isActive('naac', grade) ? 'white' : undefined,
                cursor: 'pointer',
              }}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/college-hub/CollegeListingCard.tsx \
        apps/marketing/src/components/college-hub/FilterSidebar.tsx
git commit -m "feat(college-hub): add CollegeListingCard and FilterSidebar components"
```

---

## Task 14: CollegePageTemplate (Master Template)

**Files:**
- Create: `apps/marketing/src/components/college-hub/CollegePageTemplate.tsx`

- [ ] **Step 1: Create the master template**

```tsx
// apps/marketing/src/components/college-hub/CollegePageTemplate.tsx
import { Box, Container } from '@mui/material';
import { HeroSection } from './HeroSection';
import { NavPills } from './NavPills';
import { FeeBreakdown } from './FeeBreakdown';
import { CutoffSparkline } from './CutoffSparkline';
import { PlacementStats } from './PlacementStats';
import { InfrastructureSection } from './InfrastructureSection';
import { SimilarColleges } from './SimilarColleges';
import { ClaimProfileCTA } from './ClaimProfileCTA';
import type { CollegeWithDetails, CollegeListItem } from '@/lib/college-hub/types';

interface CollegePageTemplateProps {
  college: CollegeWithDetails;
  similarColleges: CollegeListItem[];
}

export function CollegePageTemplate({ college, similarColleges }: CollegePageTemplateProps) {
  return (
    <Box sx={{ bgcolor: 'background.default', pb: 6 }}>
      <HeroSection college={college} />
      <NavPills />

      {/* Claim profile banner (if not yet claimed) */}
      {!college.claimed && <ClaimProfileCTA collegeName={college.short_name || college.name} />}

      <Container maxWidth="lg" disableGutters sx={{ px: { xs: 0, md: 0 } }}>
        {/* About / Overview */}
        {(college.about || college.description) && (
          <Box sx={{ py: 3, px: { xs: 2, md: 4 } }}>
            <Box
              dangerouslySetInnerHTML={{ __html: college.about || college.description || '' }}
              sx={{
                '& p': { fontSize: '0.9rem', lineHeight: 1.7, mb: 1.5, color: 'text.secondary' },
                '& h3, & h4': { fontWeight: 600, mb: 1 },
              }}
            />
          </Box>
        )}

        {/* Fees */}
        <FeeBreakdown
          fees={college.fees}
          annualFeeApprox={college.annual_fee_approx}
          collegeName={college.short_name || college.name}
        />

        {/* Admissions + Cutoffs */}
        <CutoffSparkline
          cutoffs={college.cutoffs}
          collegeName={college.short_name || college.name}
        />

        {/* Placements */}
        <PlacementStats
          placements={college.placements}
          collegeName={college.short_name || college.name}
        />

        {/* Infrastructure */}
        <InfrastructureSection
          infrastructure={college.infrastructure}
          collegeName={college.short_name || college.name}
        />

        {/* Reviews placeholder — Phase 2 */}
        <Box id="reviews" sx={{ py: 3, px: { xs: 2, md: 4 } }} />

        {/* Similar colleges */}
        <SimilarColleges colleges={similarColleges} currentState={college.state} />
      </Container>
    </Box>
  );
}
```

- [ ] **Step 2: Create barrel export**

Create `apps/marketing/src/components/college-hub/index.ts`:

```typescript
export { ArchIndexRing } from './ArchIndexRing';
export { BadgePills } from './BadgePills';
export { NavPills } from './NavPills';
export { HeroSection } from './HeroSection';
export { FeeBreakdown } from './FeeBreakdown';
export { CutoffSparkline } from './CutoffSparkline';
export { PlacementStats } from './PlacementStats';
export { InfrastructureSection } from './InfrastructureSection';
export { SimilarColleges } from './SimilarColleges';
export { ClaimProfileCTA } from './ClaimProfileCTA';
export { CollegePageTemplate } from './CollegePageTemplate';
export { CollegeListingCard } from './CollegeListingCard';
export { FilterSidebar } from './FilterSidebar';
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/college-hub/
git commit -m "feat(college-hub): add CollegePageTemplate master template and barrel exports"
```

---

## Task 15: SEO Helper Functions

**Files:**
- Create: `apps/marketing/src/lib/college-hub/seo.ts`
- Create: `apps/marketing/src/lib/college-hub/schema-markup.ts`

- [ ] **Step 1: Create seo.ts**

```typescript
// apps/marketing/src/lib/college-hub/seo.ts
import type { Metadata } from 'next';
import { buildAlternates } from '@/lib/seo/metadata';
import { BASE_URL, CURRENT_YEAR } from './constants';
import type { College, CollegeListItem } from './types';

// ── Individual college page ───────────────────────────────────────

export function generateCollegeMetadata(college: College, locale: string): Metadata {
  const displayName = college.short_name || college.name;
  const path = `/colleges/${college.state_slug}/${college.slug}`;

  const title = college.meta_title ||
    `${displayName}: B.Arch Admission ${CURRENT_YEAR}, Fees, Placements, Cutoff`;

  const feePart = college.annual_fee_approx
    ? `Fees (~₹${(college.annual_fee_approx / 100000).toFixed(0)}L total)`
    : 'Fees';
  const counselingPart = college.counseling_systems?.includes('TNEA') ? 'TNEA' :
    college.counseling_systems?.includes('JoSAA') ? 'JoSAA' : 'Admission';
  const nirfPart = college.nirf_rank ? `, NIRF #${college.nirf_rank}` : '';

  const description = college.meta_description ||
    `Explore ${college.name} B.Arch ${CURRENT_YEAR}. ${feePart}, ${counselingPart} cutoff${nirfPart}. ` +
    `Compare colleges, read reviews, connect with current students. COA Approved.`;

  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}${path}`,
      images: college.hero_image_url ? [{ url: college.hero_image_url }] : undefined,
    },
    other: {
      'og:locale': 'en_IN',
    },
  };
}

// ── State listing page ────────────────────────────────────────────

export function generateStateMetadata(
  stateName: string,
  stateSlug: string,
  count: number,
  locale: string,
): Metadata {
  const path = `/colleges/${stateSlug}`;
  const title = `B.Arch Architecture Colleges in ${stateName} ${CURRENT_YEAR} — ${count} COA Approved`;
  const description =
    `Complete list of ${count} COA approved B.Arch architecture colleges in ${stateName}. ` +
    `Fees, NATA cutoffs, TNEA/JoSAA counseling guide, rankings and reviews.`;

  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: { title, description, type: 'website', url: `${BASE_URL}${path}` },
  };
}

// ── All-India listing page ────────────────────────────────────────

export function generateListingMetadata(locale: string): Metadata {
  const path = '/colleges';
  const title = `B.Arch Architecture Colleges in India ${CURRENT_YEAR} — All COA Approved Colleges`;
  const description =
    `Browse all COA approved B.Arch architecture colleges in India. ` +
    `Filter by state, fees, NATA/JEE acceptance, NAAC grade. ` +
    `Cutoffs, placements, fees and student reviews.`;

  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: { title, description, type: 'website', url: `${BASE_URL}${path}` },
  };
}
```

- [ ] **Step 2: Create schema-markup.ts**

```typescript
// apps/marketing/src/lib/college-hub/schema-markup.ts
import { BASE_URL, CURRENT_YEAR } from './constants';
import type { CollegeWithDetails } from './types';

export function generateCollegeSchema(college: CollegeWithDetails) {
  const url = `${BASE_URL}/colleges/${college.state_slug}/${college.slug}`;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    '@id': `${url}/#college`,
    name: college.name,
    alternateName: college.short_name || undefined,
    url,
    description: college.about || college.description || undefined,
    foundingDate: college.established_year?.toString(),
    address: {
      '@type': 'PostalAddress',
      streetAddress: college.address || undefined,
      addressLocality: college.city,
      addressRegion: college.state,
      postalCode: college.pincode || undefined,
      addressCountry: 'IN',
    },
  };

  if (college.naac_grade) {
    schema.hasCredential = [{
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'NAAC Accreditation',
      description: `NAAC Grade ${college.naac_grade}`,
    }];
  }

  if (college.nirf_rank) {
    schema.award = `NIRF Rank #${college.nirf_rank}`;
  }

  return schema;
}

export function generateCollegeFAQSchema(college: CollegeWithDetails) {
  const questions: Array<{ question: string; answer: string }> = [];
  const name = college.short_name || college.name;

  if (college.annual_fee_approx || college.annual_fee_min) {
    const fee = college.annual_fee_approx
      ? `approximately ₹${college.annual_fee_approx.toLocaleString('en-IN')} per year`
      : `between ₹${college.annual_fee_min?.toLocaleString('en-IN')} and ₹${college.annual_fee_max?.toLocaleString('en-IN')} per year`;
    questions.push({
      question: `What is the fee for B.Arch at ${name}?`,
      answer: `The B.Arch fee at ${college.name} is ${fee}. For the 5-year total cost including hostel and materials, check the detailed fee breakdown on this page.`,
    });
  }

  if (college.accepted_exams?.length) {
    questions.push({
      question: `Which entrance exam is required for ${name}?`,
      answer: `${college.name} accepts ${college.accepted_exams.join(' and ')} scores for B.Arch admission.`,
    });
  }

  if (college.counseling_systems?.length) {
    questions.push({
      question: `How to get admission in ${name}?`,
      answer: `Admission to B.Arch at ${college.name} is through ${college.counseling_systems.join(' and ')} counseling. You need to qualify NATA or JEE Paper 2 and participate in the counseling process.`,
    });
  }

  if (college.intake_capacity || college.total_barch_seats) {
    const seats = college.total_barch_seats || college.intake_capacity;
    questions.push({
      question: `How many B.Arch seats are available at ${name}?`,
      answer: `${college.name} has ${seats} B.Arch seats as approved by the Council of Architecture (COA).`,
    });
  }

  if (college.naac_grade) {
    questions.push({
      question: `Is ${name} NAAC accredited?`,
      answer: `Yes, ${college.name} has NAAC ${college.naac_grade} accreditation, indicating a high level of academic quality.`,
    });
  }

  questions.push({
    question: `Is ${name} approved by COA?`,
    answer: `${college.coa_approved ? 'Yes' : 'Please verify directly'}, ${college.name} is ${college.coa_approved ? '' : 'not '}approved by the Council of Architecture (COA) for B.Arch programs.`,
  });

  if (!questions.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}

export function generateBreadcrumbSchema(
  collegeName: string,
  stateSlug: string,
  stateName: string,
  collegeSlug: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Colleges', item: `${BASE_URL}/colleges` },
      { '@type': 'ListItem', position: 3, name: stateName, item: `${BASE_URL}/colleges/${stateSlug}` },
      { '@type': 'ListItem', position: 4, name: collegeName, item: `${BASE_URL}/colleges/${stateSlug}/${collegeSlug}` },
    ],
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/lib/college-hub/seo.ts apps/marketing/src/lib/college-hub/schema-markup.ts
git commit -m "feat(college-hub): add SEO metadata generators and JSON-LD schema markup"
```

---

## Task 16: Individual College Detail Page

**Files:**
- Create: `apps/marketing/src/app/[locale]/colleges/[state]/[slug]/page.tsx`

- [ ] **Step 1: Create the detail page**

```tsx
// apps/marketing/src/app/[locale]/colleges/[state]/[slug]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { CollegePageTemplate } from '@/components/college-hub/CollegePageTemplate';
import {
  getCollegeBySlug,
  getAllCollegeSlugs,
  getSimilarColleges,
} from '@/lib/college-hub/queries';
import { generateCollegeMetadata } from '@/lib/college-hub/seo';
import {
  generateCollegeSchema,
  generateCollegeFAQSchema,
  generateBreadcrumbSchema,
} from '@/lib/college-hub/schema-markup';

export const revalidate = 3600; // 1-hour ISR

interface PageProps {
  params: { locale: string; state: string; slug: string };
}

export async function generateStaticParams() {
  const slugs = await getAllCollegeSlugs();
  return slugs.map(({ state, slug }) => ({ state, slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const college = await getCollegeBySlug(params.slug);
  if (!college) return { title: 'College Not Found' };
  return generateCollegeMetadata(college, params.locale);
}

export default async function CollegeDetailPage({ params }: PageProps) {
  setRequestLocale(params.locale);

  const college = await getCollegeBySlug(params.slug);
  if (!college) notFound();

  const similarColleges = await getSimilarColleges(college);

  const collegeSchema = generateCollegeSchema(college);
  const faqSchema = generateCollegeFAQSchema(college);
  const breadcrumbSchema = generateBreadcrumbSchema(
    college.short_name || college.name,
    college.state_slug ?? params.state,
    college.state,
    college.slug,
  );

  return (
    <>
      <JsonLd data={collegeSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}
      <JsonLd data={breadcrumbSchema} />
      <CollegePageTemplate college={college} similarColleges={similarColleges} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/app/\[locale\]/colleges/
git commit -m "feat(college-hub): add individual college detail page with ISR and JSON-LD"
```

---

## Task 17: State Listing and All-India Listing Pages

**Files:**
- Create: `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/page.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/tnea/page.tsx`
- Create: `apps/marketing/src/app/[locale]/colleges/josaa/page.tsx`

- [ ] **Step 1: State listing page**

```tsx
// apps/marketing/src/app/[locale]/colleges/[state]/page.tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Stack } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { CollegeListingCard } from '@/components/college-hub/CollegeListingCard';
import { getStateColleges, getActiveStates } from '@/lib/college-hub/queries';
import { generateStateMetadata } from '@/lib/college-hub/seo';
import { generateBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { BASE_URL } from '@/lib/college-hub/constants';

export const revalidate = 3600;

interface PageProps {
  params: { locale: string; state: string };
}

export async function generateStaticParams() {
  const states = await getActiveStates();
  return states.map(({ slug }) => ({ state: slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { stateName, total } = await getStateColleges(params.state);
  if (!stateName) return { title: 'State Not Found' };
  return generateStateMetadata(stateName, params.state, total, params.locale);
}

export default async function StateCollegesPage({ params }: PageProps) {
  setRequestLocale(params.locale);

  const { colleges, stateName, total } = await getStateColleges(params.state);
  if (!colleges.length) notFound();

  const breadcrumb = generateBreadcrumbSchema(stateName, params.state, stateName, '');

  return (
    <>
      <JsonLd data={{
        ...breadcrumb,
        itemListElement: breadcrumb.itemListElement.slice(0, 3),
      }} />

      <Box sx={{ bgcolor: '#F5F7F9', minHeight: '100vh', pt: 3, pb: 6 }}>
        <Container maxWidth="lg">
          <Typography variant="h1" sx={{ fontSize: { xs: '1.3rem', md: '1.8rem' }, fontWeight: 700, mb: 0.5 }}>
            B.Arch Colleges in {stateName}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            {total} COA-approved B.Arch colleges in {stateName}
          </Typography>

          <Stack spacing={1.5}>
            {colleges.map((c) => (
              <CollegeListingCard key={c.id} college={c} />
            ))}
          </Stack>
        </Container>
      </Box>
    </>
  );
}
```

- [ ] **Step 2: All-India listing page**

```tsx
// apps/marketing/src/app/[locale]/colleges/page.tsx
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Grid, Typography } from '@mui/material';
import { Suspense } from 'react';
import { JsonLd } from '@/components/seo/JsonLd';
import { CollegeListingCard } from '@/components/college-hub/CollegeListingCard';
import { FilterSidebar } from '@/components/college-hub/FilterSidebar';
import { getColleges, getActiveStates } from '@/lib/college-hub/queries';
import { generateListingMetadata } from '@/lib/college-hub/seo';
import { BASE_URL } from '@/lib/college-hub/constants';
import type { CollegeFilters } from '@/lib/college-hub/types';

export const revalidate = 3600;

interface PageProps {
  params: { locale: string };
  searchParams: Record<string, string | string[]>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return generateListingMetadata(params.locale);
}

export default async function CollegesListingPage({ params, searchParams }: PageProps) {
  setRequestLocale(params.locale);

  const page = parseInt((searchParams.page as string) || '1', 10);
  const filters: CollegeFilters = {
    state: searchParams.state as string | undefined,
    type: searchParams.type as string | undefined,
    exam: searchParams.exam as string | undefined,
    counseling: searchParams.counseling as string | undefined,
    naac: searchParams.naac as string | undefined,
    tier: searchParams.tier as CollegeFilters['tier'],
    page,
  };

  const [{ colleges, total }, states] = await Promise.all([
    getColleges(filters, page),
    getActiveStates(),
  ]);

  const listingSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'B.Arch Architecture Colleges in India',
    numberOfItems: total,
    itemListElement: colleges.slice(0, 10).map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/colleges/${c.state_slug}/${c.slug}`,
      name: c.name,
    })),
  };

  return (
    <>
      <JsonLd data={listingSchema} />

      <Box sx={{ bgcolor: '#F5F7F9', minHeight: '100vh', pt: 3, pb: 6 }}>
        <Container maxWidth="lg">
          <Typography variant="h1" sx={{ fontSize: { xs: '1.3rem', md: '1.8rem' }, fontWeight: 700, mb: 0.5 }}>
            B.Arch Colleges in India
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            {total} COA-approved B.Arch colleges
          </Typography>

          <Grid container spacing={3}>
            {/* Sidebar — hidden on mobile, shown on md+ */}
            <Grid item md={3} sx={{ display: { xs: 'none', md: 'block' } }}>
              <Suspense>
                <FilterSidebar states={states} />
              </Suspense>
            </Grid>

            {/* College list */}
            <Grid item xs={12} md={9}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {colleges.map((c) => (
                  <CollegeListingCard key={c.id} college={c} />
                ))}
                {!colleges.length && (
                  <Typography color="text.secondary" textAlign="center" py={6}>
                    No colleges found for the selected filters. Try removing some filters.
                  </Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </>
  );
}
```

- [ ] **Step 3: TNEA page**

```tsx
// apps/marketing/src/app/[locale]/colleges/tnea/page.tsx
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Stack, Alert, Chip } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { CollegeListingCard } from '@/components/college-hub/CollegeListingCard';
import { getTNEAColleges } from '@/lib/college-hub/queries';
import { buildAlternates } from '@/lib/seo/metadata';
import { CURRENT_YEAR } from '@/lib/college-hub/constants';

export const revalidate = 86400;

interface PageProps { params: { locale: string } }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: `B.Arch Colleges Under TNEA ${CURRENT_YEAR} — Tamil Nadu Architecture Admission`,
    description: `Complete list of B.Arch colleges in Tamil Nadu under TNEA counseling ${CURRENT_YEAR}. Cutoffs, fees, seat matrix, and admission process for architecture colleges.`,
    alternates: buildAlternates(params.locale, '/colleges/tnea'),
  };
}

export default async function TNEACollegesPage({ params }: PageProps) {
  setRequestLocale(params.locale);
  const colleges = await getTNEAColleges();

  return (
    <>
      <Box sx={{ bgcolor: '#F5F7F9', minHeight: '100vh', pt: 3, pb: 6 }}>
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
            <Typography variant="h1" sx={{ fontSize: { xs: '1.3rem', md: '1.8rem' }, fontWeight: 700 }}>
              B.Arch Colleges Under TNEA {CURRENT_YEAR}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" mb={1}>
            {colleges.length} colleges participating in TNEA B.Arch counseling
          </Typography>
          <Alert severity="info" sx={{ mb: 3, fontSize: 13 }}>
            TNEA counseling is conducted by Anna University for B.Arch admissions in Tamil Nadu.
            Eligibility: 10+2 with Mathematics and qualified NATA score.
          </Alert>

          <Stack spacing={1.5}>
            {colleges.map((c) => (
              <CollegeListingCard key={c.id} college={c} />
            ))}
          </Stack>
        </Container>
      </Box>
    </>
  );
}
```

- [ ] **Step 4: JoSAA page**

```tsx
// apps/marketing/src/app/[locale]/colleges/josaa/page.tsx
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Stack, Alert } from '@mui/material';
import { CollegeListingCard } from '@/components/college-hub/CollegeListingCard';
import { getJoSAAColleges } from '@/lib/college-hub/queries';
import { buildAlternates } from '@/lib/seo/metadata';
import { CURRENT_YEAR } from '@/lib/college-hub/constants';

export const revalidate = 86400;

interface PageProps { params: { locale: string } }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: `B.Arch Colleges Under JoSAA ${CURRENT_YEAR} — NITs, IITs, SPAs Architecture Admission`,
    description: `List of NITs, IITs, and SPAs offering B.Arch under JoSAA counseling ${CURRENT_YEAR}. JEE Paper 2 cutoffs, fees, and admission process.`,
    alternates: buildAlternates(params.locale, '/colleges/josaa'),
  };
}

export default async function JoSAACollegesPage({ params }: PageProps) {
  setRequestLocale(params.locale);
  const colleges = await getJoSAAColleges();

  return (
    <Box sx={{ bgcolor: '#F5F7F9', minHeight: '100vh', pt: 3, pb: 6 }}>
      <Container maxWidth="lg">
        <Typography variant="h1" sx={{ fontSize: { xs: '1.3rem', md: '1.8rem' }, fontWeight: 700, mb: 0.5 }}>
          B.Arch Colleges Under JoSAA {CURRENT_YEAR}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={1}>
          {colleges.length} central institutions (NITs, IITs, SPAs) under JoSAA counseling
        </Typography>
        <Alert severity="info" sx={{ mb: 3, fontSize: 13 }}>
          JoSAA counseling is for NITs, IITs, and SPAs. Eligibility: JEE Main Paper 2 (B.Arch).
          Separate NATA score may also be required by some institutions.
        </Alert>
        <Stack spacing={1.5}>
          {colleges.map((c) => (
            <CollegeListingCard key={c.id} college={c} />
          ))}
          {!colleges.length && (
            <Typography color="text.secondary" textAlign="center" py={6}>
              JoSAA college data coming soon.
            </Typography>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/marketing/src/app/\[locale\]/colleges/
git commit -m "feat(college-hub): add all college listing pages (all-India, state, TNEA, JoSAA)"
```

---

## Task 18: Sitemap and llms.txt Updates

**Files:**
- Modify: `apps/marketing/src/app/sitemap.ts`
- Create: `apps/marketing/public/llms.txt`

- [ ] **Step 1: Add college pages to sitemap**

In `apps/marketing/src/app/sitemap.ts`, add the following imports and section inside the `sitemap()` function, after the existing "Center detail pages" section:

Add to imports at top:
```typescript
import { getAllCollegeSlugs, getActiveStates } from '@/lib/college-hub/queries';
```

Add inside the `sitemap()` function, before `return entries;`:
```typescript
  // ─── College Hub pages ───
  // College listing pages: all locales (UI is translated)
  for (const locale of locales) {
    entries.push({
      url: locale === 'en' ? `${baseUrl}/colleges` : `${baseUrl}/${locale}/colleges`,
      lastModified: new Date('2026-04-12'),
      changeFrequency: 'daily' as const,
      priority: 0.95,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, l === 'en' ? `${baseUrl}/colleges` : `${baseUrl}/${l}/colleges`])
        ),
      },
    });
  }

  // TNEA and JoSAA pages: English only (content is English)
  entries.push(
    { url: `${baseUrl}/colleges/tnea`, lastModified: new Date('2026-04-12'), changeFrequency: 'weekly' as const, priority: 0.9 },
    { url: `${baseUrl}/colleges/josaa`, lastModified: new Date('2026-04-12'), changeFrequency: 'weekly' as const, priority: 0.9 },
  );

  // State listing pages: English only
  try {
    const activeStates = await getActiveStates();
    for (const { slug } of activeStates) {
      entries.push({
        url: `${baseUrl}/colleges/${slug}`,
        lastModified: new Date('2026-04-12'),
        changeFrequency: 'weekly' as const,
        priority: 0.85,
      });
    }
  } catch (err) {
    console.error('Failed to fetch states for sitemap:', err);
  }

  // Individual college pages: English only (content is English data)
  try {
    const collegeSlugs = await getAllCollegeSlugs();
    for (const { state, slug } of collegeSlugs) {
      entries.push({
        url: `${baseUrl}/colleges/${state}/${slug}`,
        lastModified: new Date('2026-04-12'),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error('Failed to fetch college slugs for sitemap:', err);
  }
```

- [ ] **Step 2: Create llms.txt**

Create `apps/marketing/public/llms.txt`:

```
# Neram Classes — AI/LLM Reference Guide
# Updated: 2026-04-12
# This file helps AI systems understand the authoritative content on neramclasses.com

## About Neram Classes
Neram Classes is India's leading online NATA and JEE Paper 2 (B.Arch) coaching platform.
We provide comprehensive preparation for architecture entrance examinations.

## College Hub
Neram Classes maintains the most comprehensive database of COA-approved B.Arch architecture colleges in India.

### College Listing
All B.Arch colleges: https://neramclasses.com/colleges/
Tamil Nadu B.Arch colleges: https://neramclasses.com/colleges/tamil-nadu/
TNEA B.Arch colleges: https://neramclasses.com/colleges/tnea/
JoSAA B.Arch colleges (NITs/IITs): https://neramclasses.com/colleges/josaa/

### ArchIndex Rating
Neram's proprietary ArchIndex rates B.Arch colleges on a 0-100 scale.
Methodology: https://neramclasses.com/colleges/archindex-methodology/
Factors: Design Studio Quality (25%), Faculty (20%), Placements (20%), Infrastructure (15%), Student Satisfaction (10%), Alumni Network (10%)

## NATA Exam Resources
NATA 2026 complete guide: https://neramclasses.com/nata-2026/
NATA syllabus: https://neramclasses.com/nata-2026/syllabus/
NATA preparation tips: https://neramclasses.com/nata-2026/preparation-tips/
NATA previous year papers: https://neramclasses.com/nata-2026/previous-year-papers/
NATA important dates: https://neramclasses.com/nata-2026/important-dates/

## Courses
NATA coaching: https://neramclasses.com/courses/nata-coaching-online/
JEE Paper 2 coaching: https://neramclasses.com/courses/jee-paper-2-coaching/

## Tools
College predictor: https://neramclasses.com/tools/college-predictor/
Cutoff calculator: https://neramclasses.com/tools/cutoff-calculator/

## Sitemap
https://neramclasses.com/sitemap.xml
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/sitemap.ts apps/marketing/public/llms.txt
git commit -m "feat(college-hub): add college pages to sitemap + create llms.txt for AEO"
```

---

## Task 19: i18n Strings

**Files:**
- Modify: `apps/marketing/messages/en.json`
- Modify: `apps/marketing/messages/ta.json`

- [ ] **Step 1: Add college hub strings to en.json**

Add to `messages/en.json` (merge into existing JSON object):

```json
"collegeHub": {
  "listing": {
    "title": "B.Arch Architecture Colleges in India",
    "subtitle": "colleges found",
    "clearFilters": "Clear filters",
    "noResults": "No colleges found. Try removing some filters.",
    "filters": {
      "title": "Filters",
      "state": "State",
      "exam": "Entrance Exam",
      "type": "College Type",
      "naac": "NAAC Grade"
    }
  },
  "detail": {
    "overview": "Overview",
    "fees": "Fees",
    "admissions": "Admissions",
    "placements": "Placements",
    "infrastructure": "Infrastructure",
    "reviews": "Reviews",
    "claimProfile": "Claim this profile",
    "claimCTA": "Are you from this college? Update info and get student leads.",
    "similarColleges": "Similar Colleges",
    "feesNotAvailable": "Fee details not yet available.",
    "cutoffNotAvailable": "Cutoff history not yet available.",
    "placementNotAvailable": "Placement data not yet available.",
    "infraNotAvailable": "Infrastructure details not yet available."
  },
  "badges": {
    "coaApproved": "COA Approved",
    "verified": "Verified",
    "nba": "NBA"
  }
}
```

- [ ] **Step 2: Add stub strings to ta.json**

Add to `messages/ta.json` (Tamil stubs — full translations added later):

```json
"collegeHub": {
  "listing": {
    "title": "இந்தியாவில் B.Arch கல்லூரிகள்",
    "subtitle": "கல்லூரிகள் கண்டறியப்பட்டன",
    "clearFilters": "வடிகட்டிகளை அழிக்கவும்",
    "noResults": "கல்லூரிகள் எதுவும் கண்டறியப்படவில்லை.",
    "filters": {
      "title": "வடிகட்டிகள்",
      "state": "மாநிலம்",
      "exam": "நுழைவுத் தேர்வு",
      "type": "கல்லூரி வகை",
      "naac": "NAAC தரம்"
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/messages/en.json apps/marketing/messages/ta.json
git commit -m "feat(college-hub): add i18n strings for college hub (EN + TA)"
```

---

## Task 20: Type-Check and Verification

- [ ] **Step 1: Run TypeScript type-check**

```bash
cd c:/Users/Haribabu/Documents/AppsCopilot/2026/NeramEcosystem
pnpm type-check
```
Expected: 0 errors. Fix any type errors before proceeding.

- [ ] **Step 2: Start the marketing dev server**

```bash
pnpm dev:marketing
```
Expected: Compiled successfully on port 3010.

- [ ] **Step 3: Verify listing page**

Visit `http://localhost:3010/colleges/`

Expected:
- Page loads without errors
- College cards visible with names, locations, badges
- Filter sidebar visible on desktop (hidden on mobile)
- ArchIndex rings showing (grey if score is null, colored if score exists)

- [ ] **Step 4: Verify detail page**

Visit `http://localhost:3010/colleges/tamil-nadu/caad-chennai-architecture/`

Expected:
- HeroSection shows college name, city, badges
- NavPills visible and sticky
- FeeBreakdown shows "not available" message (no fee data yet — expected)
- CutoffSparkline shows "not available" message (no cutoff data yet — expected)
- ClaimProfileCTA banner visible (unclaimed colleges)
- Page JSON-LD in DevTools: `<script type="application/ld+json">` with CollegeOrUniversity schema

- [ ] **Step 5: Verify Tamil locale**

Visit `http://localhost:3010/ta/colleges/`

Expected: Page loads with Tamil heading "இந்தியாவில் B.Arch கல்லூரிகள்"

- [ ] **Step 6: Check for no horizontal scroll**

Open DevTools → Device Toolbar → iPhone SE (375px width). Scroll the listing page and detail page.

Expected: No horizontal overflow on either page.

- [ ] **Step 7: Run unit tests**

```bash
pnpm --filter @neram/marketing test
```
Expected: archindex tests pass (3 tests).

- [ ] **Step 8: Update progress tracker**

Update `apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md` — check off all completed Phase 1 items.

Add entry to session log:
```markdown
| 2026-04-12 | Phase 1 execution | All Phase 1 tasks complete | Ready for staging deploy |
```

- [ ] **Step 9: Final commit**

```bash
git add apps/marketing/Docs/COLLEGE_HUB_PROGRESS.md
git commit -m "chore(college-hub): update Phase 1 progress tracker — all tasks complete"
```

---

## Appendix: Self-Review Checklist

After implementing all tasks, verify spec coverage:

| Spec Section | Covered By | Status |
|---|---|---|
| §3 URL Structure | Task 16-17 (pages) | Phase 1 complete |
| §4 DB Schema (colleges) | Task 2 | Phase 1 complete |
| §4 DB Schema (fees, cutoffs, placements, infra, faculty) | Task 2 | Tables created, data TBD |
| §6 College Page Template | Task 14 | Complete |
| §7 Premium Tier (display only) | BadgePills in Task 7 | Display complete; gating in Phase 3 |
| §8 Listing + Filters | Task 13, 17 | Complete |
| §20 SEO meta tags | Task 15-16 | Complete |
| §20 JSON-LD CollegeOrUniversity | Task 15, 16 | Complete |
| §20 JSON-LD FAQPage | Task 15, 16 | Complete |
| §20 hreflang | All pages via buildAlternates() | Complete |
| §20 Sitemap | Task 18 | Complete |
| §20 llms.txt | Task 18 | Complete |
| §22 ArchIndex calculation | Task 5 | Complete (Phase 1 proxy) |
| §22 ArchIndex ring display | Task 6 | Complete |
| §23 Badge system | Task 7 | Phase 1 official badges complete |
| §9 Comparison tool | Not in Phase 1 | Phase 2 |
| §12 Reviews | Not in Phase 1 | Phase 2 |
| §13 Comments/Q&A | Not in Phase 1 | Phase 2 |
| §14 Ambassador program | Not in Phase 1 | Phase 3 |
| §15 Lead window | Not in Phase 1 | Phase 3 |
| §16 Aintra AI chat | Not in Phase 1 | Phase 3 |
| §17 Virtual tour | Not in Phase 1 | Phase 4 |
