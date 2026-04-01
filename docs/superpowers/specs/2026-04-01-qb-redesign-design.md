# Question Bank UI/UX Redesign — Design Spec

**Date:** 2026-04-01
**App:** Nexus (nexus.neramclasses.com)
**Path:** `apps/nexus/src/app/(student)/student/question-bank/`

## Context

The current Question Bank page has usability issues: a question number grid and minimap that waste space, a double-sidebar problem (app nav + filter sidebar), excessive padding, lazy-loaded options that feel laggy, and a paper-scoped view that only shows one paper's questions (e.g., 74) instead of the full bank (624). The primary goal is to enable **power filtering** across the entire question bank so students can build custom question sets by subject, chapter, year, difficulty — and create tests from those filtered sets.

## What's Changing

| Element | Current | New |
|---------|---------|-----|
| Question number grid | Top bar with numbered boxes (1-40) | **Removed** |
| Minimap (MAP) | Right sidebar with colored blocks | **Removed** |
| Filter sidebar | Left sidebar (double-sidebar with app nav) | **Top filter chips + right slide-out drawer** |
| Padding | Excessive whitespace around cards | **Compact cards: 6px gaps, 12px padding** |
| Options loading | Loads on question expand (laggy) | **Pre-fetched in background, instant expand** |
| Question scope | Shows one paper only (e.g., 74 Qs) | **Full bank (all questions) with power filtering** |
| Landing page | Jumps directly to a paper | **Landing with Year Paper cards + Full Bank entry** |

## Subject Hierarchy (Exam-Aware)

The filter tree adapts based on exam type:

```
JEE Paper 2 (3 sections):
├── Mathematics
│   ├── Algebra
│   ├── Trigonometry
│   ├── Geometry
│   ├── Mensuration
│   └── Statistics & Probability
├── Aptitude
│   ├── History of Architecture
│   ├── General Knowledge
│   ├── Building Materials & Construction
│   ├── Building Services
│   ├── Planning & Urban Design
│   ├── Sustainability & Climate
│   ├── Famous Architects & Works
│   ├── Logical Reasoning
│   ├── Visual Reasoning
│   ├── Puzzles
│   └── Pattern Recognition
└── Drawing
    ├── Perspective Drawing
    ├── Elevation & Plan
    ├── Sketching & Composition
    └── 3D Visualization

NATA (2 sections):
├── Drawing
│   └── (sub-topics)
└── Aptitude
    ├── Mathematics
    ├── General Knowledge
    ├── Puzzles
    ├── English Grammar
    ├── Logical Reasoning
    ├── History of Architecture
    └── ...more (TBD — user will provide full list)
```

**Key difference:** In NATA, Mathematics is a sub-topic under Aptitude. In JEE, Mathematics is a top-level section.

## Screen 1: QB Landing Page

**Purpose:** Entry point showing two ways to use the QB.

**Layout:**
- Header: "Question Bank" + total stats (624 questions · 12 papers · JEE & NATA)
- **Primary CTA:** "Browse Full Question Bank" button — leads to full bank with power filters
- **Year Paper grid:** Cards for each paper (JEE 2026, NATA 2025 T1, etc.) with:
  - Exam badge (JEE / NATA color-coded)
  - Paper title + question count + duration
  - Progress bar showing completion (e.g., 12/74 done)
- Cards are clickable → opens that paper's questions (pre-scoped filter)

**Data source:** Existing `GET /api/question-bank/exam-tree` + `GET /api/question-bank/stats`

## Screen 2: Question List (Full Bank or Paper-Scoped)

**Purpose:** Browse and filter questions. Same UI for both full bank and year paper views.

**Header:**
- Back arrow + title ("Full Question Bank" or "JEE 2026")
- Count: "Showing X of Y questions"

**Top Filter Bar:**
- Compact filter chips as dropdowns: Exam, Year, Subject, Difficulty, Status
- Each chip opens an inline dropdown for quick selection
- "Filters" button opens the right-side power filter drawer
- When in Year Paper view, Exam + Year are pre-set and shown as non-removable chips

**Active Filter Chips:**
- Below the filter bar, show dismissible chips for each active filter (e.g., "Mathematics ×", "Algebra ×", "Medium ×")
- Clicking × removes that filter

**Results Header:**
- "Showing X of Y questions"
- "Select" toggle for multi-select mode
- "Create Test" button (active when questions are selected)

**Question Cards (compact):**
- Each card shows:
  - Question number (Q1, Q2...)
  - Tags: Subject · Chapter, Difficulty badge, Source (JEE 2026 / NATA 2025)
  - Question text preview (1-2 lines, truncated)
  - Attempt status indicator (dot: green=correct, red=wrong, gray=unattempted)
- Card spacing: 6px gap between cards, 12px internal padding
- Clicking a card expands it inline to show options (pre-loaded, instant)
- In select mode, checkbox appears on each card

**Expanded Question Card:**
- Shows full question text (with MathText/LaTeX rendering)
- MCQ options in 2-column grid (or 1-column if options have images)
- Option letters (A, B, C, D) with selection highlighting
- After answering: green/red feedback, explanation section

**Virtual Scrolling:**
- All matching questions rendered via virtual scroll (react-window or similar)
- Only ~20 items in DOM at a time, smooth scroll through hundreds of questions
- Fetch pages in background as user scrolls (infinite scroll with pre-fetch)

