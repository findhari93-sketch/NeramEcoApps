# COA College Approval Checker — CLAUDE.md

## Project Overview

Build a **COA College Approval Checker** tool for the Neram Classes monorepo. This is a shared React component that verifies whether B.Arch colleges are currently approved by the Council of Architecture (India). It serves ~362 institutions scraped from ecoa.in.

**Apps:** app.neramclasses.com + aiArchitek college hub (shared component)
**Stack:** React + MUI v5 + Supabase + Recharts. **No TypeScript.**
**Design System:** AiNata — dark blueprint theme, MUI v5, Cormorant Garamond headings, DM Sans body

---

## Why This Tool Exists

1. Many B.Arch colleges operate with expired/pending COA approval — students discover too late
2. ecoa.in is clunky and not mobile-friendly
3. Approval periods change yearly — 2024-25 approved ≠ 2025-26 approved
4. Parents making ₹20-50 lakh decisions need instant, trustworthy verification
5. Every student checking a college = potential Neram Classes lead

---

## Approval Period Logic

The COA data uses specific period formats. Interpretation for 2025-26 admission cycle:

| Approval Period in Data | Status | Label | Color | Meaning |
|---|---|---|---|---|
| `2024-2025 & 2025-2026` | `active` | ✅ Active (2025-26) | `#10b981` green | Confirmed approved. Safe to join. |
| `2024-2025` (only) | `expiring` | ⚠️ Valid till 2025 | `#f59e0b` amber | Was approved last year. 2025-26 renewal not yet confirmed. Verify with college. |
| Not in list | `not_found` | ❌ Not Found | `#ef4444` red | Not in COA list. Degree may not be recognized. Do NOT join without verifying with COA. |

**Important:** "2024-2025 & 2025-2026" means approved through the 2025-26 academic year. Both formats are technically valid for TNEA 2025 / NATA 2025 admissions, but we surface the distinction.

---

## Supabase Schema

### Table: `coa_institutions`

```sql
-- Enable fuzzy search extension first
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE coa_institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_code text UNIQUE NOT NULL,          -- e.g., AP02, TN01, KA03
  name text NOT NULL,                              -- Full institution name
  head_of_dept text,                               -- HOD name from COA listing
  address text,                                    -- Full address as listed
  city text NOT NULL,                              -- City (extracted/normalized)
  state text NOT NULL,                             -- State (normalized: "Tamil Nadu" not "TAMIL NADU")
  pincode text,
  affiliating_university text,                     -- University name
  course_name text NOT NULL DEFAULT 'Bachelor of Architecture',
  commenced_year integer,                          -- Year course started
  current_intake integer,                          -- Approved seat count
  approval_period_raw text NOT NULL,               -- Raw: "2024-2025 & 2025-2026"
  approval_status text NOT NULL DEFAULT 'unknown', -- Computed: active / expiring / unknown
  valid_for_2025_26 boolean NOT NULL DEFAULT false, -- true if period includes "2025-2026"
  phone text,
  fax text,
  email text,
  mobile text,
  website text,
  data_source_url text DEFAULT 'https://ecoa.in/academic/public/Apporved-Institution-Ug-List',
  last_scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_coa_state ON coa_institutions(state);
CREATE INDEX idx_coa_city ON coa_institutions(city);
CREATE INDEX idx_coa_name_search ON coa_institutions USING gin(name gin_trgm_ops);
CREATE INDEX idx_coa_code ON coa_institutions(institution_code);
CREATE INDEX idx_coa_status ON coa_institutions(approval_status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_coa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coa_updated_at
  BEFORE UPDATE ON coa_institutions
  FOR EACH ROW EXECUTE FUNCTION update_coa_updated_at();

-- RLS: Public read-only
ALTER TABLE coa_institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON coa_institutions
  FOR SELECT TO anon, authenticated USING (true);
```

### Materialized View: `coa_state_stats`

Pre-computed stats for the dashboard. Refresh after any data update.

