# AiNata Counseling Intelligence — Comprehensive Implementation Plan

**Version:** 1.0 | **Date:** March 6, 2026 | **Status:** Approved for Implementation  
**Scope:** Counseling Hub (neramclasses.com) + aiArchitek Tool (app.neramclasses.com) + Admin Panel (admin.neramclasses.com)  
**First Target:** TNEA B.Arch (Tamil Nadu)

---

## Table of Contents

1. Product Overview & Architecture
2. Counseling Hub — Marketing Site (neramclasses.com)
3. aiArchitek Tool — Tools App (app.neramclasses.com)
4. Admin Panel — Data Management (admin.neramclasses.com)
5. Database Schema — Supabase (Existing Project)
6. Data Flow Between Systems
7. TNEA B.Arch — First Implementation
8. Implementation Roadmap
9. Future: College Hub & Pan-India Expansion

---

## 1. Product Overview & Architecture

### 1.1 The Three-Hub Vision

The Neram Classes ecosystem will have three interconnected content hubs on neramclasses.com, each covering a stage of the student journey:

```
NATA Hub (Exam Prep)          →  Counseling Hub (Admission Process)  →  College Hub (Institutions)
/nata-2026                       /counseling                            /colleges
"How to crack NATA"              "How to get admitted"                  "Where to study"
Already built                    THIS PLAN                             Future phase
```

These hubs cross-link naturally: a NATA Hub page about scoring well links to the Counseling Hub for "what colleges you can get with this score." A Counseling Hub page about TNEA lists colleges, each linking to the College Hub profile. The aiArchitek tool on app.neramclasses.com is the interactive bridge between all three.

### 1.2 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE (Existing Project)           │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Colleges    │  │  Counseling  │  │  Historical   │  │
│  │  Master DB   │  │  Systems     │  │  Cutoffs &    │  │
│  │             │  │  Config      │  │  Rank Data    │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                │                   │          │
│         └────────────────┼───────────────────┘          │
│                          │                              │
│                    SHARED DATA LAYER                    │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
┌──────────────────┐ ┌──────────┐ ┌──────────────────┐
│ neramclasses.com │ │ app.     │ │ admin.           │
│                  │ │ neram    │ │ neramclasses.com │
│ Counseling Hub   │ │ classes  │ │                  │
│ (read-only)      │ │ .com     │ │ Data CRUD        │
│                  │ │          │ │ CSV Import        │
│ - Spoke pages    │ │ aiArchi- │ │ Audit Trail       │
│ - College cards  │ │ tek Tool │ │                  │
│ - SEO content    │ │          │ │ Auth: Entra ID   │
└──────────────────┘ │ - Login  │ └──────────────────┘
                     │ - Predict│
                     │ - Results│
                     └──────────┘
