# Onboarding Reviews: Table Redesign

**Date:** 2026-04-08
**App:** Nexus (`apps/nexus`)
**Page:** `/teacher/onboarding-reviews`

---

## Context

The current onboarding reviews page renders students as individual cards. With a growing student base, teachers cannot efficiently search, sort, or filter to find specific students by status, grade, batch, or submission date. The card layout requires scrolling through all entries to find a specific student and provides no quick way to see who has submitted, who is still in progress, or who has been approved.

The goal is to replace the card layout with a compact, filterable table using TanStack Table v8 styled with MUI components, matching the existing Nexus visual theme.

---

## Approach: TanStack Table v8 + MUI

**Why TanStack Table v8:**
- Headless — full control over markup using existing MUI components
- Lightweight (~14KB), no license cost
- Built-in per-column filtering, sorting, pagination, and global search
- No visual inconsistency with the rest of Nexus

**No AG Grid, no MUI DataGrid Pro** — column-level filters on DataGrid require a paid license; AG Grid is overkill for this list size (~100-200 students).

---

## Page Layout

```
+----------------------------------------------------------+
| Student Onboarding                                        |
+----------------------------------------------------------+
| [Pending Review]  [All Students]   <- tabs (preset)      |
+----------------------------------------------------------+
| Global search: [_________________________]               |
+----------------------------------------------------------+
| Name    | Email   | Grade | Batch | Status | Docs | Date | Actions |
| filter  | filter  | sel   | sel   | sel    |      | sort |         |
|---------|---------|-------|-------|--------|------|------|---------|
| Sienna  | jes@... | 12th  | NATA  |Approved| 3    |4/8   | [v] [x] |
| Aslam   | moh@... | gap   | NATA  |In Prog.| 0    |  -   | [v] [x] |
+----------------------------------------------------------+
| Showing 1-20 of 45   [< 1 2 3 >]                        |
+----------------------------------------------------------+
```

- Tabs act as **preset filters**: "Pending Review" sets Status filter = `submitted`; "All Students" clears all filters.
- Global search bar below tabs, matches on name and email.
- Each filterable column has a filter input in a sub-row below the header.
- Pagination: 20 rows per page default.

---

## Columns

| Column       | Type   | Filter Control              | Notes                                      |
|--------------|--------|-----------------------------|--------------------------------------------|
| Name         | text   | Text input (contains)       | Avatar + name in cell                      |
| Email        | text   | Text input (contains)       |                                            |
| Grade        | text   | Dropdown select             | Values: 10th, 11th, 12th, gap_year         |
| Batch        | text   | Dropdown select             | Derived from `classrooms[]` names          |
| Status       | badge  | Dropdown select             | in_progress, submitted, approved, rejected |
| Docs         | number | No filter                   | Count badge, grayed out if 0               |
| Submitted At | date   | Sortable only (no filter)   | "-" if not yet submitted                   |
| Actions      | buttons| No filter                   | Approve (green check) + Reject (red x)     |

**Status badge colors:**
- `in_progress` - grey
- `submitted` - blue (action needed)
- `approved` - green
- `rejected` - red

**Inline actions:**
- Both approve and reject buttons visible on every row regardless of status.
- Approve: optimistic UI update + success snackbar, no confirmation needed.
- Reject: opens a reason input dialog, submits on confirm.

---

## Detail Modal

Opens when the user clicks anywhere on a row (excluding the action buttons).

```
+------------------------------------------+
| [Avatar] Sienna Judith          [X close] |
|          jesielabishekjesiel@gmail.com    |
|          12th · 2025-26 · NATA 2026       |
+------------------------------------------+
| Status: [Approved]  Submitted: 4/8/2026  |
+------------------------------------------+
| Documents                                 |
|  [Aadhaar Card - verified]   [eye] [dl]  |
|  [Passport Photo - pending]  [eye] [dl]  |
|  [Signature - pending]       [eye] [dl]  |
+------------------------------------------+
| Rejection Reason (if rejected):           |
| "Document quality too low..."             |
+------------------------------------------+
|         [Reject]        [Approve]         |
+------------------------------------------+
```

- Student header: avatar, name, email, grade/academic year/batch.
- Status chip + submitted date visible at a glance.
- Documents listed with per-document status chips (verified/pending/rejected) and eye (preview) and download icons.
- If status is `rejected`, shows the stored rejection reason.
- Approve and Reject buttons at the bottom of the modal, same behavior as inline row actions.
- Reject flow: instead of opening a nested dialog, reveals a reason text input inline within the modal, then submits on confirm.

---

## Data Flow

**Existing API (no changes needed):**
- `GET /api/onboarding/review?status=submitted` - pending tab
- `GET /api/onboarding/review` - all students tab
- `POST /api/onboarding/review` - approve or reject action

**Existing types used:**
- `OnboardingReview` interface (defined in page.tsx, aligns with `NexusStudentOnboardingWithStudent`)
- `OnboardingStatus`: `in_progress | submitted | approved | rejected`
- `DocumentStatus`: `pending | verified | rejected`

**Client-side filtering only** - all data loaded once, TanStack Table handles filtering/sorting/pagination in memory. No server-side pagination needed for this list size.

---

## Files to Change

| File | Change |
|------|--------|
| `apps/nexus/src/app/(teacher)/teacher/onboarding-reviews/page.tsx` | Full rewrite: replace card layout with TanStack Table |
| `package.json` in `apps/nexus` | Add `@tanstack/react-table` dependency |

No shared package changes needed. No database or API changes needed.

---

## Verification

1. Run `pnpm dev:nexus` and navigate to `/teacher/onboarding-reviews`
2. Verify table renders all students with correct columns
3. Verify "Pending Review" tab filters to submitted-only rows
4. Verify "All Students" tab shows all rows
5. Verify global search filters by name and email
6. Verify each column filter works independently and in combination
7. Verify clicking a row opens the detail modal with correct student data and documents
8. Verify inline approve button updates the row status immediately
9. Verify inline reject button opens reason dialog and submits correctly
10. Verify modal approve/reject buttons behave identically to inline buttons
11. Run `pnpm type-check` - zero errors
12. Test on mobile viewport (375px) - table should be horizontally scrollable