```sql
CREATE MATERIALIZED VIEW coa_state_stats AS
SELECT
  state,
  COUNT(*) as college_count,
  COALESCE(SUM(current_intake), 0) as total_seats,
  COUNT(*) FILTER (WHERE approval_status = 'active') as active_colleges,
  COALESCE(SUM(current_intake) FILTER (WHERE approval_status = 'active'), 0) as active_seats,
  COUNT(*) FILTER (WHERE approval_status = 'expiring') as expiring_colleges,
  MIN(commenced_year) as oldest_program,
  MAX(commenced_year) as newest_program
FROM coa_institutions
GROUP BY state
ORDER BY total_seats DESC;

-- Refresh command (run after data seeding or updates):
-- REFRESH MATERIALIZED VIEW coa_state_stats;
```

### Supabase Function: Fuzzy Search

```sql
CREATE OR REPLACE FUNCTION search_coa_colleges(search_term text, result_limit integer DEFAULT 10)
RETURNS SETOF coa_institutions AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM coa_institutions
  WHERE
    name ILIKE '%' || search_term || '%'
    OR institution_code ILIKE '%' || search_term || '%'
    OR city ILIKE '%' || search_term || '%'
    OR affiliating_university ILIKE '%' || search_term || '%'
  ORDER BY
    -- Exact code match first
    CASE WHEN institution_code ILIKE search_term THEN 0 ELSE 1 END,
    -- Then similarity score
    similarity(name, search_term) DESC
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;
```

---

## Data Seeding

Hari already has scraped data from ecoa.in. Seeding workflow:

### Step 1: Prepare CSV

Map scraped columns to schema. Required normalizations:

```
State normalization:
  "ANDHRA PRADESH" → "Andhra Pradesh"
  "TAMIL NADU" → "Tamil Nadu"
  "KARNATAKA" → "Karnataka"
  ... (Title Case all state names)

City extraction:
  If city not a separate field, extract from address before first comma or "Pin code"

approval_status computation:
  IF approval_period_raw CONTAINS "2025-2026" → "active"
  ELSE IF approval_period_raw CONTAINS "2024-2025" → "expiring"
  ELSE → "unknown"

valid_for_2025_26 computation:
  IF approval_period_raw CONTAINS "2025-2026" → true
  ELSE → false
```

### Step 2: Seed via Supabase

Option A — Dashboard CSV import (simplest for ~362 rows):
1. Go to Supabase Dashboard → Table Editor → coa_institutions
2. Click "Import from CSV"
3. Map columns

Option B — CLI seed script:
```bash
# Using supabase CLI with a seed file
supabase db seed --file seed_coa.sql
```

### Step 3: Post-seed

```sql
REFRESH MATERIALIZED VIEW coa_state_stats;
```

---

## React Component Architecture

### File Structure

```
packages/shared/src/components/coa-checker/
├── index.js                   # Exports COAApprovalChecker
├── COAApprovalChecker.jsx     # Main wrapper with tab navigation
├── COASearchBar.jsx           # Autocomplete search (hero feature)
├── COAResultCard.jsx          # Single college verdict card
├── COACollegeList.jsx         # Filtered list with state/city/status filters
├── COAStatsDashboard.jsx      # Charts + summary stats
├── COAStatusBadge.jsx         # Reusable status chip
├── hooks/
│   ├── useCOASearch.js        # Debounced Supabase search query
│   ├── useCOAData.js          # Filtered list query with pagination
│   └── useCOAStats.js         # Stats from materialized view
└── constants.js               # Status colors, labels, state list
```

### Design System Tokens (AiNata)