```

### 1.3 Key Design Principles

- **Single source of truth:** All college and cutoff data lives in one set of Supabase tables. Both apps read from the same tables.
- **No data duplication:** A college's name, location, fee — stored once, consumed everywhere.
- **Data transparency:** Every prediction explicitly states which year's data it's based on.
- **Progressive enhancement:** Basic college data now, rich profiles later. The schema supports both without restructuring.
- **Audit everything:** All cutoff/rank data changes are logged with who, when, old value, new value.

---

## 2. Counseling Hub — Marketing Site (neramclasses.com)

### 2.1 URL Structure

Follows the same parent + spoke pattern as the NATA Hub.

```
/counseling                          → Parent hub page
/counseling/tnea-barch               → TNEA B.Arch (Tamil Nadu) spoke
/counseling/keam-architecture        → KEAM Architecture (Kerala) spoke
/counseling/kea-barch                → KEA B.Arch (Karnataka) spoke
/counseling/josaa-barch              → JoSAA B.Arch (National) spoke
/counseling/acpc-barch               → ACPC B.Arch (Gujarat) spoke
/counseling/mht-cet-barch            → MHT CET B.Arch (Maharashtra) spoke
/counseling/ap-barch                 → AP EAPCET B.Arch spoke
/counseling/ts-barch                 → TS EAMCET B.Arch spoke
/counseling/uptac-barch              → UPTAC B.Arch (UP) spoke
... (expand as data becomes available)
```

### 2.2 Parent Page: `/counseling`

**Purpose:** Overview of all B.Arch counseling systems in India. SEO target for "B.Arch counseling India", "architecture admission counseling", etc.

**Content Structure:**
- Hero section: "Your Complete Guide to B.Arch Admissions Across India"
- What is counseling & why it matters (brief explainer)
- Visual map or grid of all counseling systems organized by state/region
- Quick comparison table: system name, state, exam accepted, approx colleges, typical timeline
- CTA: "Predict your college → Use aiArchitek" (links to app.neramclasses.com/architek)
- Links to each spoke page

### 2.3 Spoke Page Template: `/counseling/[system-slug]`

Each counseling spoke page is a comprehensive guide. Content sections:

**Section 1: Overview**
- What is [System Name]?
- Which exam scores does it accept? (NATA / JEE Paper 2 / Both)
- Who conducts it? (conducting body name, official website link)
- Quick stats: total colleges, total seats, typical timeline

**Section 2: Eligibility Criteria**
- Academic eligibility (board requirements, minimum marks)
- Domicile/nativity requirements
- Age limits (if any)
- Exam qualification requirements

**Section 3: Merit Formula**
- How the composite score / rank is calculated
- Examples with sample calculations
- Board mark normalization details (if applicable)
- CTA: "Calculate your cutoff → aiArchitek tool"

**Section 4: Counseling Process & Timeline**
- Step-by-step process: Registration → Document verification → Choice filling → Seat allotment → Reporting
- Typical timeline / important dates for current year (editable content)
- Number of counseling rounds

**Section 5: Reservation Categories**
- Complete list of categories with descriptions
- Seat reservation percentages
- Special reservations (first graduate, govt school, PwD, etc.)

**Section 6: Documents Required**
- Checklist of all documents needed
- Format specifications (size, type)

**Section 7: Fee Structure**
- Counseling registration fee
- Seat acceptance fee / deposits
- Refund policy

**Section 8: Participating Colleges**
- List of all colleges under this counseling (pulled from shared college DB)
- Each college shown as a card: name, city, type, seats, approx fee
- Cards link to `/colleges/[college-slug]` (future College Hub pages)
- Sortable/filterable by city, type, fee range

**Section 9: Previous Year Cutoff Trends**
- Summary table showing cutoff ranges by category
- Year-wise comparison (if data available)
- CTA: "See detailed predictions for your marks → aiArchitek tool"

**Section 10: How to Apply**
- Direct link to official registration portal
- Step-by-step application walkthrough

**Sidebar / Sticky Elements:**
- CTA card: "Predict Your College" → links to aiArchitek
- Quick links to related pages (NATA Hub, other counseling systems)
- "Talk to our counselors" → Neram Classes contact

### 2.4 SEO & Content Strategy

Each spoke page targets state-specific long-tail keywords:

| Page | Primary Keywords |
|------|-----------------|
| /counseling/tnea-barch | "TNEA B.Arch counseling 2026", "Tamil Nadu architecture admission", "TNEA B.Arch cutoff" |
| /counseling/keam-architecture | "KEAM architecture counseling", "Kerala B.Arch admission", "KEAM architecture rank list" |
| /counseling/josaa-barch | "JoSAA B.Arch counseling", "NIT architecture admission", "SPA admission through JEE" |

Target markets: Tamil Nadu, Kerala, Karnataka, AP/TS, Gulf NRI families searching in English and regional languages.

---

## 3. aiArchitek Tool — Tools App (app.neramclasses.com)

### 3.1 URL Structure

```
app.neramclasses.com/architek                → Tool landing / direction picker
app.neramclasses.com/architek/predict        → Forward prediction flow
app.neramclasses.com/architek/target         → Reverse prediction flow
app.neramclasses.com/architek/results        → Results display
app.neramclasses.com/architek/compare        → College comparison (future)
```

### 3.2 Authentication Requirement

Login is mandatory before any prediction. The student profile must have:
- State of domicile
- Board type (TN State Board, CBSE, ICSE, Other)
- Category (state-specific — presented based on selected counseling system)
- NATA score and/or JEE Paper 2 score
- Board marks (subject-wise: Maths, Physics, Chemistry + total percentage)
- Gender, first graduate status, govt school status (for TN reservations)

Profile fields can be saved and reused across sessions.

### 3.3 Flow 1: Direction Picker (Landing Screen)

When a student opens aiArchitek, they see two clear paths:

```
┌─────────────────────────────────────────────────┐
│              aiArchitek College Predictor        │
│                                                 │
│   ┌───────────────────┐  ┌───────────────────┐  │
│   │                   │  │                   │  │
│   │  🎯 I have my     │  │  🏛️ I want a      │  │
│   │  marks — show me  │  │  specific college  │  │
│   │  colleges I can   │  │  — show me marks   │  │
│   │  get              │  │  I need            │  │
│   │                   │  │                   │  │
│   │  "Find Colleges"  │  │  "Find Required    │  │
│   │                   │  │   Score"           │  │
│   └───────────────────┘  └───────────────────┘  │
│                                                 │
│   Also links: Counseling Hub | NATA Hub          │
└─────────────────────────────────────────────────┘
```

### 3.4 Flow 2: Forward Prediction ("I have marks → Show colleges")

**Step 1: Input / Profile Verification**
- Student's profile data is pre-filled from their account
- They verify/update: NATA score, board marks, category
- Select counseling systems to predict for (multi-select): TNEA B.Arch, KEAM, KEA, etc.
- Only systems matching their eligibility (domicile, exam taken) are shown as options

**Step 2: Cutoff Calculation**
- System applies each selected counseling's merit formula
- Shows composite score per system:
  - "TNEA B.Arch: Your cutoff is 312/400 (HSC 185 + NATA 127)"
  - "KEAM Architecture: Your composite is [calculated value]"
- This step itself is valuable — many students don't know different systems use different formulas

**Step 3: Rank Prediction**
- Based on the composite score, shows predicted rank range per system
- Default: based on latest year's data (e.g., "Based on 2024 data")
- Year switcher toggle: student can view predictions based on 2023, 2022, 2021, 2020 data
- Each year's prediction is independent — no averaging/blending
- Shows: "Your estimated rank in TNEA B.Arch: 180-250 (Based on 2024 data)"
- Clear disclaimer: "This is an estimate based on historical data. Actual ranks may vary."

**Step 4: College Predictions**
- Matches predicted rank against historical college-wise closing ranks
- Results organized in three tiers:

  **Tier 1 — Safe (High Chance):** Your predicted rank is significantly better than the college's historical closing rank. Shown with a green indicator.
  
  **Tier 2 — Moderate (Possible):** Your predicted rank is close to the historical closing rank. Shown with an amber/yellow indicator.
  
  **Tier 3 — Reach (Competitive):** Your predicted rank is near or slightly worse than the closing rank. You'd need a better-than-predicted performance. Shown with a red/orange indicator.

- Each college shown as a card:
  - College name, city, type (Govt/Private)
  - Your category's closing rank for selected year
  - Tier indicator (Safe/Moderate/Reach)
  - Approximate annual fee
  - Click → opens college detail page on neramclasses.com

- Filters available: state, college type, fee range, tier
- Sort: by tier (safest first), by closing rank, by fee, by location

**Step 5: Smart Recommendations (Below Results)**
- "Best in your home state" — top-tier college within student's domicile state
- "Best overall" — highest-ranked/tiered college across all selected systems
- "Best value" — best tier-to-fee ratio
- "Apply to these counseling systems" — based on where student has best chances

### 3.5 Flow 3: Reverse Prediction ("I want X college → Show required marks")

**Step 1: College Selection**
- Search/browse colleges from the database
- Student selects one or more target colleges (up to 5)
- For each college, system auto-identifies which counseling system(s) it belongs to

**Step 2: Category & Year Selection**
- Student confirms their category
- Default year: latest available
- Year switcher available

**Step 3: Required Score Display**
- For each selected college, shows:
  - "To get into [College Name] as [Category] in TNEA B.Arch:"
  - "Minimum cutoff required: 293/400 (Based on 2024 data)"
  - "That means you need approximately: Board marks ~170+ with NATA score ~123+"
  - "Or: Board marks ~150 with NATA score ~143+"
  - Shows a few board+NATA combinations that would meet the cutoff
  - Historical trend: was the cutoff higher or lower in previous years?

**Step 4: Gap Analysis**
- If student already has board marks (from profile), show:
  - "You need a NATA score of at least [X] to reach this college's cutoff"
  - "Your current NATA score of [Y] is [sufficient / Z marks short]"
- If student has NATA score but awaiting boards:
  - "With your NATA score of [Y], you need board marks of at least [X]"

**Step 5: Comparison View** (if multiple colleges selected)
- Side-by-side comparison of required cutoffs for all selected colleges
- Sorted by difficulty (easiest to hardest to get into)

### 3.6 Year Switcher Behavior

The year switcher appears wherever predictions are shown:

```
┌──────────────────────────────────────────┐
│  📊 Prediction Data: [2024 ▼]           │
│                                          │
│  2024 (Latest — Recommended)             │
│  2023                                    │
│  2022                                    │
│  2021                                    │
│  2020                                    │
└──────────────────────────────────────────┘
```

- Default selection: most recent year with complete data
- Switching years recalculates all predictions using that year's rank distribution and cutoff data
- Label on results always shows: "Based on TNEA B.Arch [Year] counseling data"
- Each year is treated independently — predictions are specific to that year's actual data

### 3.7 College Cards

Every college card in the tool follows a consistent format:

```
┌─────────────────────────────────────────────┐
│  🟢 SAFE                          Govt      │
│                                             │
│  School of Architecture & Planning          │
│  Anna University, Chennai                   │
│                                             │
│  Closing Rank (OC, 2024): 40                │
│  Your Predicted Rank: 35                    │
│  Annual Fee: ₹50,000                        │
│                                             │
│  [View Details →]                           │
└─────────────────────────────────────────────┘
```

"View Details" links to `neramclasses.com/colleges/anna-university-architecture` (future College Hub page; placeholder page for now).

---

## 4. Admin Panel — Data Management (admin.neramclasses.com)

### 4.1 Scope

The admin panel manages two data domains:
1. **College Master Data** — CRUD for colleges
2. **Historical Cutoff & Rank Data** — CRUD + CSV import + audit trail

Counseling system configs and spoke page content remain code-managed (too sensitive and too infrequently changed to warrant a UI).

### 4.2 Authentication

Existing Microsoft Entra ID auth on admin.neramclasses.com. Access limited to Hari + 1-2 trusted staff.

### 4.3 College Management

**List View:**
- Table of all colleges with search, filter by state/type/counseling system
- Columns: Name, City, State, Type, Seats, Fee, Status (Active/Inactive), Counseling Systems
- Bulk actions: activate/deactivate

**Add/Edit College Form:**
- Basic info: name, short name, city, state, district, type, COA approved
- Academics: NAAC grade, NIRF rank (architecture), annual fee, total B.Arch seats
- Links: website URL
- Location: latitude, longitude (for future distance calculations)
- Neram tier: T1/T2/T3 (editorial ranking)
- Counseling participation: which systems, college code per system, branches offered
- Status: active/inactive toggle

### 4.4 Historical Cutoff & Rank Data Management

**Counseling System Selector:**
- First select the counseling system (TNEA B.Arch, KEAM, etc.)
- Then select year

**Data Entry Options:**

**Option A: CSV/Excel Import (Bulk)**
- Upload a CSV/Excel file with columns matching the cutoff schema
- Preview step: show parsed data in a table before confirming import
- Validation: check for duplicates, missing fields, out-of-range values
- Confirmation: "You are about to import 210 cutoff records for TNEA B.Arch 2024. Proceed?"
- CSV template download available for each counseling system (pre-formatted with correct column headers and category names)

**Option B: Manual Entry/Edit**
- Select college → select year → select round → enter cutoffs per category
- Form shows all category columns for the selected counseling system
- Both marks and ranks can be entered (some systems publish one or both)
- Save with validation

**Data Table View:**
- Full table showing all cutoff data for selected system + year
- Columns: College, Branch, Round, then one column per category (showing mark/rank)
- Inline editing: click a cell to edit
- Sort/filter by college, branch, round
- Export to CSV

**Rank Distribution Data:**
- Separate section for entering rank distribution data (from rank lists)
- Input: sampled data points — rank and corresponding composite score
- Used for score → rank prediction curves
- Can be entered manually or imported from CSV

### 4.5 Audit Trail

Every change to cutoff/rank data and college data is logged:

```
audit_log table:
- id
- table_name (e.g., 'historical_cutoffs', 'colleges')
- record_id (UUID of the changed record)
- field_name (which column changed)
- old_value
- new_value
- changed_by (user ID from Entra auth)
- changed_at (timestamp)
- change_type ('CREATE', 'UPDATE', 'DELETE')
```

Admin panel includes an "Audit Log" view:
- Filterable by table, user, date range
- Shows human-readable change descriptions: "User [Name] changed closing_rank from 45 to 40 for Anna University / OC / 2024 / Round 1 on March 6, 2026 at 3:45 PM"

---

## 5. Database Schema — Supabase (Existing Project)

All tables live in the existing Supabase project (staging + production). Using `counseling_` prefix to namespace these tables.

### 5.1 Core Tables

```sql
-- ============================================
-- TABLE 1: COLLEGES (Shared across entire ecosystem)
-- ============================================
CREATE TABLE colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  slug TEXT UNIQUE NOT NULL,                -- URL-friendly: 'anna-university-architecture'
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT,
  college_type TEXT NOT NULL,               -- 'Government', 'Government-Aided', 'Private', 'Deemed', 'Autonomous'
  coa_approved BOOLEAN DEFAULT true,
  naac_grade TEXT,                          -- 'A++', 'A+', 'A', 'B++', etc.
  nirf_rank_architecture INTEGER,
  annual_fee_approx INTEGER,                -- In INR
  total_barch_seats INTEGER,
  website TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  neram_tier TEXT,                          -- 'T1', 'T2', 'T3'
  is_active BOOLEAN DEFAULT true,
  -- Future College Hub fields (NULL for now, populated later)
  description TEXT,
  established_year INTEGER,
  placement_data JSONB,                     -- Future: avg package, top recruiters, etc.
  facilities JSONB,                         -- Future: hostel, library, labs, etc.
  gallery_images TEXT[],                    -- Future: photo URLs
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX idx_colleges_state ON colleges(state);
CREATE INDEX idx_colleges_slug ON colleges(slug);
CREATE INDEX idx_colleges_active ON colleges(is_active);


