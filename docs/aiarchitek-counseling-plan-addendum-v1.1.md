# AiNata Counseling Plan — Addendum v1.1

**Date:** March 6, 2026  
**What changed:** Added Rank Predictor tool, updated DB schema for full rank list + allotment list storage, updated tool chaining flow, updated implementation steps.

**This addendum supplements the main plan (counseling-plan-v1.md). Apply these changes on top of that document.**

---

## A. New Database Tables (Add to Section 5)

### Replace `rank_distributions` with TWO new tables:

```sql
-- ============================================
-- TABLE 5A: RANK LIST ENTRIES
-- Every student from rank list PDFs (anonymized — no names stored)
-- Used for: Score → Rank prediction
-- ============================================
CREATE TABLE rank_list_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id),
  year INTEGER NOT NULL,
  serial_number INTEGER,                     -- S.NO from PDF
  rank INTEGER NOT NULL,                     -- Overall rank
  -- Score breakdown (available in rank list format)
  hsc_aggregate_mark DECIMAL(10,4),          -- Board marks (normalized)
  entrance_exam_mark DECIMAL(10,4),          -- NATA or JEE score
  aggregate_mark DECIMAL(10,4) NOT NULL,     -- Composite score (HSC + NATA)
  -- Category info
  community TEXT NOT NULL,                   -- 'OC', 'BC', 'BCM', 'MBC', 'SC', 'SCA', 'ST'
  community_rank INTEGER,                    -- Rank within category
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(counseling_system_id, year, rank)
);

CREATE INDEX idx_rank_entries_system_year ON rank_list_entries(counseling_system_id, year);
CREATE INDEX idx_rank_entries_score ON rank_list_entries(counseling_system_id, year, aggregate_mark);
CREATE INDEX idx_rank_entries_community ON rank_list_entries(counseling_system_id, year, community);
CREATE INDEX idx_rank_entries_rank ON rank_list_entries(counseling_system_id, year, rank);


-- ============================================
-- TABLE 5B: ALLOTMENT LIST ENTRIES
-- Every student from allotment list PDFs (anonymized — no names stored)
-- Used for: College-specific predictions, "who got which college"
-- ============================================
CREATE TABLE allotment_list_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id),
  year INTEGER NOT NULL,
  serial_number INTEGER,
  rank INTEGER NOT NULL,
  aggregate_mark DECIMAL(10,4) NOT NULL,
  community TEXT NOT NULL,
  -- Allotment details (unique to allotment lists)
  college_code TEXT NOT NULL,                -- Code of allotted college
  college_id UUID REFERENCES colleges(id),   -- FK to colleges table (resolved during import)
  branch_code TEXT NOT NULL,                 -- 'AR', 'BA', etc.
  allotted_category TEXT NOT NULL,           -- Category under which seat was allotted (may differ from student's community)
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_allotment_system_year ON allotment_list_entries(counseling_system_id, year);
CREATE INDEX idx_allotment_college ON allotment_list_entries(college_id, year);
CREATE INDEX idx_allotment_rank ON allotment_list_entries(counseling_system_id, year, rank);
```

### Column Format Differences by Year

The schema handles both formats because:

| Column | 2025 Rank List | 2024 Allotment List | 2023 Rank List |
|--------|---------------|---------------------|----------------|
| serial_number | ✅ S NO | ✅ S NO | ✅ (derived from row) |
| rank | ✅ RANK | ✅ RANK | ✅ RANK |
| hsc_aggregate_mark | ✅ HSC AGGREGATE MARK | ❌ Not available | ✅ HSC AGGREGATE MARK |
| entrance_exam_mark | ✅ NATA/JEE MARK | ❌ Not available | ✅ NATA / JEE MARK |
| aggregate_mark | ✅ AGGREGATE MARK | ✅ AGGR MARK | ✅ AGGREGATE MARK |
| community | ✅ COMMUNITY | ✅ COMMUNITY | ✅ COMMUNITY |
| community_rank | ✅ COMMUNITY RANK | ❌ Not available | ✅ COMMUNITY RANK |
| college_code | ❌ Not in rank list | ✅ COLLGE CODE | ❌ Not in rank list |
| branch_code | ❌ Not in rank list | ✅ BRANCH CODE | ❌ Not in rank list |
| allotted_category | ❌ Not in rank list | ✅ ALLOTTED CATEGORY | ❌ Not in rank list |
| name | ❌ Not in 2025 | ✅ (NOT STORED) | ✅ (NOT STORED) |
| dob | ❌ Not in 2025 | ✅ (NOT STORED) | ✅ (NOT STORED) |
| application_no | ✅ (NOT STORED) | ✅ (NOT STORED) | ✅ (NOT STORED) |