```js
// constants.js
export const COA_THEME = {
  colors: {
    navy: '#0F172A',
    navyLight: '#1E293B',
    gold: '#C8A850',
    goldLight: '#E8D08A',
    blue: '#3B82F6',
    blueLight: '#60A5FA',
    slate: '#94A3B8',
    slateLight: '#CBD5E1',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    bgCard: 'rgba(15,23,42,0.9)',
    bgCardHover: 'rgba(30,41,59,0.95)',
    statusActive: '#10B981',
    statusExpiring: '#F59E0B',
    statusNotFound: '#EF4444',
  },
  fonts: {
    heading: "'Cormorant Garamond', serif",
    body: "'DM Sans', sans-serif",
  },
};

export const APPROVAL_STATUSES = {
  active: { label: 'Active (2025-26)', color: '#10B981', bgAlpha: '1A', icon: '✅' },
  expiring: { label: 'Valid till 2025', color: '#F59E0B', bgAlpha: '1A', icon: '⚠️' },
  unknown: { label: 'Check with COA', color: '#EF4444', bgAlpha: '1A', icon: '❌' },
};

// All Indian states where B.Arch colleges exist (sorted)
export const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];
```

---

## Component Specifications

### 1. COAApprovalChecker.jsx (Main Wrapper)

```
Purpose: Entry point. Tab navigation between Check / Explore / Stats.
Props: None (self-contained, uses Supabase client from context)
State:
  - activeTab: 'check' | 'explore' | 'stats'

Layout:
  ┌─────────────────────────────────────────┐
  │ [A] aiArchitek · Neram Classes          │
  │ COA College Approval Checker            │
  │ Browse 362 COA-approved B.Arch...       │
  │                                         │
  │ [🔍 Check] [📋 Explore] [📊 Stats]     │
  ├─────────────────────────────────────────┤
  │                                         │
  │  {Active tab content}                   │
  │                                         │
  └─────────────────────────────────────────┘

MUI Components: Box, Tabs, Tab, Typography
```

### 2. COASearchBar.jsx (Hero Search)

```
Purpose: Autocomplete search. The main feature students use.
Props: onSelect(college) — callback when a college is selected

Behavior:
  - MUI Autocomplete with freeSolo
  - Debounce input 300ms
  - Calls search_coa_colleges() Supabase RPC on each keystroke
  - Shows matches as: "[CODE] Name — City, State"
  - On select → passes full college object to parent
  - Empty state: "Type a college name, code, or city..."
  - No results: "No matching college found in COA list"

Supabase Query:
  const { data } = await supabase.rpc('search_coa_colleges', {
    search_term: query,
    result_limit: 10
  });
```

### 3. COAResultCard.jsx (Verdict Card)

```
Purpose: Shows the approval verdict for a selected college.
Props: college (object from search result)

Layout:
  ┌─────────────────────────────────────────┐
  │  [AP02]  [✅ Active (2025-26)]          │
  │                                         │
  │  Faculty of Architecture, Andhra Univ   │
  │  Visakhapatnam, Andhra Pradesh          │
  │                                         │
  │  ┌──────────┐  ┌──────────┐             │
  │  │ 40 Seats │  │ Est 1989 │             │
  │  └──────────┘  └──────────┘             │
  │                                         │
  │  University: Andhra University          │
  │  Approval: 2024-2025 & 2025-2026       │
  │                                         │
  │  [▼ Show Contact Details]               │
  │  ──────────────────────                 │
  │  Phone: 0891-2844973                    │
  │  Email: auarchhod@gmail.com             │
  │  Website: andhrauniversity.edu.in       │
  │                                         │
  │  [Check Another] [Explore AP Colleges]  │
  └─────────────────────────────────────────┘

Status badge uses COAStatusBadge component.
Expand/collapse for contact details.
"Check Another" resets search. "Explore X Colleges" switches to Explore tab with state pre-filtered.
```

### 4. COACollegeList.jsx (Explorer)