-- ============================================
-- TABLE 2: COUNSELING SYSTEMS (Config — code-managed)
-- ============================================
CREATE TABLE counseling_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,                -- 'TNEA_BARCH', 'KEAM_ARCH', 'KEA_BARCH', etc.
  name TEXT NOT NULL,                       -- 'TNEA B.Arch Counseling'
  short_name TEXT,                          -- 'TNEA B.Arch'
  slug TEXT UNIQUE NOT NULL,                -- 'tnea-barch'
  state TEXT NOT NULL,
  conducting_body TEXT NOT NULL,
  conducting_body_full TEXT,
  official_website TEXT,
  -- Merit formula configuration
  merit_formula JSONB NOT NULL,
  /*
    Example for TNEA:
    {
      "method": "raw_sum",
      "components": [
        {"name": "HSC Aggregate", "key": "hsc_aggregate", "max_marks": 200, "source": "board_marks"},
        {"name": "NATA/JEE Score", "key": "entrance_score", "max_marks": 200, "source": "entrance_exam"}
      ],
      "total_marks": 400
    }
  */
  exams_accepted TEXT[] NOT NULL,            -- ['NATA', 'JEE_PAPER_2']
  categories JSONB NOT NULL,
  /*
    Example for TNEA:
    [
      {"code": "OC", "name": "Open Competition", "description": "General / Unreserved"},
      {"code": "BC", "name": "Backward Class", "description": "..."},
      {"code": "BCM", "name": "BC Muslim", "description": "..."},
      {"code": "MBC", "name": "Most Backward Class", "description": "..."},
      {"code": "SC", "name": "Scheduled Caste", "description": "..."},
      {"code": "SCA", "name": "SC Arunthathiyar", "description": "..."},
      {"code": "ST", "name": "Scheduled Tribe", "description": "..."}
    ]
  */
  special_reservations JSONB,               -- [{"code": "first_grad", "name": "First Graduate", "percentage": null}, ...]
  typical_counseling_months TEXT,            -- 'July-August'
  typical_rounds INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================
