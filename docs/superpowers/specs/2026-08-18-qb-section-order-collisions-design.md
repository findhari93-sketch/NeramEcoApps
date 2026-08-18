# Question bank: section/number collision review tool

**Date:** 2026-08-18
**Status:** Design, not yet planned or built.
**Touched:** `apps/nexus`, `packages/database`
**Not touched:** `apps/app`, `apps/marketing`, `apps/admin`, no schema/migration changes

## Problem

Opening a paper's question list (`/teacher/question-bank/papers/[id]`) can show the same
question number two or three times under one section heading, mixing content that plainly
belongs to different subjects: "Q12" under Mathematics (MCQ) was simultaneously a real
differential-equation question, an "Agra Fort" GK match-list question, and a shanty-towns
aptitude question.

### What the data actually says

Queried against production on 2026-08-18, paper `4b6efd72-79c5-4fbd-b761-c2b67ddfbd33`
(JEE Paper 2, 2021, Session 1 AN, 107 questions total, currently deactivated and never
published, so nothing wrong is visible to students today):

| Section | Rows | Distinct numbers used |
|---|---|---|
| Mathematics (MCQ) | 38 | 20 |
| Mathematics (Numerical) | 15 | 5 |
| Aptitude | 52 | 36 |
| Drawing | 2 | 2 |

From question 12 onward, every Mathematics (MCQ) number carries 3 rows. Two of the three are
GK/aptitude content mistagged with `section = 'math_mcq'`, confirmed by their own `categories[]`
array, which is correctly tagged (`['aptitude', 'architecture_gk']`, `['planning',
'general_knowledge']`, etc.) even though `section` is wrong. All three rows in a collision share
one bulk-insert `created_at` timestamp, so insertion order carries no signal about which is
"real". This is consistent with a multi-column exam PDF where the parser lost its column and
stamped unrelated questions with the same row-position number.

A repo-wide scan (`GROUP BY original_paper_id, section, display_order HAVING count(*) > 1`) found
this pattern on 3 real papers (2019 Session 2, 2020 Session 1, 2021 Session 1), all uploaded
2026-04-08 through 2026-04-15. The other 22 JEE papers are clean. (A 4th match, a seed/test paper
with every row's `display_order` null, is a different, harmless case: `NULL` collides with itself
under Postgres grouping and needs no fix.)

This app's numbering convention is per-section, not global: each section restarts at 1 (a
paper's Aptitude range is its own "Q1 to Q50", independent of where Mathematics ends). That part
of the model is correct and this design does not change it — the bug is purely that some
questions carry the wrong `section`, which drags them into a numbering collision with the
section they were wrongly filed into.

### Why the existing "Redo all sections" tool doesn't fix this

The paper action menu already has a **Redo all sections** action
(`POST /api/question-bank/papers/[id]/sections`), built on `inferPaperSections()` in
`apps/nexus/src/lib/qb-section-inference.ts`. It classifies each question's content
(LaTeX/vocabulary regexes, format-based rules for drawing/numerical) but finds **one contiguous
boundary** across the whole paper: everything before some index is Mathematics, everything after
is Aptitude. That assumption is exactly what this corruption violates — the true structure here
is interleaved duplicates, not one clean maths-then-aptitude block. Running it as-is on a
corrupted paper would not produce a sane boundary.

What *is* reusable: the per-question content classifier itself (`contentSignal()`), and the
`categories[]` signal found above, both of which look at one question in isolation rather than
assuming a paper-wide layout.

## Goals

- Surface every paper with a section/number collision, anywhere in the question bank, not just
  the 3 known today — so a future bad upload is caught the same way.
- For each collision, suggest which section each colliding question actually belongs to, using
  signals that are already reliably correct in the data (`categories[]`, falling back to the
  existing per-question content classifier).
- Let a teacher confirm or override every suggestion before anything is written. Nothing is
  deleted — the investigation found genuinely different questions crammed onto one number, not
  literal duplicates, so every candidate needs a home, never removal.
- Assign the corrected question a number within its *target* section's own local sequence
  (append after that section's current highest number), never touching the numbering convention
  itself.

## Non-goals

- Not fixing the parser that caused this. Root-causing the multi-column extraction bug is a
  separate investigation; this tool is the cleanup path for what it already produced.
- Not a general question-editor. It only ever changes `section`, `section_order` and
  `display_order` on rows already flagged as colliding.
- Not migrating away from per-section local numbering. That convention is correct and used
  correctly elsewhere; this tool works within it.

## Data model

No schema changes. Reads and writes only existing columns on `nexus_qb_questions`: `section`,
`section_order`, `display_order`, plus read-only `categories`, `question_text`, `question_format`,
`options` for the suggestion heuristic.

## Backend

### `packages/database/src/queries/nexus/question-bank.ts`

**`findSectionOrderCollisions(client?)`**

One query across every paper:

```sql
select original_paper_id, section, display_order, array_agg(id) as question_ids
from nexus_qb_questions
where display_order is not null
group by original_paper_id, section, display_order
having count(*) > 1
```

Then a second query to pull the full candidate rows for every `question_id` returned (`id,
original_paper_id, section, display_order, question_text, question_format, options, categories`),
and a join against `nexus_qb_original_papers` for `exam_type, year, session` to label each paper
in the UI. Returns grouped by `original_paper_id`, each group holding its list of
`{ display_order, section, candidates: [...] }` collisions.

**`resolveSectionOrderCollisions(paperId, resolutions, client?)`**

```ts
resolutions: Array<{ question_id: string; section: QBQuestionSection; display_order: number }>
```

Scoped by `paperId` exactly like `setQuestionSections` (a stray id from another paper cannot be
written through this call). Writes `section`, `section_order` (derived from `QB_SECTION_ORDER`,
never accepted from the caller, matching the existing rule in `setQuestionSections`) and
`display_order` together, grouped into as few statements as practical. Returns
`{ updated: number }`.

### `apps/nexus/src/lib/qb-collision-suggestion.ts`

`suggestSection(question): QBQuestionSection | null`

1. Format wins first, same veto rule as `qb-section-inference.ts`: `DRAWING_PROMPT` → `drawing`,
   `NUMERICAL` → `math_numerical`.
2. Otherwise, map `categories[]` to a section using the existing `QBCategory` taxonomy groupings
   in `packages/database/src/types/index.ts`: the broad categories (`mathematics`, `aptitude`,
   `drawing`) and the "JEE Mathematics subcategories" block map to `math_mcq`; the "NATA
   categories" and "JEE Aptitude subcategories" blocks map to `aptitude`. First matching category
   wins.
3. If `categories` is empty or maps to nothing, fall back to `contentSignal()` (imported from
   `qb-section-inference.ts`, exported for reuse) run on this single question.
4. If nothing resolves, return `null` — the candidate is shown with no default and the teacher
   must pick, same "silent wrong guess is worse than a visible unknown" rule the existing
   inference already follows.

A collision group's "keeper" (the candidate whose current `section` already equals its
suggestion) is pre-selected as "leave as-is"; the rest default to "move to `<suggestion>`",
overridable to any of the 4 sections via a `Select`, matching `PaperQuestionList`'s existing
section-select pattern.