**Privacy rule:** Name, DOB, and Application Number are NEVER stored in the database even if present in the PDF. Only anonymized data (rank, scores, category) is stored.

---

## B. Rank Predictor Tool (Add to Section 3)

### B.1 Tool Identity

- **Name:** Rank Predictor
- **Location:** `app.neramclasses.com/rank-predictor`
- **Relationship:** Standalone tool, but also chained from Cutoff Calculator

### B.2 Tool Chaining Flow

The three tools chain together but each works independently:

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  CUTOFF           │     │  RANK             │     │  COLLEGE          │
│  CALCULATOR       │────▶│  PREDICTOR        │────▶│  PREDICTOR        │
│                   │     │                   │     │  (aiArchitek)     │
│  Input: Board     │     │  Input: Composite │     │  Input: Predicted │
│  marks + NATA     │     │  score OR         │     │  rank + category  │
│                   │     │  direct entry     │     │                   │
│  Output: Cutoff   │     │  Output: Predicted│     │  Output: Colleges │
│  per counseling   │     │  rank + similar   │     │  (Safe/Moderate/  │
│                   │     │  students         │     │  Reach)           │
│  CTA: "View your  │     │  CTA: "See which  │     │                   │
│  predicted rank →"│     │  colleges you     │     │                   │
│                   │     │  can get →"       │     │                   │
└──────────────────┘     └──────────────────┘     └──────────────────┘

Each tool also works independently:
- Student can go directly to Rank Predictor and enter their composite score
- Student can go directly to College Predictor and enter their rank
- But the chained flow is the recommended path
```

### B.3 Rank Predictor — User Flow

**Step 1: Input**

Two entry paths:
- **From Cutoff Calculator:** Composite score is pre-filled, counseling system is pre-selected
- **Direct entry:** Student enters their composite score manually and selects counseling system

```
┌─────────────────────────────────────────────────┐
│  NATA Rank Predictor                            │
│                                                 │
│  Counseling System: [TNEA B.Arch ▼]            │
│                                                 │
│  Your Composite Score: [312] / 400              │
│                                                 │
│  Your Category: [BC ▼]                          │
│                                                 │
│  [Predict My Rank →]                            │
└─────────────────────────────────────────────────┘
```

**Step 2: Year-Specific Predictions (Default View)**

Default shows prediction based on latest year. Year switcher available.

```
┌─────────────────────────────────────────────────┐
│  Your Predicted Rank                            │
│  📊 Based on: [2025 ▼] data                    │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Overall Rank: ~150 - 190                 │  │
│  │  BC Category Rank: ~82 - 105              │  │
│  │                                           │  │
│  │  1,300 total candidates in 2025           │  │
│  │  Your score of 312 places you in the      │  │
│  │  top 12-15% of all applicants.            │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Students with similar scores (2025):           │
│  ┌──────┬──────────┬──────┬──────┬───────────┐  │
│  │ Rank │ HSC Mark │ NATA │ Total│ Category  │  │
│  ├──────┼──────────┼──────┼──────┼───────────┤  │
│  │  46  │ 167.0    │ 124  │ 291  │ BC        │  │
│  │  47  │ 186.8    │ 104  │ 290.8│ MBC       │  │
│  │  ...shows students ±5 marks of input...   │  │
│  └──────┴──────────┴──────┴──────┴───────────┘  │
│                                                 │
│  [See which colleges you can get →]             │
└─────────────────────────────────────────────────┘
```

**Step 3: Combined View (All Years)**

Below the year-specific view, show the combined prediction:

```
┌─────────────────────────────────────────────────┐
│  📈 Historical Trend (All Years)                │
│                                                 │
│  With a score of 312, your expected rank        │
│  across all years:                              │
│                                                 │
│  Year  │ Total Students │ Your Est. Rank │ %ile │
│  ──────┼────────────────┼────────────────┼──────│
│  2025  │    1,300       │    150-190     │  86% │
│  2024  │    1,430       │    170-210     │  87% │
│  2023  │    1,400       │    155-195     │  86% │
│  2022  │    1,250       │    140-175     │  86% │
│  2021  │    1,100       │    125-160     │  85% │
│  2020  │    1,050       │    120-150     │  86% │
│  ──────┼────────────────┼────────────────┼──────│
│  OVERALL│  Avg ~1,250   │   145-195     │  ~86%│
│                                                 │
│  💡 Your score consistently places you in the   │
│  top 14-15% regardless of year. Competition     │
│  level has been relatively stable.              │
└─────────────────────────────────────────────────┘
```

**Step 4: Similar Students Detail**

When showing "students with similar scores," display anonymized records from the rank list:

- Show students whose aggregate_mark is within ±5 marks of the input score
- Display: Rank, HSC Mark, NATA Mark, Aggregate, Category, Category Rank
- NO names, NO application numbers, NO DOB
- Sorted by rank
- Show up to 20 nearest matches
- User can expand to see more

This lets students see real data like "a student with HSC 175 and NATA 137 = 312 got Rank 47 in BC category in 2025."

### B.4 Rank Predictor — Algorithm

```
PREDICT RANK FROM SCORE:

1. INPUT: composite_score, counseling_system, category, selected_year

2. YEAR-SPECIFIC PREDICTION:
   a. Query rank_list_entries WHERE system = X AND year = Y
   b. Find entries with aggregate_mark closest to input score
   c. Get the rank range of entries within ±2 marks of input
   d. If exact matches exist: rank range = min_rank to max_rank of matches
   e. If no exact: interpolate between nearest lower and upper entries
   f. Apply ±10% buffer for safety band
   g. For category rank: filter by community, apply same logic

3. SIMILAR STUDENTS:
   a. Query rank_list_entries WHERE system = X AND year = Y
      AND aggregate_mark BETWEEN (input - 5) AND (input + 5)
   b. Return anonymized records sorted by rank
   c. Limit to 20 records

4. COMBINED PREDICTION (all years):
   a. Run step 2 for each available year
   b. Calculate percentile for each year: (total_candidates - predicted_rank) / total_candidates
   c. Show table of year-wise predictions
   d. Calculate overall range: min of all lower bounds, max of all upper bounds
   e. Calculate average percentile across years

5. OUTPUT:
   - Predicted rank range (year-specific)
   - Category rank range (year-specific)
   - Percentile position
   - Similar students table (anonymized)
   - Combined prediction table
   - CTA to College Predictor
```

---

## C. Updated Cutoff Calculator Integration (Modify Section 3)

The existing cutoff calculator on app.neramclasses.com gets a new CTA after calculation:

```
After student calculates cutoff:

┌─────────────────────────────────────────────────┐
│  Your TNEA B.Arch Cutoff: 312 / 400            │
│  (HSC: 185 + NATA: 127)                        │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  🎯 What's next?                         │  │
│  │                                           │  │
│  │  [View Your Predicted Rank →]             │  │
│  │  See where you stand among all applicants │  │
│  │                                           │  │
│  │  [Find Colleges You Can Get →]            │  │
│  │  Predict which colleges match your score  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

Clicking "View Your Predicted Rank" passes the score and counseling system to the rank predictor via URL params:
`app.neramclasses.com/rank-predictor?system=TNEA_BARCH&score=312&category=BC`

Clicking "Find Colleges" passes to college predictor:
`app.neramclasses.com/architek/predict?system=TNEA_BARCH&score=312&category=BC`

---

## D. Updated Admin Panel (Add to Section 4)

### D.1 Rank List Data Management

New section in admin panel for importing rank list PDFs:

**Import Flow:**
1. Select counseling system (TNEA B.Arch)
2. Select year (2025)
3. Select document type: "Rank List" or "Allotment List"
4. Upload CSV (extracted from PDF)
5. Column mapping preview — admin confirms which CSV column maps to which DB field
6. Data preview — show first 20 rows parsed
7. Validation checks:
   - Ranks are sequential (no gaps)
   - Aggregate = HSC + NATA (for rank lists with breakdown)
   - No duplicate ranks
   - Categories match the counseling system's category list
8. Import confirmation: "Import 1,300 rank list entries for TNEA B.Arch 2025?"
9. Progress indicator during import