```
Purpose: Browse all colleges with filters.
Props: initialState (optional, for pre-filtering from result card)

State:
  - stateFilter: string | 'all'
  - cityFilter: string | 'all' (dynamic options based on state)
  - statusFilter: 'all' | 'active' | 'expiring'
  - sortBy: 'name' | 'intake' | 'commenced' | 'state'
  - page: number (pagination, 20 per page)

Layout:
  ┌─────────────────────────────────────────┐
  │ Filters:                                │
  │ [State ▼] [City ▼] [Status ▼] [Sort ▼] │
  │                                         │
  │ Showing 24 of 362 colleges              │
  │                                         │
  │ ┌── College Card ──────────────────┐    │
  │ │ [TN01] [✅ Active]               │    │
  │ │ Anna University - SAP            │    │
  │ │ Chennai, TN · Est 1957 · 60 seats│    │
  │ └──────────────────────────────────┘    │
  │ ┌── College Card ──────────────────┐    │
  │ │ ...                              │    │
  │ └──────────────────────────────────┘    │
  │                                         │
  │ [← Prev] Page 1 of 5 [Next →]          │
  └─────────────────────────────────────────┘

Supabase Query:
  let query = supabase.from('coa_institutions').select('*', { count: 'exact' });
  if (stateFilter !== 'all') query = query.eq('state', stateFilter);
  if (cityFilter !== 'all') query = query.eq('city', cityFilter);
  if (statusFilter !== 'all') query = query.eq('approval_status', statusFilter);
  query = query.order(sortBy, { ascending: sortBy !== 'intake' });
  query = query.range(page * 20, (page + 1) * 20 - 1);

City dropdown: Dynamically populated based on selected state
  const { data: cities } = await supabase
    .from('coa_institutions')
    .select('city')
    .eq('state', stateFilter)
    .order('city');
```

### 5. COAStatsDashboard.jsx

```
Purpose: Aggregated insights with charts.

Layout:
  ┌─────────────────────────────────────────┐
  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
  │ │ 362  │ │18,500│ │ 310  │ │  28  │    │
  │ │Colleg│ │Seats │ │Active│ │States│    │
  │ └──────┘ └──────┘ └──────┘ └──────┘    │
  │                                         │
  │ Seats by State (Top 10)                 │
  │ ┌─────────────────────────────────┐     │
  │ │ ████████████████████ TN  2,400  │     │
  │ │ █████████████████ MH  2,100     │     │
  │ │ ████████████████ KA  1,900      │     │
  │ │ ...                             │     │
  │ └─────────────────────────────────┘     │
  │                                         │
  │ Colleges by City (Top 10)               │
  │ ┌─────────────────────────────────┐     │
  │ │ ████████████████ Bengaluru  18  │     │
  │ │ ██████████████ Chennai  15      │     │
  │ │ ...                             │     │
  │ └─────────────────────────────────┘     │
  │                                         │
  │ Approval Status Distribution            │
  │ [===== Active 85% =====][Exp 12%][?3%]  │
  └─────────────────────────────────────────┘

Supabase Query (from materialized view):
  const { data } = await supabase.from('coa_state_stats').select('*');

Charts: Use Recharts BarChart (horizontal) with AiNata theme colors.
  - Bar fill: linear gradient #3B82F6 → #60A5FA
  - Top bar (rank 1): gold accent #C8A850
  - Background: transparent
  - Text: #94A3B8
  - Grid lines: rgba(148,163,184,0.1)
```

### 6. COAStatusBadge.jsx

```
Purpose: Reusable chip showing approval status.
Props:
  - status: 'active' | 'expiring' | 'unknown'
  - size: 'small' | 'medium' (default: 'small')

Uses MUI Chip with custom styling from APPROVAL_STATUSES constant.
Background: status color at 10% opacity
Text: status color at full
Font: DM Sans, uppercase, letter-spacing 0.5
```

---

## UX Flow

### Primary Flow: "Is My College Approved?"

1. Student lands on tool (via NATA content, SEO, or navigation)
2. Sees prominent search bar: "Type your college name to check COA approval"
3. Types college name → Autocomplete shows matches
4. Selects college → Large verdict card with status badge
5. Reviews: approval period, intake, university, contact info
6. Optional: "Explore all colleges in [state]" → filtered list
7. Lead capture: "Get personalized college recommendations → Sign up"

### Edge Case: College Not Found

If search returns no results:
- Show message: "No matching college found in the COA approved list"
- Disclaimer: "This may mean the college is not approved, or our data hasn't been updated. Always verify directly with COA at coa.gov.in"
- Link to ecoa.in for direct verification
- CTA: "Need help choosing a COA-approved college? Talk to our counselors."

### Edge Case: Ambiguous Search