### API routes (staff-only, `verifyQBStaff`, matching `.../papers/[id]/sections/route.ts`)

**`GET /api/question-bank/section-collisions`** — runs `findSectionOrderCollisions`, computes
`suggestSection` server-side for every candidate, groups by paper. Response:

```ts
{ data: { papers: Array<{
    paper_id: string; exam_type: string; year: number; session: string;
    collisions: Array<{ section: string; display_order: number; candidates: Array<{
      id: string; question_text: string | null; question_format: string;
      current_section: string; suggested_section: string | null;
    }> }>
  }> } }
```

**`POST /api/question-bank/section-collisions/apply`** — body `{ paper_id, resolutions: [{
question_id, section }] }` (the caller only chooses *section*; the endpoint computes
`display_order`, see below). Validates every `question_id` belongs to `paper_id` and every
`section` is a real `QBQuestionSection` before writing, same validation shape as the existing
sections `PATCH` route.

**Renumbering algorithm inside the apply handler:**

1. Fetch current `max(display_order)` per section for `paper_id`, excluding the question rows
   being resolved in this request (so a question moving *out* of Aptitude doesn't inflate the
   max another question is about to append after).
2. Group the incoming resolutions by target `section`.
3. Within each group, assign `max + 1, max + 2, ...` in the order the client sent them — so two
   candidates both moving into Aptitude in the same apply call get distinct, non-colliding
   numbers, never both becoming "Aptitude Q51".
4. Call `resolveSectionOrderCollisions` with the fully-resolved `{ question_id, section,
   display_order }` list.

## Frontend

New page: `apps/nexus/src/app/(teacher)/teacher/question-bank/section-collisions/page.tsx`,
modeled directly on the existing `reclassify/page.tsx` proposal-review-apply shape (same
`PageHeader` with `backHref="/teacher/question-bank"`, same load/select/submit/Snackbar
structure) rather than inventing a new interaction pattern:

- Loads every paper's collisions via the `GET` route on mount.
- One paper at a time (accordion or simple stacked sections, one per paper): a header showing
  exam/year/session and the collision count, then each collision rendered as a small card group
  — the colliding `display_order` and current section as the card-group title, each candidate
  below it with its question text (through `MathText`, matching `PaperQuestionRow`'s LaTeX
  handling) and a `Select` defaulted to its suggestion.
- "Apply to this paper" button, disabled while any candidate in that paper still shows no
  selection (covers the `suggested_section: null` case). Calls the apply route with just that
  paper's resolutions, then re-fetches so a paper with all collisions resolved drops off the list.
- Linked from the hub's `MORE_TOOLS` array in `.../question-bank/page.tsx`, next to "Re-classify
  topics": label "Fix numbering clashes", description "Questions crammed onto the same number".

## Error handling

- Apply is a no-op until every candidate in the paper being applied has a selection; the button
  is disabled rather than submitting partial state.
- Every write is scoped and validated by `paper_id` server-side, matching the existing sections
  routes — a stray id can't cross papers.
- If the apply call fails partway (network error, one bad id), the client re-fetches collisions
  on the next load rather than trusting optimistic local state, so the teacher always sees the
  paper's real current condition, not a guess about what succeeded.

## Testing

- Unit: `findSectionOrderCollisions` grouping logic (pure function over rows, if extracted from
  the query layer, or an integration test against local Supabase per repo convention).
- Unit: `suggestSection` — one case per taxonomy branch (broad category, math subcategory,
  aptitude subcategory, format veto, empty-categories fallback to `contentSignal`, and the
  genuinely-unresolvable case returning `null`).
- Unit: the apply handler's renumbering step as a pure function — given a starting max-per-section
  map and a batch of resolutions, assert no two outputs in the same section collide, including
  the two-candidates-moving-to-the-same-section-at-once case.
- Component: the new review page — renders collision groups, Apply disabled until fully resolved,
  submits the expected payload, re-fetches after a successful apply.
- E2E: one smoke test (`nexus-chrome`, teacher account) — open the page, confirm a known
  collision renders, resolve it, apply, confirm it disappears from the list.

## Rollout

Ship inert until a teacher opens the new page. No effect on the 22 clean papers (they have no
collisions to show). The 3 known-affected papers are all currently deactivated and never
published, so there is no live-student risk while this is reviewed and applied.