-- TABLE 3: COLLEGE-COUNSELING PARTICIPATION
-- Links colleges to counseling systems per year
-- ============================================
CREATE TABLE college_counseling_participation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id) ON DELETE CASCADE,
  college_code TEXT NOT NULL,               -- Code used in this counseling system (e.g., '3' for Anna Univ in TNEA)
  branches JSONB NOT NULL,                  -- [{"code": "AR", "name": "Architecture"}, {"code": "BA", "name": "Architecture (SS)"}]
  year INTEGER NOT NULL,
  seat_matrix JSONB,                        -- {"total": 80, "by_category": {"OC": 30, "BC": 20, ...}}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_id, counseling_system_id, year)
);


-- ============================================
-- TABLE 4: HISTORICAL CUTOFFS (The prediction engine)
-- One row per college × year × round × branch × category
-- ============================================
CREATE TABLE historical_cutoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id),
  college_id UUID NOT NULL REFERENCES colleges(id),
  year INTEGER NOT NULL,
  round TEXT NOT NULL,                      -- 'round_1', 'round_2', 'round_3', 'final', 'supplementary'
  branch_code TEXT NOT NULL,                -- 'AR', 'BA'
  category TEXT NOT NULL,                   -- 'OC', 'BC', 'SC', etc.
  closing_mark DECIMAL(10,4),               -- Closing cutoff mark (e.g., 339.0000)
  closing_rank INTEGER,                     -- Closing rank (e.g., 40)
  opening_mark DECIMAL(10,4),               -- Opening cutoff mark (if available)
  opening_rank INTEGER,                     -- Opening rank (if available)
  seats_available INTEGER,                  -- Seats in this category (if known)
  seats_filled INTEGER,                     -- Seats filled (if known)
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(counseling_system_id, college_id, year, round, branch_code, category)
);