## Screen 3: Power Filter Drawer (Right Side)

**Purpose:** Deep hierarchical filtering. Slides in from right side — no double sidebar.

**Trigger:** "Filters" button in the top filter bar

**Layout:**
- Semi-transparent overlay on the question list
- Drawer panel on the right (280px wide on desktop, full-width on mobile as bottom sheet)
- Close button (×) at top right

**Filter Sections (top to bottom):**

1. **Exam Type** — Toggle chips: JEE Paper 2 | NATA | All
   - Selecting an exam type changes the Subject tree below

2. **Year** — Multi-select chips: 2026, 2025, 2024, 2023...
   - For NATA, shows sessions too: 2025 T1, 2025 T2

3. **Section → Sub-topic** (hierarchical tree with checkboxes)
   - Parent items are expandable (▸/▾ toggle)
   - Each item shows question count
   - Checking a parent selects all children
   - Checking individual children shows indeterminate state on parent
   - Tree content adapts to selected exam type
   - Collapsed parents show a preview of children in italic text

4. **Difficulty** — Toggle chips: Easy | Medium | Hard (multi-select)

5. **Status** — Toggle chips: All | Unattempted | Correct | Wrong

**Footer:**
- "Clear All" button — resets all filters
- "Apply (X Qs)" button — shows live count, applies and closes drawer

## Pre-loading Strategy

**Problem:** Currently, expanding a question triggers an API call to load options, causing visible delay.

**Solution:** Background pre-fetch in batches.

1. When the question list loads (page of ~20 questions), fetch full details for all visible questions in a single batch API call
2. Store in a client-side cache (React state or Map)
3. When user scrolls to load more questions, pre-fetch the next batch
4. When user expands a question, options are already in cache — instant render
5. If cache miss (rare), fall back to individual fetch with skeleton loader

**API change:** Modify the existing list endpoint (`GET /api/question-bank/questions`) to include `options` in the response. The options are already stored as JSONB on the question row — just include them in the select. No new endpoint needed.

## Create Test Flow

1. User applies filters to narrow down questions
2. Clicks "Select" to enter multi-select mode (checkboxes appear on cards)
3. Selects desired questions (or "Select All Filtered")
4. Clicks "Create Test" button
5. Dialog appears: test name, timer settings (none / full / per-question)
6. Confirm → creates test via existing `POST /api/question-bank/custom-tests`
7. Navigate to the test-taking page

## Components to Modify/Create

### Remove:
- `MiniMap` component — remove from question list view
- `JumpBar` component — remove (question number navigation)
- Question number grid at top of question list

### Modify:
- `apps/nexus/src/app/(student)/student/question-bank/page.tsx` — Redesign as landing page with paper cards + full bank CTA
- `apps/nexus/src/app/(student)/student/question-bank/questions/page.tsx` — Remove minimap/jumpbar, add top filter bar, virtual scroll, pre-loading
- `InlineQuestionCard` — Compact styling (tighter padding, smaller tags)
- `FilterDrawer` — Move from left overlay to right slide-out, add hierarchical subject tree
- `FilterChips` — Redesign as top bar with dropdown chips

### Create:
- `PaperCard` — Year paper card component for landing page
- `TopFilterBar` — Compact filter chips with inline dropdowns
- `SubjectTree` — Hierarchical checkbox tree for filter drawer (exam-type aware)
- Batch pre-fetch hook (`useQuestionPreloader`)

### Existing to Reuse:
- `QuestionBankLayout` (`apps/nexus/src/components/question-bank/QuestionBankLayout.tsx`) — Adapt, remove sidebar logic
- `MCQOptions` (`apps/nexus/src/components/question-bank/MCQOptions.tsx`) — Keep as-is
- `ProgressHeader` — Keep for stats display
- `ScrollToTopFab` — Keep
- `SourceBadges`, `DifficultyChip`, `CategoryChips` — Keep but make more compact

### Database/API:
- `packages/database/src/queries/nexus/question-bank.ts` — Modify `getQBQuestions` to include options in list response (avoid separate detail fetch)
- Existing topic tree query `getQBTopicTree()` — Already returns hierarchical data, reuse
- May need to update topic seed data to match correct JEE/NATA hierarchy (Aptitude as parent of History of Architecture, GK, etc.)

## Mobile Behavior

- Filter drawer opens as **full-screen bottom sheet** (not right-side panel)
- Subject tree collapses to accordion style
- Question cards: full-width, same compact styling
- Top filter bar: horizontally scrollable chip row
- Virtual scroll works the same on mobile
- Touch targets: 48px minimum for filter checkboxes and option buttons

## Verification

1. Load QB landing page — paper cards render with correct progress
2. Click "Browse Full Bank" — all 624 questions load with virtual scroll
3. Open filter drawer — subject tree shows correct hierarchy for JEE vs NATA
4. Apply filters (e.g., JEE + Mathematics + Algebra + Medium) — count updates, list filters correctly
5. Expand a question — options appear instantly (pre-loaded)
6. Select multiple questions → Create Test → test is created and navigable
7. Click a Year Paper card → opens paper-scoped view with correct questions
8. Mobile (375px): bottom sheet filters, no horizontal overflow, 48px touch targets
9. Performance: smooth scroll through 600+ questions, no jank