If multiple close matches (e.g., "Anna University" matches both SAP and affiliated colleges):
- Show all matches in autocomplete dropdown
- Let user select the specific one
- Show institution code prominently to differentiate

---

## Integration Points

This tool is the **trust layer** for the aiArchitek ecosystem:

| Tool | Connection |
|---|---|
| **Rank Predictor** | After predicting rank, show only COA-approved colleges the student can get into |
| **Cutoff Calculator** | Cutoff data is meaningless for non-approved colleges. COA validates the list |
| **College Predictor** | Core dependency. MUST only recommend COA-approved institutions |
| **NATA Exam Center Locator** | Cross-link: "Exam centers near you" → "Approved colleges near you" |
| **Fee Calculator** | Link fee estimates to verified approved institutions only |
| **AI Chatbot (RAG)** | Include COA data in RAG knowledge base for "Is XYZ approved?" questions |

---

## SEO Strategy

### Target Keywords

- "is [college name] COA approved" — long-tail, high intent
- "COA approved architecture colleges in Tamil Nadu" — state-level
- "COA approved colleges list 2025-26" — authority page
- "B.Arch college verification India" — problem-aware
- "NATA accepted colleges" — cross-link from NATA content

### State-wise Landing Pages

Create at `neramclasses.com/coa-approved-colleges/[state-slug]`:

- `/coa-approved-colleges/tamil-nadu` — Primary market
- `/coa-approved-colleges/karnataka`
- `/coa-approved-colleges/kerala`
- `/coa-approved-colleges/andhra-pradesh`
- `/coa-approved-colleges/maharashtra`

Each page: State stats summary + pre-filtered college list + NATA prep CTA.

---

## Implementation Phases

### Phase 1: Data & Schema (Day 1)
- [ ] Create `coa_institutions` table in Supabase
- [ ] Enable `pg_trgm` extension
- [ ] Create `search_coa_colleges()` function
- [ ] Normalize and clean scraped CSV
- [ ] Compute `approval_status` and `valid_for_2025_26`
- [ ] Seed data via Supabase dashboard
- [ ] Create `coa_state_stats` materialized view
- [ ] Enable RLS with public read policy
- [ ] Verify: query from Supabase client works

### Phase 2: Core Components (Days 2-3)
- [ ] Create `constants.js` with theme tokens and status config
- [ ] Build `COAStatusBadge.jsx`
- [ ] Build `COASearchBar.jsx` with MUI Autocomplete + `useCOASearch` hook
- [ ] Build `COAResultCard.jsx` with expandable contact details
- [ ] Build `COAApprovalChecker.jsx` wrapper with tabs
- [ ] Test Check tab with real data

### Phase 3: Explorer & Stats (Days 4-5)
- [ ] Build `useCOAData` hook with filters + pagination
- [ ] Build `COACollegeList.jsx` with filter dropdowns
- [ ] Build `useCOAStats` hook
- [ ] Build `COAStatsDashboard.jsx` with Recharts
- [ ] Wire up cross-tab navigation (result card → explore)

### Phase 4: Integration & SEO (Days 6-7)
- [ ] Add to app.neramclasses.com route + navigation
- [ ] Add to aiArchitek section route
- [ ] Create state-wise landing page template on neramclasses.com
- [ ] Add meta tags + EducationalOrganization structured data
- [ ] Cross-link from NATA content hub spoke pages
- [ ] Add lead capture CTA

---

## Notes

- **No TypeScript** — plain JS throughout
- **MUI v5** — use `sx` prop for styling, not styled-components
- **Supabase client** — import from existing shared config in monorepo
- **Recharts** — already available in monorepo deps
- **Mobile-first** — most students browse on phones. All layouts must be responsive.
- **Dark theme** — all components use AiNata dark blueprint background
- **Font imports** — Cormorant Garamond + DM Sans via Google Fonts (already in app shell)
- Data is ~362 rows. No need for virtualization. Simple pagination (20/page) is fine.
- Materialized view must be manually refreshed after data updates. Consider a Supabase Edge Function or cron for periodic refresh if data updates frequently.