CREATE INDEX idx_cutoffs_system_year ON historical_cutoffs(counseling_system_id, year);
CREATE INDEX idx_cutoffs_college ON historical_cutoffs(college_id);
CREATE INDEX idx_cutoffs_lookup ON historical_cutoffs(counseling_system_id, year, category);


-- ============================================
-- TABLE 5: RANK DISTRIBUTIONS
-- Sampled data points from rank lists for score → rank prediction
-- ============================================
CREATE TABLE rank_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counseling_system_id UUID NOT NULL REFERENCES counseling_systems(id),
  year INTEGER NOT NULL,
  total_candidates INTEGER NOT NULL,
  -- Sampled data points from the rank list
  distribution_data JSONB NOT NULL,
  /*
    [
      {"rank": 1, "composite_score": 351},
      {"rank": 50, "composite_score": 313.67},
      {"rank": 100, "composite_score": 303.33},
      {"rank": 200, "composite_score": 291.33},
      {"rank": 500, "composite_score": 267},
      {"rank": 1000, "composite_score": 234.5},
      {"rank": 1400, "composite_score": 137.83}
    ]
  */
  source_description TEXT,                  -- 'Extracted from TNEA 2023 General Academic Provisional Rank List PDF'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(counseling_system_id, year)
);


-- ============================================
-- TABLE 6: STUDENT PROFILES (for aiArchitek tool)
-- ============================================
CREATE TABLE student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,             -- Firebase auth UID
  -- Personal
  full_name TEXT,
  state_domicile TEXT NOT NULL,
  gender TEXT,                              -- 'Male', 'Female', 'Transgender'
  -- Academic
  board_type TEXT NOT NULL,                 -- 'TN_STATE', 'CBSE', 'ICSE', 'OTHER_STATE'
  board_marks JSONB NOT NULL,
  /*
    {
      "total_percentage": 85.5,
      "maths": 95,
      "physics": 88,
      "chemistry": 82,
      "maths_max": 100,
      "physics_max": 100,
      "chemistry_max": 100
    }
  */
  nata_score DECIMAL(6,3),
  nata_attempt_year INTEGER,
  jee_paper2_score DECIMAL(6,3),
  -- Category (varies by state — store per-system)
  categories JSONB,
  /*
    {
      "TNEA_BARCH": "BC",
      "KEAM_ARCH": "EZ",
      "KEA_BARCH": "2A",
      "national": "OBC-NCL"
    }
  */
  -- Special statuses
  first_graduate BOOLEAN DEFAULT false,
  govt_school_student BOOLEAN DEFAULT false,
  pwd_status BOOLEAN DEFAULT false,
  nri_status BOOLEAN DEFAULT false,
  -- Preferences
  preferred_states TEXT[],
  college_type_preference TEXT[],           -- ['Government', 'Government-Aided', 'Private']
  budget_max INTEGER,                       -- Annual fee limit in INR
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================
-- TABLE 7: PREDICTION LOGS (optional — for analytics)
-- ============================================
CREATE TABLE prediction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES student_profiles(id),
  prediction_type TEXT NOT NULL,            -- 'forward', 'reverse'
  counseling_systems TEXT[] NOT NULL,
  data_year INTEGER NOT NULL,
  input_data JSONB NOT NULL,                -- Student's marks, scores, category
  results_summary JSONB,                    -- Top predictions generated
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================
-- TABLE 8: AUDIT LOG
-- ============================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  change_type TEXT NOT NULL,                -- 'CREATE', 'UPDATE', 'DELETE'
  changed_by TEXT NOT NULL,                 -- User identifier from Entra auth
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  context JSONB                             -- Optional: additional context like {college_name, year, system}
);

CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_record ON audit_log(record_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at);
```

### 5.2 Row-Level Security (RLS) Notes

- `colleges`, `counseling_systems`, `college_counseling_participation`, `historical_cutoffs`, `rank_distributions` → Public read access (both apps need to read). Write access restricted to admin roles.
- `student_profiles` → Read/write by the owning user only (matched via Firebase auth UID).
- `prediction_logs` → Write by authenticated users, read by owning user + admin.
- `audit_log` → Write by admin service role only, read by admin.

---

## 6. Data Flow Between Systems

### 6.1 Marketing Site (neramclasses.com) — Read-Only Consumer

The counseling spoke pages consume data at build time (SSG/ISR) or via server-side queries:

- **Spoke page college list:** Queries `colleges` + `college_counseling_participation` filtered by `counseling_system_id`
- **Cutoff trend tables:** Queries `historical_cutoffs` for the relevant system, grouped by year
- **College cards:** Queries `colleges` for card display data (name, city, type, fee, neram_tier)

### 6.2 Tools App (app.neramclasses.com) — Read + Write (User Data)

- **Read:** `colleges`, `counseling_systems`, `historical_cutoffs`, `rank_distributions`
- **Write:** `student_profiles`, `prediction_logs`
- **Prediction logic** runs client-side or in API routes — reads historical data, applies formulas, returns results

### 6.3 Admin Panel (admin.neramclasses.com) — Full CRUD

- **CRUD:** `colleges`, `college_counseling_participation`, `historical_cutoffs`, `rank_distributions`
- **Write:** `audit_log` (automatic on every mutation)
- **Read:** `audit_log` (for audit trail view)

### 6.4 College Card → College Page Redirect

When a student clicks a college card in the aiArchitek tool:
```
app.neramclasses.com/architek/results
  → Click "Anna University" card
  → Opens neramclasses.com/colleges/anna-university-architecture