**CSV Template per Document Type:**

Rank List CSV template:
```
serial_number,rank,hsc_aggregate_mark,entrance_exam_mark,aggregate_mark,community,community_rank
1,1,185.600,150,335.600,BCM,1
2,2,178.400,156,334.400,BC,1
...
```

Allotment List CSV template:
```
serial_number,rank,aggregate_mark,community,college_code,branch_code,allotted_category
1,8,352.667,BC,3,AR,OC
2,11,352.000,SC,1308,AR,OC
...
```

### D.2 Rank List Data Viewer

- Table view of all entries for selected system + year
- Search by rank range or score range
- Filter by category
- Stats summary: total entries, score range, category distribution
- Export to CSV

---

## E. Updated Tool URLs (Modify Section 3.1)

```
app.neramclasses.com/cutoff-calculator       → Existing tool (enhanced with CTAs)
app.neramclasses.com/rank-predictor          → NEW: Rank Predictor
app.neramclasses.com/architek                → College Predictor (direction picker)
app.neramclasses.com/architek/predict        → Forward prediction flow
app.neramclasses.com/architek/target         → Reverse prediction flow
```

---

## F. Updated Implementation Steps (Replace Section 8)

### Phase 1: Database (Week 1-2)
- [ ] Create all tables including new `rank_list_entries` and `allotment_list_entries`
- [ ] Set up RLS policies
- [ ] Seed TNEA B.Arch counseling system config
- [ ] Seed 30+ TN B.Arch colleges

### Phase 2: Data Import (Week 2-3)
- [ ] Import 2024 mark + rank cutoffs → `historical_cutoffs`
- [ ] Import 2025 rank list (full ~1,300 entries) → `rank_list_entries`
- [ ] Import 2024 allotment list → `allotment_list_entries`
- [ ] Import 2023 rank list → `rank_list_entries`
- [ ] Import 2023 cutoff data → `historical_cutoffs`
- [ ] Repeat for 2022, 2021, 2020

### Phase 3: Admin Panel (Week 3-4)
- [ ] College CRUD
- [ ] Cutoff data CRUD + CSV import
- [ ] Rank list data import (CSV upload with column mapping + validation)
- [ ] Allotment list data import
- [ ] Audit log

### Phase 4: Rank Predictor Tool (Week 4-5)
- [ ] Input screen (composite score + system + category)
- [ ] Year-specific rank prediction
- [ ] Similar students display (anonymized)
- [ ] Combined all-years prediction table
- [ ] Year switcher
- [ ] CTA to college predictor

### Phase 5: Update Cutoff Calculator (Week 5)
- [ ] Add "View Your Predicted Rank →" CTA after calculation
- [ ] Add "Find Colleges →" CTA
- [ ] Pass score/system/category via URL params to linked tools

### Phase 6: College Predictor (aiArchitek) (Week 5-7)
- [ ] Direction picker (Forward vs Reverse)
- [ ] Forward flow with allotment data integration
- [ ] Reverse flow
- [ ] College cards + year switcher

### Phase 7: Counseling Hub — Marketing Site (Week 7-8)
- [ ] Parent page `/counseling`
- [ ] TNEA B.Arch spoke page
- [ ] Basic college pages

### Phase 8: Expand (Week 8+)
- [ ] KEAM Architecture (Kerala)
- [ ] JoSAA B.Arch
- [ ] KEA B.Arch (Karnataka)
- [ ] Continue state by state

---

## G. Data Volume Estimates

| Table | TNEA B.Arch Only | Pan-India (Future) |
|-------|------------------|--------------------|
| colleges | ~30 rows | ~400 rows |
| counseling_systems | 1 row | ~20 rows |
| college_counseling_participation | ~30 rows/year | ~400 rows/year |
| historical_cutoffs | ~200 rows/year (30 colleges × 7 categories) | ~3,000 rows/year |
| rank_list_entries | ~1,300 rows/year × 6 years = ~7,800 | ~50,000+ rows |
| allotment_list_entries | ~600 rows/year × available years | ~20,000+ rows |
| audit_log | Grows over time | Grows over time |

Total for TNEA B.Arch MVP: ~10,000-12,000 rows across all tables. Well within Supabase free/pro tier limits.

---

*End of Addendum v1.1 — Merge with counseling-plan-v1.md before executing in Claude Code.*