```

For MVP, the `/colleges/[slug]` page can be a simple template showing the basic data from the `colleges` table. In the College Hub phase, this becomes a rich profile page.

---

## 7. TNEA B.Arch — First Implementation Details

### 7.1 Counseling System Config (Seed Data)

```json
{
  "code": "TNEA_BARCH",
  "name": "TNEA B.Arch Counseling",
  "short_name": "TNEA B.Arch",
  "slug": "tnea-barch",
  "state": "Tamil Nadu",
  "conducting_body": "DoTE",
  "conducting_body_full": "Directorate of Technical Education, Chennai",
  "official_website": "https://tneaonline.org",
  "merit_formula": {
    "method": "raw_sum",
    "components": [
      {
        "name": "HSC Aggregate Mark",
        "key": "hsc_aggregate",
        "max_marks": 200,
        "source": "board_marks",
        "description": "12th marks normalized to 200 (Maths: 100, Physics: 50, Chemistry: 50). Cross-board normalization applied for CBSE/ICSE."
      },
      {
        "name": "NATA / JEE Paper 2 Score",
        "key": "entrance_score",
        "max_marks": 200,
        "source": "entrance_exam",
        "description": "Best score from NATA or JEE Main Paper 2"
      }
    ],
    "total_marks": 400
  },
  "exams_accepted": ["NATA", "JEE_PAPER_2"],
  "categories": [
    {"code": "OC", "name": "Open Competition"},
    {"code": "BC", "name": "Backward Class"},
    {"code": "BCM", "name": "BC Muslim"},
    {"code": "MBC", "name": "Most Backward Class"},
    {"code": "SC", "name": "Scheduled Caste"},
    {"code": "SCA", "name": "SC Arunthathiyar"},
    {"code": "ST", "name": "Scheduled Tribe"}
  ],
  "special_reservations": [
    {"code": "first_graduate", "name": "First Graduate"},
    {"code": "govt_school", "name": "Government School (7.5%)"}
  ],
  "typical_counseling_months": "July-August",
  "typical_rounds": 3
}
```

### 7.2 Colleges to Seed (From 2024 Cutoff PDFs — 30 Colleges)

Based on the TNEA B.Arch 2024 cutoff PDFs uploaded, these colleges need to be entered:

| Code | College | City | Type |
|------|---------|------|------|
| 3 | School of Architecture & Planning, Anna University | Chennai | Government |
| 1130 | MARG Institute of Design & Architecture (MIDAS) | Chengalpattu | Private |
| 1132 | Rajalakshmi School of Architecture | Kancheepuram | Private |
| 1135 | Aalim Muhammed Salegh Academy of Architecture | Chennai | Private |
| 1144 | RVS Padmavathy School of Architecture | Thiruvallur | Private |
| 1146 | Misrimal Navajee Munoth Jain School of Architecture | Chengalpattu | Private |
| 1152 | CAAD - Chennai Academy of Architecture & Design | Chennai | Private |
| 1308 | Measi Academy of Architecture | Chennai | Private |
| 1400 | Mohamed Sathak A.J. Academy of Architecture | Chengalpattu | Private |
| 1509 | Meenakshi College of Engineering | Chennai | Private |
| 1530 | Papni School of Architecture | Kancheepuram | Private |
| 2344 | Kongu School of Architecture | Erode | Private |
| 2348 | San Academy of Architecture | Coimbatore | Private |
| 2361 | Sasi Creative School of Architecture | Coimbatore | Private |
| 2364 | School of Architecture, CIET | Coimbatore | Private |
| 2365 | Nehru School of Architecture | Coimbatore | Private |
| 2373 | Hindusthan School of Architecture | Coimbatore | Private |
| 2379 | PSG Institute of Architecture & Planning | Coimbatore | Private |
| 2601 | Adhiyamaan College of Engineering | Krishnagiri | Private |
| 2667 | Excel College of Architecture & Planning | Namakkal | Private |
| 2684 | Rathinam School of Architecture & Design | Coimbatore | Private |
| 2728 | Tamilnadu School of Architecture | Coimbatore | Private |
| 2737 | Sri Sai Ranganathan Engineering College | Coimbatore | Private |
| 2759 | McGan's Ooty School of Architecture | Nilgiris | Private |
| 3446 | Prime College of Architecture & Planning | Nagapattinam | Private |
| 3784 | CARE School of Architecture | Tiruchirappalli | Private |
| 4671 | Sigma College of Architecture | Kanyakumari | Private |
| 4935 | Immanuel Arasar College of Architecture | Kanyakumari | Private |
| 4960 | Mepco Schlenk Engineering College | Virudhunagar | Private/Autonomous |
| 5008 | Thiagarajar College of Engineering | Madurai | Autonomous |
| 5863 | RVS Educational Trust's Group of Institutions | Dindigul | Private |
| 5907 | Mohamed Sathak Engineering College | Ramanathapuram | Private |

### 7.3 Rank Distribution Data (From 2023 Rank List)

Sampled from the uploaded TNEA B.Arch 2023 General Academic Provisional Rank List (1,400 students):

```json
{
  "system": "TNEA_BARCH",
  "year": 2023,
  "total_candidates": 1400,
  "distribution_data": [
    {"rank": 1, "composite_score": 351.0},
    {"rank": 10, "composite_score": 327.8},
    {"rank": 25, "composite_score": 319.2},
    {"rank": 50, "composite_score": 313.67},
    {"rank": 100, "composite_score": 303.33},
    {"rank": 150, "composite_score": 296.33},
    {"rank": 200, "composite_score": 291.33},
    {"rank": 250, "composite_score": 285.33},
    {"rank": 300, "composite_score": 282.33},
    {"rank": 400, "composite_score": 274.33},
    {"rank": 500, "composite_score": 267.0},
    {"rank": 600, "composite_score": 260.33},
    {"rank": 700, "composite_score": 254.5},
    {"rank": 800, "composite_score": 248.0},
    {"rank": 900, "composite_score": 240.67},
    {"rank": 1000, "composite_score": 234.5},
    {"rank": 1100, "composite_score": 226.33},
    {"rank": 1200, "composite_score": 218.0},
    {"rank": 1300, "composite_score": 204.67},
    {"rank": 1400, "composite_score": 137.83}
  ]
}
```

### 7.4 Prediction Algorithm (For TNEA B.Arch)

**Forward Prediction (Score → Rank → Colleges):**

```
1. INPUT: Student's board marks (Maths, Physics, Chemistry) + NATA score + category + selected year

2. CALCULATE CUTOFF:
   HSC_Aggregate = (Maths_normalized_to_100) + (Physics_normalized_to_50) + (Chemistry_normalized_to_50)
   Cutoff = HSC_Aggregate + NATA_Score
   // For CBSE/ICSE students, cross-board normalization applies (requires the normalization table from DoTE)

3. PREDICT RANK:
   - Load rank_distributions for TNEA_BARCH for selected year
   - Use linear interpolation between sampled data points
   - E.g., if cutoff = 290, and data shows rank 200 = 291.33, rank 250 = 285.33
     → Interpolated rank ≈ 200 + (291.33 - 290) / (291.33 - 285.33) × 50 ≈ 211
   - Apply ±10-15% confidence band: "Rank 180-245"

4. FIND COLLEGES:
   - Load historical_cutoffs for TNEA_BARCH, selected year, student's category, final round
   - For each college, compare student's predicted rank against closing_rank:
     - If predicted_rank < closing_rank × 0.7 → SAFE (green)
     - If predicted_rank < closing_rank → MODERATE (amber)
     - If predicted_rank < closing_rank × 1.3 → REACH (orange)
     - Else → UNLIKELY (not shown or greyed out)

5. OUTPUT: Sorted list of colleges with tier classification
```

**Reverse Prediction (College → Required Score):**

```
1. INPUT: Selected college(s) + category + selected year

2. LOOKUP CLOSING CUTOFF:
   - From historical_cutoffs, get closing_mark for selected college, category, year, final round
   - E.g., Anna University, OC, 2024: closing_mark = 339

3. CALCULATE REQUIRED COMBINATIONS:
   - If student has board marks already: Required NATA = closing_mark - HSC_aggregate
   - If student has NATA already: Required board marks = closing_mark - NATA_score
   - If neither: Show a table of sample combinations:
     Board 190 + NATA 149 = 339
     Board 180 + NATA 159 = 339
     Board 170 + NATA 169 = 339

4. SHOW TREND: Same college's closing cutoff for other years (was it higher/lower?)

5. OUTPUT: Required marks + combination table + historical trend
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

**Database Setup:**
- [ ] Create all 8 tables in Supabase staging
- [ ] Set up RLS policies
- [ ] Create Supabase Edge Functions for prediction logic (if needed)
- [ ] Seed TNEA B.Arch counseling system config
- [ ] Seed 30 TN B.Arch colleges from 2024 cutoff PDF

**Data Entry:**
- [ ] Enter TNEA B.Arch 2024 cutoff data (marks + ranks) — from uploaded PDFs
- [ ] Enter TNEA B.Arch 2023 rank distribution — from uploaded rank list PDF
- [ ] Enter TNEA B.Arch 2023 cutoff data (Hari to provide PDF or CSV)
- [ ] Repeat for 2022, 2021, 2020 data as available

### Phase 2: Admin Panel (Week 2-3)

**Admin Features (admin.neramclasses.com):**
- [ ] College management: list, add, edit, deactivate
- [ ] Cutoff data management: list, add, edit per system/year
- [ ] CSV import with preview and validation
- [ ] CSV template download per counseling system
- [ ] Audit log viewer

### Phase 3: aiArchitek Tool MVP (Week 3-5)

**Tool App (app.neramclasses.com):**
- [ ] Student profile setup flow (mandatory before predictions)
- [ ] Direction picker screen (Forward vs Reverse)
- [ ] Forward flow: cutoff calculation → rank prediction → college results
- [ ] Reverse flow: college selection → required score display → gap analysis
- [ ] Year switcher on all prediction screens
- [ ] College cards with "View Details" link
- [ ] Results filtering and sorting
- [ ] Data source labeling ("Based on TNEA B.Arch 2024 data")

### Phase 4: Counseling Hub (Week 5-7)

**Marketing Site (neramclasses.com):**
- [ ] Counseling Hub parent page `/counseling`
- [ ] TNEA B.Arch spoke page `/counseling/tnea-barch` — full comprehensive guide
- [ ] College list section pulling from shared DB
- [ ] CTAs linking to aiArchitek tool
- [ ] Basic college pages `/colleges/[slug]` — template with basic data from DB

### Phase 5: Expand to More Counseling Systems (Week 7+)

- [ ] KEAM Architecture (Kerala) — second system
- [ ] JoSAA B.Arch (National) — third system
- [ ] KEA B.Arch (Karnataka) — fourth system
- [ ] Continue expanding state by state based on data availability

---

## 9. Future: College Hub & Pan-India Expansion

### 9.1 College Hub (Future Phase)

```
/colleges                                → College directory / search page
/colleges/anna-university-architecture   → Rich profile page
/colleges/psg-architecture               → Rich profile page
...
```

Rich profile pages will include: overview, courses, faculty, placements, infrastructure, fee structure, admission process, cutoff history, student reviews, photos/gallery, location map, nearby colleges, comparison tool.

Data for these pages will be added to the existing `colleges` table — the nullable fields (`description`, `placement_data`, `facilities`, `gallery_images`, etc.) will be populated gradually.

### 9.2 Pan-India Expansion

The schema is designed to support any number of counseling systems. For each new state:

1. Add a row to `counseling_systems` with the state's specific merit formula and categories
2. Add colleges to the `colleges` table (or reuse if already exists from another system)
3. Add participation records to `college_counseling_participation`
4. Enter cutoff data to `historical_cutoffs`
5. Enter rank distribution data to `rank_distributions` (if rank list PDFs are available)
6. Create a spoke page on the marketing site
7. The aiArchitek tool automatically picks up the new system — no code changes needed

### 9.3 Category Mapping (Cross-State)

Students applying to multiple states need category mapping. The `student_profiles.categories` JSONB field handles this:

```json
{
  "TNEA_BARCH": "BC",
  "KEAM_ARCH": "EZ",
  "KEA_BARCH": "2A",
  "JOSAA_BARCH": "OBC-NCL"
}
```

The profile setup flow asks the student to select their category per counseling system they're interested in. We can provide guidance ("If you're BC in Tamil Nadu, you're likely OBC-NCL at the national level") but the student confirms.

---

*End of Plan — Version 1.0*
*Ready for implementation via Claude Code plugin, starting with TNEA B.Arch.*
