# Sketchbook Hub and One Review Screen (Milestones 2 and 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every drawing a student makes appears in their Sketchbook on its date and opens in the one teacher review screen (marking owed for assignments and tests, optional for practice), Inspiration gains "Practise this" and "Drawn from this", and the separate Drawing Reviews queue is retired.

**Architecture:** Sketchbook reads widen from `source_type = 'sketchbook'` to every drawing, with one pure rule module (`lib/drawing-source.ts`) deciding practice versus owed work, and the existing student release gate (`lib/student-drawing-payload.ts`) deciding what a student may see. The review screen at `/teacher/drawing-reviews/[id]` learns where it was opened from (`lib/review-context.ts`), so Back, breadcrumbs, J/K and Save-and-next follow that place, and it gains a practice mode (Next as the way on, no Redo for sketches, quick reactions, Show in Inspiration). The queue page, its nav item, flag and badge go; test drawings get a "Drawings to mark" list on the exam results sheet.

**Tech Stack:** Next.js 14 App Router (Nexus), MUI v5 through `@neram/ui`, Supabase Postgres (service role through API routes), SWR (`useAuthSWR`), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md` (sections "Sketchbook becomes the hub", "Retiring Drawing Reviews", "Teacher journeys", "Student journeys"). Milestone 1 (Inspiration) is live on prod since 2026-09-15.

## Global Constraints

- NEVER use em dashes, double dashes or `&mdash;` in any user-visible string. Use commas, colons, periods or parentheses.
- UI rules (ui-ux-pro-max, mandatory): touch targets 44 to 48px with 8px spacing, visible focus rings, 4.5:1 text contrast, `prefers-reduced-motion` respected, SVG icons from `@mui/icons-material` (never emoji as icons), skeletons for async content, no horizontal scroll at 375, 768, 1024 and 1440px, status never conveyed by colour alone (icon or text with it), one primary action per screen.
- Mobile first: phone layout first. The `@neram/ui` MUI theme is the source of truth for colour, type and spacing; import UI primitives from `@neram/ui`.
- Back links are explicit hrefs to the screen the user came from, never `router.back()`.
- Every message to a student goes through `sendNudge` (`apps/nexus/src/lib/nudge-delivery.ts`). No direct inserts into notification tables.
- Dormant students appear in no list and no count (`staffStudentIds` already applies this).
- Staging has NO `drawing_submissions.exam_attempt_id` or `exam_qb_question_id` columns. Never name either column in a PostgREST `select(...)` list; read them only from `select('*')` rows or decide by `source_type = 'exam'`.
- Nexus component tests must not use jest-dom matchers (`toBeInTheDocument` etc.); use `toBeTruthy()`, `toBeNull()`, `getAttribute`.
- Unit tests run from the repo root: `pnpm test:run <path>`. Type-checks: `npx tsc --noEmit -p apps/nexus/tsconfig.json` (0 errors) and `npx tsc --noEmit -p packages/database/tsconfig.json` (no error in a file you changed).
- Commit locally once per task with a message ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Never push, never deploy, never `git stash`.
- Migrations are applied to staging by the controller only, never by a task implementer.
- Practice sources are exactly `sketchbook`, `question_bank`, `free_practice`, `homework` with no `assignment_id`. Owed work is an assignment drawing (`assignment_id` set) or a test drawing (`source_type = 'exam'`).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/migrations/20260921090000_nexus_sketchbook_hub.sql` | `drawing_submissions.inspiration_item_id`, latest-drawing function for any source, `nexus_inspiration_attempts` | 1 |
| `supabase/migrations/20260921090100_notification_event_type_practice_reviewed.sql` | `practice_reviewed` notification event type | 1 |
| `apps/nexus/src/lib/drawing-source.ts` (+test) | Practice versus owed, source labels, grading-open rule, redo rule, review summary | 2 |
| `packages/database/src/queries/nexus/sketchbook.ts` (+test) | Widened reads, practice-scoped writes, `PRACTICE_SOURCE_TYPES` | 3 |
| `packages/database/src/queries/nexus/inspiration.ts` (+test) | Items for a submission, attempts, share opt-out read | 3 |
| `packages/database/src/queries/nexus/exam-drawings.ts` (+test) | `getExamDrawingMaxMarks` | 3 |
| `apps/nexus/src/lib/sketchbook-payload.ts` (+test) | Viewer-aware payload with review summaries and release gating | 4 |
| `apps/nexus/src/app/api/sketchbook/**` | me, students, entries (practise link, delete guard), react/flip/feature scope, preferences | 4 |
| `apps/nexus/src/lib/review-context.ts` (+test) | Where the review screen was opened from: Back, crumbs, query string, queue source | 5 |
| `apps/nexus/src/hooks/useReviewQueue.ts` (+test) | Queue for assignment, sketchbook month, flip inbox, exam | 5 |
| `apps/nexus/src/lib/practice-review-message.ts` (+test) | When and what to tell a student about a practice review | 6 |
| `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts` | Adds inspiration state, practised-from, live features, exam max marks | 6 |
| `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts` (+test) | Practice path: redo guard, seen flip, sendNudge, no tenant-wide next | 6 |
| `apps/nexus/src/components/drawings/review/InspirationSwitch.tsx` (+test) | Show in Inspiration switch | 7 |
| `apps/nexus/src/components/drawings/review/ReviewActionBar.tsx` (+test) | Owed and practice variants | 7 |
| `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx` | Context, practice mode, exam marks, quick reactions, practised-from | 8 |
| `apps/nexus/src/components/drawings/review/ReviewPanelBody.tsx`, `AIFeedbackWorkspace.tsx` | `quickActions` slot, `showEncouragement` flag | 8 |
| `apps/nexus/src/components/sketchbook/*` and sketchbook pages | Grid chips, share switch, links into review, student review panel, old page redirect | 9 |
| `apps/nexus/src/lib/inspiration-attempts.ts` (+test), `components/inspiration/InspirationAttempts.tsx`, `InspirationItemView.tsx`, `AddSketchSheet.tsx`, items route | Practise this, Drawn from this | 10 |
| `apps/nexus/src/lib/nav-config.tsx`, `feature-flags.ts`, `lib/owed-drawings.ts` (+test), `api/nav-badges/route.ts`, `NavBadgeProvider.tsx`, redirects, `hooks/useDraftSweep.ts` (+test) | Retire Drawing Reviews | 11 |
| `apps/nexus/src/app/api/exams/[examId]/drawings/route.ts` (+test), `components/scheduled-exams/ExamDrawingsToMark.tsx` (+test), `ExamResultsSheet.tsx`, exam page | Test drawings home | 12 |
| `tests/e2e/sketchbook-hub-nexus-mobile.spec.ts` and legacy specs | End to end | 13 |

---

### Task 1: Migrations

**Files:**
- Create: `supabase/migrations/20260921090000_nexus_sketchbook_hub.sql`
- Create: `supabase/migrations/20260921090100_notification_event_type_practice_reviewed.sql`

**Interfaces:**
- Produces: column `drawing_submissions.inspiration_item_id uuid null`; SQL function `nexus_inspiration_attempts(p_item_id uuid, p_viewer_id uuid, p_staff boolean, p_limit int default 24) returns jsonb` shaped `{ students: int, shown: int, rows: [{ submission_id, original_item_id, image_url, thumbnail_url, author_first_name, author_last_name, author_name, author_is_alumni, author_academic_year, submitted_at, status, tutor_rating, tutor_marks, reviewed_at, practised_from }] }` or SQL NULL when the item is missing or, for a student, not visible; enum value `notification_event_type 'practice_reviewed'`.

- [ ] **Step 1: Write the hub migration**

Create `supabase/migrations/20260921090000_nexus_sketchbook_hub.sql`:

```sql
-- ============================================
-- SKETCHBOOK HUB: every drawing on its date, practice linked to Inspiration
--
-- Spec: docs/superpowers/specs/2026-09-15-drawing-inspiration-design.md
-- Additive and idempotent.
-- ============================================

-- "Practise this": the Inspiration drawing a sketch was made from.
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS inspiration_item_id UUID REFERENCES nexus_inspiration_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_drawing_submissions_inspiration_item
  ON drawing_submissions (inspiration_item_id)
  WHERE inspiration_item_id IS NOT NULL;

-- The Class rhythm row's thumbnail is the student's latest drawing of any kind,
-- except a test paper, which a classmate may still be about to sit.
CREATE OR REPLACE FUNCTION public.nexus_latest_sketches(p_student_ids uuid[])
RETURNS TABLE (student_id uuid, submission_id uuid, thumbnail_url text, original_image_url text, submitted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (ds.student_id)
         ds.student_id, ds.id, ds.thumbnail_url, ds.original_image_url, ds.submitted_at
  FROM drawing_submissions ds
  WHERE ds.source_type <> 'exam'
    AND ds.student_id = ANY (p_student_ids)
  ORDER BY ds.student_id, ds.submitted_at DESC
$$;
REVOKE ALL ON FUNCTION public.nexus_latest_sketches(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nexus_latest_sketches(uuid[]) TO service_role;

-- Attempts drawn from one Inspiration drawing: sketches practised from it, and
-- every other submission to the same drawing question (the historical attempts).
-- Staff see all of them with the review state. A student sees only attempts
-- whose own original is itself visible in Inspiration (4 stars and above, not
-- opted out, not hidden), never a status, rating or mark, and never a
-- submission id. Test drawings never count.
CREATE OR REPLACE FUNCTION nexus_inspiration_attempts(
  p_item_id   uuid,
  p_viewer_id uuid,
  p_staff     boolean,
  p_limit     int DEFAULT 24
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $fn$
  WITH seed AS (
    SELECT i.id, i.source_submission_id, i.source_drawing_question_id
      FROM nexus_inspiration_items i
     WHERE i.id = p_item_id
       AND (p_staff OR EXISTS (
             SELECT 1
               FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, 'visible', p_viewer_id, false) v
              WHERE v.id = p_item_id))
  ),
  attempts AS (
    SELECT ds.id, ds.student_id, ds.original_image_url, ds.thumbnail_url, ds.submitted_at, ds.status,
           ds.tutor_rating::real AS tutor_rating, ds.tutor_marks::real AS tutor_marks, ds.reviewed_at,
           (ds.inspiration_item_id IS NOT DISTINCT FROM seed.id) AS practised_from
      FROM seed
      JOIN drawing_submissions ds
        ON ds.source_type <> 'exam'
       AND ds.id IS DISTINCT FROM seed.source_submission_id
       AND (ds.inspiration_item_id = seed.id
            OR (seed.source_drawing_question_id IS NOT NULL
                AND (ds.question_id = seed.source_drawing_question_id
                     OR ds.assignment_id IN (
                          SELECT ca.id FROM nexus_class_assignments ca
                           WHERE ca.drawing_question_id = seed.source_drawing_question_id))))
  ),
  originals AS (
    SELECT b.id AS item_id, b.source_submission_id, b.thumbnail_url AS item_thumb,
           b.author_first_name, b.author_last_name, b.author_name, b.author_is_alumni, b.author_academic_year
      FROM nexus_inspiration_base(NULL, NULL, NULL, NULL, CASE WHEN p_staff THEN 'all' ELSE 'visible' END, p_viewer_id, false) b
     WHERE b.source_kind = 'submission_original'
       AND b.source_submission_id IN (SELECT a.id FROM attempts a)
  ),
  shown AS (
    SELECT a.*, o.item_id, o.item_thumb,
           CASE WHEN p_staff THEN u.first_name ELSE o.author_first_name END AS first_name,
           CASE WHEN p_staff THEN u.last_name ELSE o.author_last_name END AS last_name,
           CASE WHEN p_staff THEN u.name ELSE o.author_name END AS full_name,
           CASE WHEN p_staff THEN coalesce(u.is_alumni, false) ELSE coalesce(o.author_is_alumni, false) END AS is_alumni,
           CASE WHEN p_staff THEN u.academic_year::text ELSE o.author_academic_year END AS academic_year
      FROM attempts a
      LEFT JOIN originals o ON o.source_submission_id = a.id
      LEFT JOIN users u ON u.id = a.student_id
     WHERE p_staff OR o.item_id IS NOT NULL
  ),
  page AS (
    SELECT * FROM shown
     ORDER BY practised_from DESC, submitted_at DESC, id
     LIMIT greatest(1, least(coalesce(p_limit, 24), 60))
  )
  SELECT jsonb_build_object(
           'students', (SELECT count(DISTINCT a.student_id) FROM attempts a),
           'shown', (SELECT count(*) FROM shown),
           'rows', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'submission_id', CASE WHEN p_staff THEN p.id END,
                      'original_item_id', p.item_id,
                      'image_url', p.original_image_url,
                      'thumbnail_url', coalesce(p.item_thumb, p.thumbnail_url),
                      'author_first_name', p.first_name,
                      'author_last_name', p.last_name,
                      'author_name', p.full_name,
                      'author_is_alumni', p.is_alumni,
                      'author_academic_year', p.academic_year,
                      'submitted_at', p.submitted_at,
                      'status', CASE WHEN p_staff THEN p.status END,
                      'tutor_rating', CASE WHEN p_staff THEN p.tutor_rating END,
                      'tutor_marks', CASE WHEN p_staff THEN p.tutor_marks END,
                      'reviewed_at', CASE WHEN p_staff THEN p.reviewed_at END,
                      'practised_from', p.practised_from)
                    ORDER BY p.practised_from DESC, p.submitted_at DESC, p.id)
               FROM page p), '[]'::jsonb))
  WHERE EXISTS (SELECT 1 FROM seed)
$fn$;

REVOKE ALL ON FUNCTION nexus_inspiration_attempts(uuid, uuid, boolean, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION nexus_inspiration_attempts(uuid, uuid, boolean, int) TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the event type migration**

Create `supabase/migrations/20260921090100_notification_event_type_practice_reviewed.sql`:

```sql
-- A teacher reviewed a practice drawing (a sketch, a question bank drawing,
-- free practice or homework) from the one review screen.
-- Additive and idempotent. ADD VALUE IF NOT EXISTS is safe to re-run and is
-- kept in its own file so no statement in the same transaction uses the value.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'practice_reviewed';
```

- [ ] **Step 3: Self-check by reading**

Confirm by reading, since there is no local database: every table and column named exists in `supabase/migrations/20260920090000_nexus_inspiration_schema.sql`, `20260920090200_nexus_inspiration_search_rpc.sql` (the `nexus_inspiration_base` column list) and `20260913090000_nexus_sketchbook.sql`; no statement names `exam_attempt_id`; the function has no `SECURITY DEFINER`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260921090000_nexus_sketchbook_hub.sql supabase/migrations/20260921090100_notification_event_type_practice_reviewed.sql
git commit -m "feat(db): sketchbook hub migrations, practice link, attempts under an Inspiration drawing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5 (CONTROLLER ONLY): apply to staging and verify**

Apply each file through `mcp__supabase-staging__execute_sql` with `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<filename ts>', '<name>') ON CONFLICT (version) DO NOTHING;` appended, then run:

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drawing_submissions' AND column_name='inspiration_item_id') AS col,
  (SELECT count(*) FROM pg_proc WHERE proname='nexus_inspiration_attempts') AS attempts_fn,
  EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='notification_event_type' AND e.enumlabel='practice_reviewed') AS enum_value,
  has_function_privilege('anon', 'nexus_inspiration_attempts(uuid, uuid, boolean, int)', 'EXECUTE') AS anon_can;
SELECT nexus_inspiration_attempts((SELECT id FROM nexus_inspiration_items LIMIT 1), NULL, true);
```

Expected: `col` true, `attempts_fn` 1, `enum_value` true, `anon_can` false; the second query returns a jsonb object (or NULL when staging has no items).

---

### Task 2: Drawing source rules

**Files:**
- Create: `apps/nexus/src/lib/drawing-source.ts`
- Test: `apps/nexus/src/lib/drawing-source.test.ts`

**Interfaces:**
- Produces (exact names):
  - `type DrawingSourceType = 'sketchbook' | 'question_bank' | 'free_practice' | 'homework' | 'assignment' | 'exam'`
  - `const PRACTICE_SOURCES: readonly DrawingSourceType[]`
  - `interface DrawingSourceFacts { source_type: string | null; assignment_id?: string | null }`
  - `type ReviewKind = 'practice' | 'assignment' | 'test'`
  - `reviewKindOf(row: DrawingSourceFacts): ReviewKind`
  - `isPracticeDrawing(row: DrawingSourceFacts): boolean`
  - `drawingSourceLabel(source: string | null): string`
  - `interface ReviewFacts extends DrawingSourceFacts { status: string; reviewed_at?: string | null }`
  - `wasReviewedBefore(row: ReviewFacts): boolean`
  - `opensForGrading(row: ReviewFacts, hasNewerAttempt: boolean): boolean`
  - `canRedo(row: DrawingSourceFacts): boolean`
  - `type ReviewState = 'none' | 'waiting' | 'reviewed' | 'redo'`
  - `interface ReviewSummary { state: ReviewState; rating: number | null; marks: number | null }`
  - `summarizeReview(row: ReviewFacts & { tutor_rating?: number | null; tutor_marks?: number | null }, released: boolean): ReviewSummary`

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/lib/drawing-source.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PRACTICE_SOURCES,
  canRedo,
  drawingSourceLabel,
  isPracticeDrawing,
  opensForGrading,
  reviewKindOf,
  summarizeReview,
  wasReviewedBefore,
} from './drawing-source';

describe('reviewKindOf', () => {
  it('treats a test drawing as a test even if it carries no assignment', () => {
    expect(reviewKindOf({ source_type: 'exam', assignment_id: null })).toBe('test');
  });
  it('treats anything with an assignment as owed assignment work', () => {
    expect(reviewKindOf({ source_type: 'assignment', assignment_id: 'a1' })).toBe('assignment');
  });
  it('treats sketches, question bank, free practice and homework as practice', () => {
    for (const source of ['sketchbook', 'question_bank', 'free_practice', 'homework']) {
      expect(isPracticeDrawing({ source_type: source, assignment_id: null })).toBe(true);
    }
    expect([...PRACTICE_SOURCES].sort()).toEqual(['free_practice', 'homework', 'question_bank', 'sketchbook']);
  });
});

describe('drawingSourceLabel', () => {
  it('names every source in plain words', () => {
    expect(drawingSourceLabel('sketchbook')).toBe('Sketch');
    expect(drawingSourceLabel('question_bank')).toBe('Question bank');
    expect(drawingSourceLabel('free_practice')).toBe('Practice');
    expect(drawingSourceLabel('homework')).toBe('Homework');
    expect(drawingSourceLabel('assignment')).toBe('Assignment');
    expect(drawingSourceLabel('exam')).toBe('Test');
    expect(drawingSourceLabel(null)).toBe('Drawing');
  });
});

describe('wasReviewedBefore', () => {
  it('does not read a fresh sketch as reviewed, even though it is stored completed', () => {
    expect(wasReviewedBefore({ source_type: 'sketchbook', status: 'completed', reviewed_at: null })).toBe(false);
  });
  it('reads a sketch with a review time as reviewed', () => {
    expect(wasReviewedBefore({ source_type: 'sketchbook', status: 'completed', reviewed_at: '2026-09-16T10:00:00Z' })).toBe(true);
  });
  it('reads a completed or redo assignment round as reviewed', () => {
    expect(wasReviewedBefore({ source_type: 'assignment', assignment_id: 'a', status: 'completed' })).toBe(true);
    expect(wasReviewedBefore({ source_type: 'assignment', assignment_id: 'a', status: 'redo' })).toBe(true);
  });
  it('reads a submitted round as not reviewed', () => {
    expect(wasReviewedBefore({ source_type: 'assignment', assignment_id: 'a', status: 'submitted' })).toBe(false);
  });
});

describe('opensForGrading', () => {
  it('opens a sketch nobody has reviewed ready to grade', () => {
    expect(opensForGrading({ source_type: 'sketchbook', status: 'completed', reviewed_at: null }, false)).toBe(true);
  });
  it('locks a sketch that already has a review', () => {
    expect(opensForGrading({ source_type: 'sketchbook', status: 'completed', reviewed_at: '2026-09-16T10:00:00Z' }, false)).toBe(false);
  });
  it('keeps the assignment rule: submitted and redo open, completed locks, a newer attempt locks', () => {
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'submitted' }, false)).toBe(true);
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'redo' }, false)).toBe(true);
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'completed' }, false)).toBe(false);
    expect(opensForGrading({ source_type: 'assignment', assignment_id: 'a', status: 'submitted' }, true)).toBe(false);
  });
});

describe('canRedo', () => {
  it('offers no redo for a sketch or a test drawing', () => {
    expect(canRedo({ source_type: 'sketchbook' })).toBe(false);
    expect(canRedo({ source_type: 'exam' })).toBe(false);
  });
  it('keeps redo for assignments and question bank practice', () => {
    expect(canRedo({ source_type: 'assignment', assignment_id: 'a' })).toBe(true);
    expect(canRedo({ source_type: 'question_bank' })).toBe(true);
  });
});

describe('summarizeReview', () => {
  const reviewedSketch = { source_type: 'sketchbook', status: 'completed', reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 4, tutor_marks: null };
  it('shows the rating of a released review', () => {
    expect(summarizeReview(reviewedSketch, true)).toEqual({ state: 'reviewed', rating: 4, marks: null });
  });
  it('says waiting for owed work that is not released, and shows nothing of it', () => {
    const held = { source_type: 'assignment', assignment_id: 'a', status: 'submitted', reviewed_at: null, tutor_rating: 5 };
    expect(summarizeReview(held, false)).toEqual({ state: 'waiting', rating: null, marks: null });
  });
  it('says none for practice nobody reviewed', () => {
    expect(summarizeReview({ source_type: 'sketchbook', status: 'completed', reviewed_at: null }, true)).toEqual({ state: 'none', rating: null, marks: null });
  });
  it('says redo and hides the grade for a redo round', () => {
    expect(summarizeReview({ source_type: 'question_bank', status: 'redo', reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 2 }, true)).toEqual({ state: 'redo', rating: null, marks: null });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/drawing-source.test.ts`
Expected: FAIL, `Cannot find module './drawing-source'`.

- [ ] **Step 3: Write the implementation**

Create `apps/nexus/src/lib/drawing-source.ts`:

```ts
/**
 * Where a drawing came from, and what that means for reviewing it.
 *
 * Every drawing a student makes is one drawing_submissions row, and the
 * Sketchbook shows all of them. There are two kinds of work:
 *   OWED      an assignment drawing or a test drawing. A teacher has to mark it.
 *   PRACTICE  a sketch, a question bank drawing, free practice or homework.
 *             Marking is optional and nothing is pending.
 *
 * The database package keeps the same list as PRACTICE_SOURCE_TYPES in
 * queries/nexus/sketchbook.ts (a package cannot import from an app); the test
 * holds the two in step.
 *
 * Decided by source_type and assignment_id only, never exam_attempt_id: staging
 * has no such column, and every test drawing is source_type 'exam'.
 */

export type DrawingSourceType = 'sketchbook' | 'question_bank' | 'free_practice' | 'homework' | 'assignment' | 'exam';

export const PRACTICE_SOURCES: readonly DrawingSourceType[] = ['sketchbook', 'question_bank', 'free_practice', 'homework'];

export interface DrawingSourceFacts {
  source_type: string | null;
  assignment_id?: string | null;
}

export type ReviewKind = 'practice' | 'assignment' | 'test';

export function reviewKindOf(row: DrawingSourceFacts): ReviewKind {
  if (row.source_type === 'exam') return 'test';
  if (row.assignment_id) return 'assignment';
  return 'practice';
}

export function isPracticeDrawing(row: DrawingSourceFacts): boolean {
  return reviewKindOf(row) === 'practice';
}

const LABELS: Record<DrawingSourceType, string> = {
  sketchbook: 'Sketch',
  question_bank: 'Question bank',
  free_practice: 'Practice',
  homework: 'Homework',
  assignment: 'Assignment',
  exam: 'Test',
};

export function drawingSourceLabel(source: string | null): string {
  return LABELS[source as DrawingSourceType] ?? 'Drawing';
}

export interface ReviewFacts extends DrawingSourceFacts {
  status: string;
  reviewed_at?: string | null;
}

/**
 * True once a teacher has acted on this round. A sketch is stored 'completed'
 * the moment it is uploaded, so for a sketch only reviewed_at can say so.
 */
export function wasReviewedBefore(row: ReviewFacts): boolean {
  if (row.reviewed_at) return true;
  if (row.source_type === 'sketchbook') return false;
  return ['reviewed', 'completed', 'redo'].includes(row.status);
}

/** Opens ready to grade, or locked behind Evaluate. Never a dead end: Evaluate always reopens. */
export function opensForGrading(row: ReviewFacts, hasNewerAttempt: boolean): boolean {
  if (hasNewerAttempt) return false;
  if (row.source_type === 'sketchbook') return !row.reviewed_at;
  return !['reviewed', 'completed'].includes(row.status);
}

/** Redo asks the student to draw it again. A sketch and a test paper have no redo round. */
export function canRedo(row: DrawingSourceFacts): boolean {
  return row.source_type !== 'sketchbook' && reviewKindOf(row) !== 'test';
}

export type ReviewState = 'none' | 'waiting' | 'reviewed' | 'redo';

export interface ReviewSummary {
  state: ReviewState;
  rating: number | null;
  marks: number | null;
}

/**
 * What a Sketchbook tile says about the teacher's review. `released` is false
 * when the viewer is the student and the review has not been handed back
 * (lib/student-drawing-payload), and then nothing of the review shows.
 */
export function summarizeReview(
  row: ReviewFacts & { tutor_rating?: number | null; tutor_marks?: number | null },
  released: boolean,
): ReviewSummary {
  const owed = !isPracticeDrawing(row);
  const empty: ReviewSummary = { state: owed ? 'waiting' : 'none', rating: null, marks: null };
  if (!released) return empty;
  if (row.status === 'redo') return { state: 'redo', rating: null, marks: null };
  if (wasReviewedBefore(row)) {
    return { state: 'reviewed', rating: row.tutor_rating ?? null, marks: row.tutor_marks ?? null };
  }
  return empty;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test:run apps/nexus/src/lib/drawing-source.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/drawing-source.ts apps/nexus/src/lib/drawing-source.test.ts
git commit -m "feat(nexus): one rule for practice versus owed drawings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Database queries

**Files:**
- Modify: `packages/database/src/queries/nexus/sketchbook.ts` (interface and columns at lines 11-33; `listSketchbookMonth` 47-64; `countSketches` 66-75; `firstAndLatestSketch` 77-90; after `getSketchbookSketch` 92-105; `listUnflipped` 296-302; `setSketchbookReaction` 479-493)
- Modify: `packages/database/src/queries/nexus/inspiration.ts` (append)
- Modify: `packages/database/src/queries/nexus/exam-drawings.ts` (append)
- Test: `packages/database/src/queries/nexus/sketchbook.test.ts` (append), `inspiration.test.ts` (append), `exam-drawings.test.ts` (append)

**Interfaces:**
- Consumes: migration from Task 1 (`inspiration_item_id`, `nexus_inspiration_attempts`).
- Produces (exported from `@neram/database/queries/nexus`, which already re-exports these files):
  - `PRACTICE_SOURCE_TYPES: readonly ['sketchbook', 'question_bank', 'free_practice', 'homework']`
  - `type SketchbookViewer = 'student' | 'staff'`
  - `SketchbookSketchRow` gains `source_type: string; status: string; assignment_id: string | null; question_id: string | null; reviewed_at: string | null; tutor_rating: number | null; tutor_marks: number | null; inspiration_item_id: string | null; assignment: { id: string; title: string | null; evaluation_type: string | null; max_marks: number | null } | null`
  - `listSketchbookMonth(studentId: string, month: string, viewer?: SketchbookViewer, client?)` (viewer defaults to `'student'`)
  - `countSketches(studentId: string, viewer?: SketchbookViewer, client?)`
  - `getSketchbookDrawing(id: string, client?): Promise<SketchbookSketchRow | null>` (any source)
  - `getPracticeDrawing(id: string, client?): Promise<SketchbookSketchRow | null>` (practice sources, no assignment)
  - `getSketchbookSketch` unchanged: sketchbook uploads only (delete uses it)
  - `interface SubmissionInspirationState { item_id: string; curation: 'auto' | 'shown' | 'hidden'; visible: boolean; auto_eligible: boolean }`
  - `getInspirationItemsForSubmission(submissionId: string, client?): Promise<{ original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null }>`
  - `interface InspirationAttemptRow { submission_id: string | null; original_item_id: string | null; image_url: string; thumbnail_url: string | null; author_first_name: string | null; author_last_name: string | null; author_name: string | null; author_is_alumni: boolean; author_academic_year: string | null; submitted_at: string; status: string | null; tutor_rating: number | null; tutor_marks: number | null; reviewed_at: string | null; practised_from: boolean }`
  - `listInspirationAttempts(itemId: string, viewerId: string, staff: boolean, limit?: number, client?): Promise<{ students: number; shown: number; rows: InspirationAttemptRow[] }>`
  - `getDrawingSharingOptOut(userId: string, client?): Promise<boolean>`
  - `getExamDrawingMaxMarks(attemptId: string, qbQuestionId: string, client?): Promise<number | null>`

- [ ] **Step 1: Write the failing tests**

Append to `packages/database/src/queries/nexus/sketchbook.test.ts`, keeping the existing `monthRangeIst` tests and merging these names into the existing import from `./sketchbook`:

```ts
import {
  PRACTICE_SOURCE_TYPES,
  countSketches,
  getPracticeDrawing,
  listSketchbookMonth,
  listUnflipped,
  setSketchbookReaction,
} from './sketchbook';

/** A client whose query builder records every call and resolves to `result`. */
function fakeClient(result: { data: unknown; error: unknown; count?: number }) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return chain;
        };
      },
    },
  );
  const client: any = { from: (...args: unknown[]) => { calls.push(['from', args]); return chain; } };
  return { client, calls };
}

const named = (calls: Array<[string, unknown[]]>, name: string) => calls.filter(([n]) => n === name).map(([, a]) => a);

describe('sketchbook reads cover every drawing', () => {
  it('gives a student every drawing of the month except their test papers', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listSketchbookMonth('s1', '2026-09', 'student', client);
    expect(named(calls, 'eq')).not.toContainEqual(['source_type', 'sketchbook']);
    expect(named(calls, 'neq')).toContainEqual(['source_type', 'exam']);
  });

  it('gives staff every drawing of the month, test papers included', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listSketchbookMonth('s1', '2026-09', 'staff', client);
    expect(named(calls, 'neq')).toEqual([]);
    expect(named(calls, 'eq')).not.toContainEqual(['source_type', 'sketchbook']);
  });

  it('counts a student drawings without test papers', async () => {
    const { client, calls } = fakeClient({ data: null, error: null, count: 3 });
    expect(await countSketches('s1', 'student', client)).toBe(3);
    expect(named(calls, 'neq')).toContainEqual(['source_type', 'exam']);
  });
});

describe('practice-only reads and writes', () => {
  it('lists the flip inbox from unreviewed practice only', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await listUnflipped('t1', ['s1'], 20, client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
    expect(named(calls, 'is')).toContainEqual(['reviewed_at', null]);
  });

  it('finds a practice drawing and never an assignment drawing', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await getPracticeDrawing('d1', client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
  });

  it('reacts on practice drawings only', async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await setSketchbookReaction('d1', 'fire', client);
    expect(named(calls, 'in')).toContainEqual(['source_type', [...PRACTICE_SOURCE_TYPES]]);
    expect(named(calls, 'is')).toContainEqual(['assignment_id', null]);
  });
});
```

Append to `packages/database/src/queries/nexus/inspiration.test.ts` (reuse its existing `fakeClient`; add the new names to its import from `./inspiration`):

```ts
describe('getInspirationItemsForSubmission', () => {
  it('splits the original and the reference', async () => {
    const { client } = fakeClient({
      data: [
        { id: 'o', source_kind: 'submission_original', curation: 'auto', is_visible: true, auto_eligible: true },
        { id: 'r', source_kind: 'submission_reference', curation: 'hidden', is_visible: false, auto_eligible: true },
      ],
      error: null,
    });
    expect(await getInspirationItemsForSubmission('sub', client)).toEqual({
      original: { item_id: 'o', curation: 'auto', visible: true, auto_eligible: true },
      reference: { item_id: 'r', curation: 'hidden', visible: false, auto_eligible: true },
    });
  });

  it('answers nulls when the sync has not made items yet', async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await getInspirationItemsForSubmission('sub', client)).toEqual({ original: null, reference: null });
  });
});

describe('listInspirationAttempts', () => {
  it('reads counts and rows from the function', async () => {
    const { client, calls } = fakeClient({
      data: { students: '14', shown: '5', rows: [{ submission_id: null, original_item_id: 'i', practised_from: true }] },
      error: null,
    });
    const out = await listInspirationAttempts('item', 'viewer', false, 24, client);
    expect(out.students).toBe(14);
    expect(out.shown).toBe(5);
    expect(out.rows).toHaveLength(1);
    expect(calls[0]).toEqual(['rpc', ['nexus_inspiration_attempts', { p_item_id: 'item', p_viewer_id: 'viewer', p_staff: false, p_limit: 24 }]]);
  });

  it('answers empty when the item is missing or not visible', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await listInspirationAttempts('item', 'viewer', false, 24, client)).toEqual({ students: 0, shown: 0, rows: [] });
  });
});

describe('getDrawingSharingOptOut', () => {
  it('reads the flag', async () => {
    const { client } = fakeClient({ data: { share_drawings_opt_out: true }, error: null });
    expect(await getDrawingSharingOptOut('u', client)).toBe(true);
  });
});
```

Append to `packages/database/src/queries/nexus/exam-drawings.test.ts` (add `getExamDrawingMaxMarks` to its import; if the file has no fake client helper, paste the `fakeClient` from the sketchbook test above):

```ts
describe('getExamDrawingMaxMarks', () => {
  it('reads the marks the test gives this question', async () => {
    const { client } = fakeClient({ data: { test_id: 't1', marks: 25 }, error: null });
    expect(await getExamDrawingMaxMarks('attempt', 'q1', client)).toBe(25);
  });

  it('answers null when the attempt is gone', async () => {
    const { client } = fakeClient({ data: null, error: null });
    expect(await getExamDrawingMaxMarks('attempt', 'q1', client)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:run packages/database/src/queries/nexus/sketchbook.test.ts packages/database/src/queries/nexus/inspiration.test.ts packages/database/src/queries/nexus/exam-drawings.test.ts`
Expected: FAIL on the new cases (missing exports, the old `source_type = 'sketchbook'` filter).

- [ ] **Step 3: Implement `sketchbook.ts`**

Replace lines 11-33 (the row interface through `SKETCH_COLUMNS`) with:

```ts
/** Practice kinds: marking is optional and nothing is pending. Mirrors apps/nexus/src/lib/drawing-source.ts. */
export const PRACTICE_SOURCE_TYPES = ['sketchbook', 'question_bank', 'free_practice', 'homework'] as const;

/** Who is reading. A student never sees their own test papers here: those marks are embargoed until results are published. */
export type SketchbookViewer = 'student' | 'staff';

export interface SketchbookSketchRow {
  id: string;
  student_id: string;
  original_image_url: string;
  thumbnail_url: string | null;
  self_note: string | null;
  reaction: SketchbookReaction | null;
  submitted_at: string;
  is_gallery_visible: boolean;
  source_type: string;
  status: string;
  assignment_id: string | null;
  question_id: string | null;
  reviewed_at: string | null;
  tutor_rating: number | null;
  tutor_marks: number | null;
  inspiration_item_id: string | null;
  assignment: { id: string; title: string | null; evaluation_type: string | null; max_marks: number | null } | null;
}

export interface SketchbookInboxRow extends SketchbookSketchRow {
  student: { id: string; name: string | null; avatar_url: string | null; ms_oid: string | null };
}

export interface SketchbookFeatureFact {
  classroom_id: string;
  classroom_name: string;
  featured_at: string;
}

// Never name exam_attempt_id here: staging has no such column, and a named
// missing column makes PostgREST answer an error instead of rows.
const SKETCH_COLUMNS =
  'id, student_id, original_image_url, thumbnail_url, self_note, reaction, submitted_at, is_gallery_visible, ' +
  'source_type, status, assignment_id, question_id, reviewed_at, tutor_rating, tutor_marks, inspiration_item_id, ' +
  'assignment:nexus_class_assignments!drawing_submissions_assignment_id_fkey(id, title, evaluation_type, max_marks)';
```

Replace `listSketchbookMonth`, `countSketches` and `firstAndLatestSketch` (lines 47-90) with:

```ts
export async function listSketchbookMonth(
  studentId: string,
  month: string,
  viewer: SketchbookViewer = 'student',
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow[]> {
  const supabase = client || getSupabaseAdminClient();
  const { from, to } = monthRangeIst(month);
  let query = supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('student_id', studentId)
    .gte('submitted_at', from)
    .lt('submitted_at', to);
  if (viewer === 'student') query = query.neq('source_type', 'exam');
  const { data, error } = await query.order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function countSketches(
  studentId: string,
  viewer: SketchbookViewer = 'student',
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from('drawing_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId);
  if (viewer === 'student') query = query.neq('source_type', 'exam');
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function firstAndLatestSketch(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ first: SketchbookSketchRow; latest: SketchbookSketchRow } | null> {
  const supabase = client || getSupabaseAdminClient();
  // "Then and now" compares the student's own drawings, never a test paper.
  const base = () =>
    supabase.from('drawing_submissions').select(SKETCH_COLUMNS).eq('student_id', studentId).neq('source_type', 'exam');
  const [{ data: first }, { data: latest }] = await Promise.all([
    base().order('submitted_at', { ascending: true }).limit(1).maybeSingle(),
    base().order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!first || !latest) return null;
  return { first, latest };
}
```

Directly after `getSketchbookSketch` (which stays exactly as it is: sketchbook uploads only), add:

```ts
/** One drawing of any kind, to open it inside its sketchbook month. */
export async function getSketchbookDrawing(
  id: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase.from('drawing_submissions').select(SKETCH_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * One practice drawing: a sketch, question bank, free practice or homework, and
 * never an assignment or a test. The flip, react and feature routes use it, so a
 * wrong id can never react to or feature owed work.
 */
export async function getPracticeDrawing(
  id: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('id', id)
    .in('source_type', [...PRACTICE_SOURCE_TYPES])
    .is('assignment_id', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

In `listUnflipped`, replace the `.eq('source_type', 'sketchbook')` line (line 299) with:

```ts
    // Practice nobody has reviewed yet. Assignment and test drawings are owed
    // work with their own homes and badges, and a reviewed drawing is not news.
    .in('source_type', [...PRACTICE_SOURCE_TYPES])
    .is('assignment_id', null)
    .is('reviewed_at', null)
```

In `setSketchbookReaction`, replace the comment and the update chain (lines 485-491) with:

```ts
  // Scoped to practice so a wrong id can never overwrite the shared `reaction`
  // column on an assignment or test drawing, which the review screen owns.
  const { error } = await supabase
    .from('drawing_submissions')
    .update({ reaction })
    .eq('id', submissionId)
    .in('source_type', [...PRACTICE_SOURCE_TYPES])
    .is('assignment_id', null);
```

- [ ] **Step 4: Implement the `inspiration.ts` additions**

Append to `packages/database/src/queries/nexus/inspiration.ts` (it already imports `getSupabaseAdminClient` and `TypedSupabaseClient`; reuse those names):

```ts
export interface SubmissionInspirationState {
  item_id: string;
  curation: 'auto' | 'shown' | 'hidden';
  visible: boolean;
  auto_eligible: boolean;
}

/** The Inspiration items made from one submission, for the review screen's switch. */
export async function getInspirationItemsForSubmission(
  submissionId: string,
  client?: TypedSupabaseClient,
): Promise<{ original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_inspiration_items')
    .select('id, source_kind, curation, is_visible, auto_eligible')
    .eq('source_submission_id', submissionId);
  if (error) throw error;
  const out: { original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null } = { original: null, reference: null };
  for (const row of (data ?? []) as Array<{ id: string; source_kind: string; curation: SubmissionInspirationState['curation']; is_visible: boolean; auto_eligible: boolean }>) {
    const state = { item_id: row.id, curation: row.curation, visible: !!row.is_visible, auto_eligible: !!row.auto_eligible };
    if (row.source_kind === 'submission_original') out.original = state;
    if (row.source_kind === 'submission_reference') out.reference = state;
  }
  return out;
}

export interface InspirationAttemptRow {
  submission_id: string | null;
  original_item_id: string | null;
  image_url: string;
  thumbnail_url: string | null;
  author_first_name: string | null;
  author_last_name: string | null;
  author_name: string | null;
  author_is_alumni: boolean;
  author_academic_year: string | null;
  submitted_at: string;
  status: string | null;
  tutor_rating: number | null;
  tutor_marks: number | null;
  reviewed_at: string | null;
  practised_from: boolean;
}

/** "Drawn from this". Who sees what is decided in nexus_inspiration_attempts, not here. */
export async function listInspirationAttempts(
  itemId: string,
  viewerId: string,
  staff: boolean,
  limit = 24,
  client?: TypedSupabaseClient,
): Promise<{ students: number; shown: number; rows: InspirationAttemptRow[] }> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any).rpc('nexus_inspiration_attempts', {
    p_item_id: itemId,
    p_viewer_id: viewerId,
    p_staff: staff,
    p_limit: limit,
  });
  if (error) throw error;
  if (!data) return { students: 0, shown: 0, rows: [] };
  const body = data as { students: number | string; shown: number | string; rows: InspirationAttemptRow[] | null };
  return { students: Number(body.students) || 0, shown: Number(body.shown) || 0, rows: body.rows ?? [] };
}

export async function getDrawingSharingOptOut(userId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any).from('users').select('share_drawings_opt_out').eq('id', userId).maybeSingle();
  if (error) throw error;
  return !!data?.share_drawings_opt_out;
}
```

- [ ] **Step 5: Implement `getExamDrawingMaxMarks`**

Append to `packages/database/src/queries/nexus/exam-drawings.ts`:

```ts
/**
 * The marks one test gives one drawing question, so the review screen can offer
 * a marks box out of the right number. Without it a test drawing was scored in
 * stars, tutor_marks stayed empty, and the attempt never finalised.
 */
export async function getExamDrawingMaxMarks(
  attemptId: string,
  qbQuestionId: string,
  client?: TypedSupabaseClient,
): Promise<number | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data: attempt } = await supabase.from(ATTEMPTS).select('test_id').eq('id', attemptId).maybeSingle();
  if (!attempt) return null;
  const { data: question } = await supabase
    .from('nexus_test_questions' as any)
    .select('marks')
    .eq('test_id', (attempt as any).test_id)
    .eq('qb_question_id', qbQuestionId)
    .maybeSingle();
  const marks = Number((question as any)?.marks);
  return Number.isFinite(marks) && marks > 0 ? marks : null;
}
```

- [ ] **Step 6: Run the tests and type-checks**

Run: `pnpm test:run packages/database/src/queries/nexus/sketchbook.test.ts packages/database/src/queries/nexus/inspiration.test.ts packages/database/src/queries/nexus/exam-drawings.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p packages/database/tsconfig.json` then `npx tsc --noEmit -p apps/nexus/tsconfig.json`
Expected: no error in a file you changed. If Nexus reports a caller passing a client in the old argument position of `listSketchbookMonth` or `countSketches`, insert the viewer argument there.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/queries/nexus/sketchbook.ts packages/database/src/queries/nexus/sketchbook.test.ts packages/database/src/queries/nexus/inspiration.ts packages/database/src/queries/nexus/inspiration.test.ts packages/database/src/queries/nexus/exam-drawings.ts packages/database/src/queries/nexus/exam-drawings.test.ts
git commit -m "feat(db): sketchbook reads every drawing, practice-only writes, attempts and exam marks queries

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Sketchbook payload and API routes

**Files:**
- Modify: `apps/nexus/src/lib/sketchbook-payload.ts` (whole file shown below)
- Modify: `apps/nexus/src/app/api/sketchbook/me/route.ts`, `students/[id]/route.ts`, `entries/route.ts`, `entries/[id]/route.ts`, `entries/[id]/react/route.ts`, `entries/[id]/flip/route.ts`, `entries/[id]/feature/route.ts`, `preferences/route.ts`
- Modify: `apps/nexus/src/components/sketchbook/sketchbook-api.ts`
- Test: `apps/nexus/src/lib/sketchbook-payload.test.ts` (create), `apps/nexus/src/app/api/sketchbook/entries/route.test.ts` (create), `apps/nexus/src/app/api/sketchbook/entries/[id]/route.test.ts` (create), `apps/nexus/src/app/api/sketchbook/preferences/route.test.ts` (create)

**Interfaces:**
- Consumes: Task 2 (`reviewKindOf`, `summarizeReview`, `ReviewKind`, `ReviewSummary`); Task 3 (`listSketchbookMonth(studentId, month, viewer)`, `countSketches(studentId, viewer)`, `getSketchbookDrawing`, `getPracticeDrawing`, `getDrawingSharingOptOut`, `SketchbookViewer`); existing `heldIdsFrom`, `isReleasedForStudent` (`lib/student-drawing-payload.ts`), `loadManualEvaluations` (`lib/student-drawing-payload-server.ts`), `getInspirationItem(id, viewerId, scope)` and `setDrawingSharingOptOut(userId, optOut)` from `@neram/database/queries/nexus`.
- Produces:
  - `interface SketchbookEntry extends SketchbookSketchRow { seenBy: { name: string | null; at: string } | null; featured: SketchbookFeatureFact[]; kind: ReviewKind; review: ReviewSummary }`
  - `SketchbookPayload.sketches: SketchbookEntry[]` and `SketchbookPayload.shareOptOut: boolean`
  - `buildSketchbookPayload(studentId, month, opts: { summaryOnly: boolean; today: string; viewer: SketchbookViewer })`
  - `entryFor(row: SketchbookSketchRow, viewer: SketchbookViewer, heldIds: ReadonlySet<string>, seenBy: SketchbookEntry['seenBy'], featured: SketchbookFeatureFact[]): SketchbookEntry`
  - `POST /api/sketchbook/entries` accepts optional `inspiration_item_id` (a visible Inspiration item id), stored on the row
  - `DELETE /api/sketchbook/entries/[id]` answers 409 once a teacher has reviewed the sketch
  - `PATCH /api/sketchbook/preferences` accepts `feature_opt_out` and/or `share_drawings_opt_out` booleans
  - `sketchbook-api.ts`: `setShareOptOut(getToken, optOut: boolean)`, `practiseBody(itemId: string)` returning a `submitBody` function

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/lib/sketchbook-payload.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getSupabaseAdminClient: () => ({}) }));
vi.mock('@neram/database/queries/nexus', () => ({}));
vi.mock('@/lib/drawing-activity-store', () => ({}));
vi.mock('@/lib/student-drawing-payload-server', () => ({ loadManualEvaluations: async () => [] }));

import { entryFor } from './sketchbook-payload';

const row = (over: Record<string, unknown>) =>
  ({
    id: 'd1', student_id: 's1', original_image_url: 'https://x/d1.jpg', thumbnail_url: null, self_note: null,
    reaction: null, submitted_at: '2026-09-15T14:45:00Z', is_gallery_visible: true, source_type: 'sketchbook',
    status: 'completed', assignment_id: null, question_id: null, reviewed_at: null, tutor_rating: null,
    tutor_marks: null, inspiration_item_id: null, assignment: null, ...over,
  }) as any;

describe('entryFor', () => {
  it('hides an assignment review the teacher has not handed back', () => {
    const e = entryFor(row({ source_type: 'assignment', assignment_id: 'a1', status: 'submitted', tutor_rating: 5, reaction: 'star' }), 'student', new Set(), null, []);
    expect(e.tutor_rating).toBeNull();
    expect(e.reaction).toBeNull();
    expect(e.review).toEqual({ state: 'waiting', rating: null, marks: null });
    expect(e.kind).toBe('assignment');
  });

  it('hides a held review even when the status already reads completed', () => {
    const e = entryFor(row({ source_type: 'assignment', assignment_id: 'a1', status: 'completed', tutor_rating: 4, reviewed_at: '2026-09-16T10:00:00Z' }), 'student', new Set(['d1']), null, []);
    expect(e.tutor_rating).toBeNull();
    expect(e.review.state).toBe('waiting');
  });

  it('shows the student a reviewed sketch with its stars', () => {
    const e = entryFor(row({ reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 4 }), 'student', new Set(), null, []);
    expect(e.review).toEqual({ state: 'reviewed', rating: 4, marks: null });
    expect(e.is_gallery_visible).toBe(false);
  });

  it('shows staff everything, and still says an unfinished assignment is waiting', () => {
    const e = entryFor(row({ source_type: 'assignment', assignment_id: 'a1', status: 'submitted', tutor_rating: 5 }), 'staff', new Set(), null, []);
    expect(e.tutor_rating).toBe(5);
    expect(e.review.state).toBe('waiting');
  });
});
```

Create `apps/nexus/src/app/api/sketchbook/entries/route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ITEM = '11111111-1111-4111-8111-111111111111';

const m = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  createDrawingSubmission: vi.fn(),
  update: vi.fn(),
  upsertPracticeDay: vi.fn(),
  getStudentPrimaryClassroom: vi.fn(),
  recordGamificationEvent: vi.fn(),
  loadStudentRhythm: vi.fn(),
  getInspirationItem: vi.fn(),
}));

vi.mock('@/lib/study-materials', () => ({ getRequestUser: (h: string | null) => m.getRequestUser(h) }));
vi.mock('@/lib/sketchbook-payload', () => ({ loadStudentRhythm: (...a: unknown[]) => m.loadStudentRhythm(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      update: (patch: unknown) => ({ eq: async () => { m.update(patch); return { error: null }; } }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  createDrawingSubmission: (...a: unknown[]) => m.createDrawingSubmission(...a),
  getStudentPrimaryClassroom: (...a: unknown[]) => m.getStudentPrimaryClassroom(...a),
  recordGamificationEvent: (...a: unknown[]) => m.recordGamificationEvent(...a),
  upsertPracticeDay: (...a: unknown[]) => m.upsertPracticeDay(...a),
  getInspirationItem: (...a: unknown[]) => m.getInspirationItem(...a),
}));

import { POST } from './route';

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/sketchbook/entries', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const BASE = { original_image_url: 'https://db.neramclasses.com/storage/v1/object/public/drawing-uploads/s1/a.jpg' };

describe('POST /api/sketchbook/entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getRequestUser.mockResolvedValue({ id: 's1', user_type: 'student' });
    m.createDrawingSubmission.mockResolvedValue({ id: 'd1', submitted_at: '2026-09-17T10:00:00Z' });
    m.upsertPracticeDay.mockResolvedValue({ isNewDay: false });
    m.getStudentPrimaryClassroom.mockResolvedValue(null);
    m.recordGamificationEvent.mockResolvedValue(undefined);
    m.loadStudentRhythm.mockResolvedValue({ rhythm: { week: { count: 1, goal: 3 } } });
  });

  it('links a sketch practised from a visible Inspiration drawing', async () => {
    m.getInspirationItem.mockResolvedValue({ item: { id: ITEM }, pair: null });
    const res = await POST(post({ ...BASE, inspiration_item_id: ITEM }));
    expect(res.status).toBe(201);
    expect(m.getInspirationItem).toHaveBeenCalledWith(ITEM, 's1', 'visible');
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', inspiration_item_id: ITEM }));
  });

  it('refuses a drawing the student cannot see, before saving anything', async () => {
    m.getInspirationItem.mockResolvedValue({ item: null, pair: null });
    const res = await POST(post({ ...BASE, inspiration_item_id: ITEM }));
    expect(res.status).toBe(400);
    expect(m.createDrawingSubmission).not.toHaveBeenCalled();
  });

  it('refuses an id that is not an id', async () => {
    const res = await POST(post({ ...BASE, inspiration_item_id: 'nope' }));
    expect(res.status).toBe(400);
    expect(m.getInspirationItem).not.toHaveBeenCalled();
  });

  it('stores no link for a plain sketch', async () => {
    const res = await POST(post(BASE));
    expect(res.status).toBe(201);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ inspiration_item_id: null }));
  });
});
```

Create `apps/nexus/src/app/api/sketchbook/entries/[id]/route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ getRequestUser: vi.fn(), getSketchbookSketch: vi.fn(), hasAnyLiveFeature: vi.fn(), repairPracticeDay: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/study-materials', () => ({ getRequestUser: (h: string | null) => m.getRequestUser(h) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: () => ({ delete: () => ({ eq: async () => { m.del(); return { error: null }; } }) }) }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  getSketchbookSketch: (...a: unknown[]) => m.getSketchbookSketch(...a),
  hasAnyLiveFeature: (...a: unknown[]) => m.hasAnyLiveFeature(...a),
  repairPracticeDay: (...a: unknown[]) => m.repairPracticeDay(...a),
}));

import { DELETE } from './route';

const del = () => new NextRequest('http://localhost/api/sketchbook/entries/d1', { method: 'DELETE', headers: { Authorization: 'Bearer t' } });
const ctx = { params: { id: 'd1' } };

describe('DELETE /api/sketchbook/entries/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getRequestUser.mockResolvedValue({ id: 's1', user_type: 'student' });
    m.hasAnyLiveFeature.mockResolvedValue(false);
  });

  it('keeps a sketch the teacher has reviewed', async () => {
    m.getSketchbookSketch.mockResolvedValue({ id: 'd1', student_id: 's1', reviewed_at: '2026-09-16T10:00:00Z', submitted_at: '2026-09-15T10:00:00Z' });
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(409);
    expect(m.del).not.toHaveBeenCalled();
  });

  it('deletes an unreviewed sketch and recounts the day', async () => {
    m.getSketchbookSketch.mockResolvedValue({ id: 'd1', student_id: 's1', reviewed_at: null, submitted_at: '2026-09-15T10:00:00Z' });
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(204);
    expect(m.del).toHaveBeenCalled();
    expect(m.repairPracticeDay).toHaveBeenCalled();
  });
});
```

Create `apps/nexus/src/app/api/sketchbook/preferences/route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ getRequestUser: vi.fn(), setFeatureOptOut: vi.fn(), setDrawingSharingOptOut: vi.fn() }));
vi.mock('@/lib/study-materials', () => ({ getRequestUser: (h: string | null) => m.getRequestUser(h) }));
vi.mock('@neram/database/queries/nexus', () => ({
  setFeatureOptOut: (...a: unknown[]) => m.setFeatureOptOut(...a),
  setDrawingSharingOptOut: (...a: unknown[]) => m.setDrawingSharingOptOut(...a),
}));

import { PATCH } from './route';

const patch = (body: unknown) =>
  new NextRequest('http://localhost/api/sketchbook/preferences', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('PATCH /api/sketchbook/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getRequestUser.mockResolvedValue({ id: 's1', user_type: 'student' });
    m.setDrawingSharingOptOut.mockResolvedValue(true);
  });

  it('turns sharing to Inspiration off', async () => {
    const res = await PATCH(patch({ share_drawings_opt_out: true }));
    expect(res.status).toBe(200);
    expect(m.setDrawingSharingOptOut).toHaveBeenCalledWith('s1', true);
    expect(m.setFeatureOptOut).not.toHaveBeenCalled();
  });

  it('still saves the Teams feature opt-out', async () => {
    const res = await PATCH(patch({ feature_opt_out: false }));
    expect(res.status).toBe(200);
    expect(m.setFeatureOptOut).toHaveBeenCalledWith('s1', false);
  });

  it('refuses a body with neither preference', async () => {
    const res = await PATCH(patch({ other: 1 }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/sketchbook-payload.test.ts apps/nexus/src/app/api/sketchbook/entries/route.test.ts "apps/nexus/src/app/api/sketchbook/entries/[id]/route.test.ts" apps/nexus/src/app/api/sketchbook/preferences/route.test.ts`
Expected: FAIL (no `entryFor`, no link handling, no 409, no share preference).

- [ ] **Step 3: Rewrite `sketchbook-payload.ts`**

Replace the whole file with:

```ts
import { getSupabaseAdminClient } from '@neram/database';
import {
  countSketches, firstAndLatestSketch, firstSeenBy, getDrawingSharingOptOut, getFeatureOptOut, getSketchbookGoalHistory,
  listLiveFeatures, listSketchbookMonth,
  type SketchbookFeatureFact, type SketchbookSketchRow, type SketchbookViewer,
} from '@neram/database/queries/nexus';
import { computeRhythm, daysBetween, istDate, type Rhythm } from '@/lib/sketchbook-rhythm';
import { clampDates, proratedGoal, trackingStart } from '@/lib/sketchbook-status';
import { loadDrawingDays, loadStudentRhythmContext, type StudentRhythmContext } from '@/lib/drawing-activity-store';
import { reviewKindOf, summarizeReview, type ReviewKind, type ReviewSummary } from '@/lib/drawing-source';
import { heldIdsFrom, isReleasedForStudent } from '@/lib/student-drawing-payload';
import { loadManualEvaluations } from '@/lib/student-drawing-payload-server';

/** Launch day of the sketchbook, the floor for a student with no live classroom. */
const SKETCHBOOK_LAUNCH = '2026-09-12';

/** One drawing on its sketchbook date, with what the viewer may know about its review. */
export interface SketchbookEntry extends SketchbookSketchRow {
  seenBy: { name: string | null; at: string } | null;
  featured: SketchbookFeatureFact[];
  kind: ReviewKind;
  review: ReviewSummary;
}

export interface SketchbookPayload {
  rhythm: Rhythm;
  goal: number;
  classroom: { id: string; name: string } | null;
  totalSketches: number;
  thenAndNow: { first: SketchbookSketchRow; latest: SketchbookSketchRow } | null;
  month: string;
  sketches: SketchbookEntry[];
  practiceDaysThisMonth: number;
  featureOptOut: boolean;
  /** The student asked to keep their drawings out of Inspiration. */
  shareOptOut: boolean;
}

/**
 * The student's rhythm, computed the same way the teacher's Class rhythm screen
 * computes it: any drawing upload is a practice day, nothing before their own
 * tracking start counts, and a week tracking joined part way through has a
 * smaller goal. Shared by the payload and the add-sketch response.
 */
export async function loadStudentRhythm(
  studentId: string,
  today: string,
): Promise<{ rhythm: Rhythm; context: StudentRhythmContext | null; dates: string[]; start: string }> {
  const context = await loadStudentRhythmContext(studentId);
  const start = context
    ? trackingStart({ classroomStartedOn: context.startedOn, enrolledAt: context.enrolledAt, reactivatedOn: context.reactivatedOn })
    : SKETCHBOOK_LAUNCH;
  const [days, history] = await Promise.all([
    loadDrawingDays([studentId], start),
    context ? getSketchbookGoalHistory(context.classroomId) : Promise.resolve([]),
  ]);
  const dates = clampDates(days[studentId] || [], start, today);
  const rhythm = computeRhythm(dates, today, history, context?.goal ?? 3);
  const goal = proratedGoal(rhythm.week.goal, rhythm.week.start, start);
  if (goal !== rhythm.week.goal) {
    rhythm.week = { ...rhythm.week, goal, met: rhythm.week.count >= goal };
  }
  return { rhythm, context, dates, start };
}

/**
 * One drawing as the viewer may see it. A student sees a review only once it is
 * handed back (lib/student-drawing-payload): until then the grade, the reaction
 * and the review time are blank, and the gallery flag never leaves the server.
 * Staff see the row as stored.
 */
export function entryFor(
  row: SketchbookSketchRow,
  viewer: SketchbookViewer,
  heldIds: ReadonlySet<string>,
  seenBy: SketchbookEntry['seenBy'],
  featured: SketchbookFeatureFact[],
): SketchbookEntry {
  const released = viewer === 'staff' || isReleasedForStudent(row, heldIds);
  const visible = released ? row : { ...row, tutor_rating: null, tutor_marks: null, reaction: null, reviewed_at: null };
  const safe = viewer === 'student' ? { ...visible, is_gallery_visible: false } : visible;
  return { ...safe, seenBy, featured, kind: reviewKindOf(row), review: summarizeReview(row, released) };
}

/** One assembly for the student's own view and the teacher's peek, so they never drift. */
export async function buildSketchbookPayload(
  studentId: string,
  month: string,
  opts: { summaryOnly: boolean; today: string; viewer: SketchbookViewer },
): Promise<SketchbookPayload> {
  const [{ rhythm, context, dates }, total, optOut, shareOptOut] = await Promise.all([
    loadStudentRhythm(studentId, opts.today),
    countSketches(studentId, opts.viewer),
    getFeatureOptOut(studentId),
    getDrawingSharingOptOut(studentId),
  ]);

  const base: SketchbookPayload = {
    rhythm,
    goal: rhythm.week.goal,
    classroom: context ? { id: context.classroomId, name: context.classroomName } : null,
    totalSketches: total,
    thenAndNow: null,
    month,
    sketches: [],
    practiceDaysThisMonth: dates.filter((d) => d.startsWith(month)).length,
    featureOptOut: optOut,
    shareOptOut,
  };
  if (opts.summaryOnly) return base;

  const [rows, edges] = await Promise.all([
    listSketchbookMonth(studentId, month, opts.viewer),
    firstAndLatestSketch(studentId),
  ]);
  const ids = rows.map((r) => r.id);
  const [seen, features, evaluations] = await Promise.all([
    firstSeenBy(ids),
    listLiveFeatures(ids),
    // Only a student's own view needs to know which reviews are still held.
    opts.viewer === 'student' ? loadManualEvaluations(getSupabaseAdminClient(), ids) : Promise.resolve([]),
  ]);
  const heldIds = heldIdsFrom(evaluations);

  base.sketches = rows.map((r) => entryFor(r, opts.viewer, heldIds, seen[r.id] ?? null, features[r.id] ?? []));
  // Same rule as thenAndNow() in the engine (8+ drawings, 30+ days apart), but
  // from the two edge rows instead of the whole list, which we never load here.
  if (edges && total >= 8 && daysBetween(istDate(edges.first.submitted_at), istDate(edges.latest.submitted_at)) >= 30) {
    base.thenAndNow = edges;
  }
  return base;
}
```

- [ ] **Step 4: Update the read routes**

In `apps/nexus/src/app/api/sketchbook/me/route.ts`: import `getSketchbookDrawing` instead of `getSketchbookSketch`, replace the lookup with

```ts
      const row = await getSketchbookDrawing(sketchId);
      // Their own drawing only, and never a test paper (its marks are embargoed).
      if (!row || row.student_id !== caller.id || row.source_type === 'exam') throw new ApiError('Drawing not found', 404);
```

and pass `viewer: 'student'` in the `buildSketchbookPayload` options. Change the doc comment to `/** GET /api/sketchbook/me?month=YYYY-MM&summary=1&sketch=<id>   (student: every drawing except test papers) */`.

In `apps/nexus/src/app/api/sketchbook/students/[id]/route.ts`: import `getSketchbookDrawing` instead of `getSketchbookSketch`, replace the lookup with

```ts
      const row = await getSketchbookDrawing(sketchId);
      if (!row || row.student_id !== params.id) throw new ApiError('Drawing not found', 404);
```

and pass `viewer: 'staff'`.

- [ ] **Step 5: Update the write routes**

In `apps/nexus/src/app/api/sketchbook/entries/route.ts`:
1. Add to the imports: `getInspirationItem` from `@neram/database/queries/nexus`.
2. Add below `CAPTION_MAX`: `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`
3. Update the doc comment's body line to `body { original_image_url, thumbnail_url?, caption?, inspiration_item_id? }` and add the sentence: `inspiration_item_id links a sketch practised from an Inspiration drawing the student can see ("Practise this").`
4. After `const caption = ...` and before `createDrawingSubmission`, insert:

```ts
    let inspirationItemId: string | null = null;
    if (body?.inspiration_item_id !== undefined && body?.inspiration_item_id !== null) {
      const raw = body.inspiration_item_id;
      if (typeof raw !== 'string' || !UUID_RE.test(raw)) throw new ApiError('That Inspiration drawing was not found.', 400);
      // Checked before anything is saved: a student can only practise from a drawing they can see.
      const { item } = await getInspirationItem(raw, caller.id, 'visible');
      if (!item) throw new ApiError('That Inspiration drawing was not found.', 400);
      inspirationItemId = raw;
    }
```

5. Change the finishing update to `.update({ status: 'completed', thumbnail_url: thumbnailUrl, thread_id: submission.id, inspiration_item_id: inspirationItemId })`.
6. Change the response sketch to `{ ...submission, status: 'completed', thumbnail_url: thumbnailUrl, inspiration_item_id: inspirationItemId }`.

In `apps/nexus/src/app/api/sketchbook/entries/[id]/route.ts`, after the `Not your sketch` check insert:

```ts
    if (sketch.reviewed_at) {
      throw new ApiError('Your teacher has reviewed this sketch, so it stays in your sketchbook.', 409);
    }
```

and extend the doc comment with: `A reviewed sketch stays: its review is part of the student's record.`

In `entries/[id]/react/route.ts`, `entries/[id]/flip/route.ts` and `entries/[id]/feature/route.ts`: replace the import and every call of `getSketchbookSketch` with `getPracticeDrawing`, and every `'Sketch not found'` message with `'Drawing not found'`. Add one comment line above the first call in each file: `// Practice drawings of any kind (sketch, question bank, free practice), never owed work.`

Replace `apps/nexus/src/app/api/sketchbook/preferences/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { setDrawingSharingOptOut, setFeatureOptOut } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';

/**
 * PATCH /api/sketchbook/preferences   (student)
 * body { feature_opt_out?: boolean, share_drawings_opt_out?: boolean }
 *
 * feature_opt_out keeps a student's sketches out of Teams class posts.
 * share_drawings_opt_out keeps their drawings out of Inspiration for classmates.
 */
export async function PATCH(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
    const body = await request.json().catch(() => ({}));
    const feature = body?.feature_opt_out;
    const share = body?.share_drawings_opt_out;
    if (typeof feature !== 'boolean' && typeof share !== 'boolean') {
      throw new ApiError('Send feature_opt_out or share_drawings_opt_out as true or false.', 400);
    }
    if (typeof feature === 'boolean') await setFeatureOptOut(caller.id, feature);
    if (typeof share === 'boolean') await setDrawingSharingOptOut(caller.id, share);
    return NextResponse.json(
      { feature_opt_out: typeof feature === 'boolean' ? feature : undefined, share_drawings_opt_out: typeof share === 'boolean' ? share : undefined },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not save the preference');
  }
}
```

In `apps/nexus/src/components/sketchbook/sketchbook-api.ts`, add after `addSketchBody`:

```ts
/** Body for a sketch practised from an Inspiration drawing. */
export function practiseBody(itemId: string) {
  return (uploadedUrl: string, caption: string | null, thumbnailUrl: string | null) => ({
    ...addSketchBody(uploadedUrl, caption, thumbnailUrl),
    inspiration_item_id: itemId,
  });
}
```

and after `setOptOut`:

```ts
export const setShareOptOut = (getToken: GetToken, optOut: boolean) =>
  call<{ share_drawings_opt_out: boolean }>(getToken, '/api/sketchbook/preferences', { method: 'PATCH', body: JSON.stringify({ share_drawings_opt_out: optOut }) });
```

- [ ] **Step 6: Run the tests and the type-check**

Run: `pnpm test:run apps/nexus/src/lib/sketchbook-payload.test.ts apps/nexus/src/app/api/sketchbook`
Expected: PASS (new files and the existing sketchbook tests).
Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json`
Expected: 0 errors. Any other caller of `buildSketchbookPayload` must now pass `viewer`; fix each by the caller's role.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/lib/sketchbook-payload.ts apps/nexus/src/lib/sketchbook-payload.test.ts apps/nexus/src/app/api/sketchbook apps/nexus/src/components/sketchbook/sketchbook-api.ts
git commit -m "feat(nexus): sketchbook payload carries every drawing and only released reviews

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Review context and queue

**Files:**
- Create: `apps/nexus/src/lib/review-context.ts`
- Test: `apps/nexus/src/lib/review-context.test.ts`
- Modify: `apps/nexus/src/hooks/useReviewQueue.ts` (whole file shown below)
- Test: `apps/nexus/src/hooks/useReviewQueue.test.ts` (existing tests keep passing unchanged)

**Interfaces:**
- Consumes: `TriageBand` from `@/lib/drawing-triage`.
- Produces:
  - `type ReviewFrom = 'assignment' | 'sketchbook' | 'flip' | 'exam' | 'inspiration'`
  - `interface ReviewContext { from: ReviewFrom | null; assignmentId: string | null; lane: TriageBand | null; studentId: string | null; month: string | null; classroomId: string | null; examId: string | null; classId: string | null; itemId: string | null }`
  - `parseLane(value: string | null | undefined): TriageBand | null` (moved here; still re-exported from the hook)
  - `parseReviewContext(params: { get(name: string): string | null }): ReviewContext`
  - `reviewHref(submissionId: string, ctx: ReviewContext, extra?: Record<string, string>): string`
  - `interface ReviewSubjectFacts { assignment_id: string | null; student_id: string | null; source_type: string | null; assignment?: { title: string | null } | null; student?: { name: string | null } | null }`
  - `reviewBackHref(ctx: ReviewContext, sub: ReviewSubjectFacts): string`
  - `interface ReviewCrumb { label: string; href?: string }`
  - `reviewCrumbs(ctx: ReviewContext, sub: ReviewSubjectFacts): ReviewCrumb[]`
  - `type QueueSource = { kind: 'assignment'; assignmentId: string; lane: TriageBand | null } | { kind: 'list'; url: string; pick: 'sketchbook' | 'inbox' | 'exam' } | null`
  - `queueSourceFor(ctx: ReviewContext, fallbackAssignmentId: string | null): QueueSource`
  - `pickQueueIds(pick: 'sketchbook' | 'inbox' | 'exam', body: any): string[]`
  - Hook: `useReviewQueue(ctx: ReviewContext, fallbackAssignmentId: string | null, currentId: string, getToken: () => Promise<string | null>): ReviewQueue` (same `ReviewQueue` shape as today)

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/lib/review-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseReviewContext,
  pickQueueIds,
  queueSourceFor,
  reviewBackHref,
  reviewCrumbs,
  reviewHref,
} from './review-context';

const A = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const E = '44444444-4444-4444-8444-444444444444';

const params = (qs: string) => new URLSearchParams(qs);
const sketch = { assignment_id: null, student_id: S, source_type: 'sketchbook', student: { name: 'Kathir Raja' } };
const assignmentDrawing = { assignment_id: A, student_id: S, source_type: 'assignment', assignment: { title: 'Line Practice' } };

describe('parseReviewContext', () => {
  it('keeps the old assignment links working', () => {
    const ctx = parseReviewContext(params(`assignment=${A}&lane=routine`));
    expect(ctx.from).toBe('assignment');
    expect(ctx.assignmentId).toBe(A);
    expect(ctx.lane).toBe('routine');
  });

  it('reads a sketchbook link with its student and month', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(ctx).toMatchObject({ from: 'sketchbook', studentId: S, month: '2026-09' });
  });

  it('ignores values that are not ids or months', () => {
    const ctx = parseReviewContext(params('from=nowhere&student=abc&month=Sept'));
    expect(ctx).toMatchObject({ from: null, studentId: null, month: null });
  });

  it('drops a lane outside an assignment', () => {
    expect(parseReviewContext(params(`from=sketchbook&lane=routine`)).lane).toBeNull();
  });
});

describe('reviewBackHref', () => {
  it('returns to the student sketchbook month the teacher came from', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(reviewBackHref(ctx, sketch)).toBe(`/teacher/sketchbook/${S}?month=2026-09`);
  });

  it('returns to the flip-through from the flip-through', () => {
    expect(reviewBackHref(parseReviewContext(params(`from=flip&classroom=${C}`)), sketch)).toBe('/teacher/sketchbook');
  });

  it('returns to the assignment from an assignment link', () => {
    expect(reviewBackHref(parseReviewContext(params(`assignment=${A}`)), assignmentDrawing)).toBe(`/teacher/assignments/${A}`);
  });

  it('returns to the exam results from a test drawing', () => {
    const ctx = parseReviewContext(params(`from=exam&exam=${E}&class=${C}`));
    expect(reviewBackHref(ctx, { assignment_id: null, student_id: S, source_type: 'exam' })).toBe(`/teacher/timetable/${C}/exam?results=1`);
  });

  it('with no context, sends an assignment drawing to its assignment and practice to the student sketchbook', () => {
    const none = parseReviewContext(params(''));
    expect(reviewBackHref(none, assignmentDrawing)).toBe(`/teacher/assignments/${A}`);
    expect(reviewBackHref(none, sketch)).toBe(`/teacher/sketchbook/${S}`);
    expect(reviewBackHref(none, { assignment_id: null, student_id: S, source_type: 'exam' })).toBe('/teacher/exams');
  });
});

describe('reviewCrumbs', () => {
  it('roots practice at Sketchbooks and names the student', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(reviewCrumbs(ctx, sketch)).toEqual([
      { label: 'Sketchbooks', href: '/teacher/sketchbook' },
      { label: "Kathir Raja's sketchbook", href: `/teacher/sketchbook/${S}?month=2026-09` },
      { label: 'Review' },
    ]);
  });

  it('roots an assignment drawing at Assignments with its title', () => {
    expect(reviewCrumbs(parseReviewContext(params(`assignment=${A}`)), assignmentDrawing)).toEqual([
      { label: 'Assignments', href: '/teacher/assignments' },
      { label: 'Line Practice', href: `/teacher/assignments/${A}` },
      { label: 'Review' },
    ]);
  });
});

describe('reviewHref', () => {
  it('carries the context and any extra value', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(reviewHref('d2', ctx, { notice: 'Review sent.' })).toBe(
      `/teacher/drawing-reviews/d2?from=sketchbook&student=${S}&month=2026-09&notice=Review+sent.`,
    );
  });

  it('keeps an assignment link in its old shape', () => {
    expect(reviewHref('d2', parseReviewContext(params(`assignment=${A}&lane=flagged`)))).toBe(
      `/teacher/drawing-reviews/d2?assignment=${A}&lane=flagged`,
    );
  });
});

describe('queueSourceFor and pickQueueIds', () => {
  it('walks the student month from the sketchbook', () => {
    const ctx = parseReviewContext(params(`from=sketchbook&student=${S}&month=2026-09`));
    expect(queueSourceFor(ctx, null)).toEqual({ kind: 'list', url: `/api/sketchbook/students/${S}?month=2026-09`, pick: 'sketchbook' });
    expect(pickQueueIds('sketchbook', { sketches: [{ id: 'a' }, { id: 'b' }] })).toEqual(['a', 'b']);
  });

  it('walks the flip inbox for its classroom', () => {
    const ctx = parseReviewContext(params(`from=flip&classroom=${C}`));
    expect(queueSourceFor(ctx, null)).toEqual({ kind: 'list', url: `/api/sketchbook/inbox?classroom=${C}`, pick: 'inbox' });
  });

  it('walks the unmarked drawings of an exam', () => {
    const ctx = parseReviewContext(params(`from=exam&exam=${E}&class=${C}`));
    expect(queueSourceFor(ctx, null)).toEqual({ kind: 'list', url: `/api/exams/${E}/drawings`, pick: 'exam' });
    expect(pickQueueIds('exam', { drawings: [{ submission_id: 'x', status: 'submitted' }, { submission_id: 'y', status: 'completed' }] })).toEqual(['x']);
  });

  it('falls back to the assignment the drawing belongs to', () => {
    expect(queueSourceFor(parseReviewContext(params('')), A)).toEqual({ kind: 'assignment', assignmentId: A, lane: null });
  });

  it('has no queue for practice opened without a context', () => {
    expect(queueSourceFor(parseReviewContext(params('')), null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/review-context.test.ts`
Expected: FAIL, `Cannot find module './review-context'`.

- [ ] **Step 3: Write `review-context.ts`**

```ts
/**
 * Where the one drawing review screen was opened from.
 *
 * Every drawing opens at /teacher/drawing-reviews/[id]: from an assignment
 * roster, a student's sketchbook, the flip-through, an exam's results or an
 * Inspiration drawing. The address carries that place, and this module turns it
 * into Back, the breadcrumb trail, the queue J and K walk, and the links that
 * keep the place while moving between drawings.
 *
 * Older links carry only ?assignment=<id>&lane=<band>; they still mean
 * "from this assignment" and keep their shape.
 */
import type { TriageBand } from './drawing-triage';

export type ReviewFrom = 'assignment' | 'sketchbook' | 'flip' | 'exam' | 'inspiration';

export interface ReviewContext {
  from: ReviewFrom | null;
  assignmentId: string | null;
  lane: TriageBand | null;
  studentId: string | null;
  month: string | null;
  classroomId: string | null;
  examId: string | null;
  classId: string | null;
  itemId: string | null;
}

const FROM: ReviewFrom[] = ['assignment', 'sketchbook', 'flip', 'exam', 'inspiration'];
const LANES: TriageBand[] = ['routine', 'needs_look', 'flagged'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A lane from the address bar, or null for the whole queue. */
export function parseLane(value: string | null | undefined): TriageBand | null {
  return value && (LANES as string[]).includes(value) ? (value as TriageBand) : null;
}

export function parseReviewContext(params: { get(name: string): string | null }): ReviewContext {
  const id = (key: string) => {
    const v = params.get(key);
    return v && UUID.test(v) ? v : null;
  };
  const assignmentId = id('assignment');
  const raw = params.get('from');
  const from: ReviewFrom | null = FROM.includes(raw as ReviewFrom) ? (raw as ReviewFrom) : assignmentId ? 'assignment' : null;
  const month = params.get('month');
  return {
    from,
    assignmentId,
    lane: assignmentId ? parseLane(params.get('lane')) : null,
    studentId: id('student'),
    month: month && MONTH.test(month) ? month : null,
    classroomId: id('classroom'),
    examId: id('exam'),
    classId: id('class'),
    itemId: id('item'),
  };
}

export function reviewHref(submissionId: string, ctx: ReviewContext, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  if (ctx.from && ctx.from !== 'assignment') qs.set('from', ctx.from);
  if (ctx.assignmentId) qs.set('assignment', ctx.assignmentId);
  if (ctx.lane) qs.set('lane', ctx.lane);
  if (ctx.studentId) qs.set('student', ctx.studentId);
  if (ctx.month) qs.set('month', ctx.month);
  if (ctx.classroomId) qs.set('classroom', ctx.classroomId);
  if (ctx.examId) qs.set('exam', ctx.examId);
  if (ctx.classId) qs.set('class', ctx.classId);
  if (ctx.itemId) qs.set('item', ctx.itemId);
  for (const [key, value] of Object.entries(extra)) qs.set(key, value);
  const s = qs.toString();
  return `/teacher/drawing-reviews/${submissionId}${s ? `?${s}` : ''}`;
}

export interface ReviewSubjectFacts {
  assignment_id: string | null;
  student_id: string | null;
  source_type: string | null;
  assignment?: { title: string | null } | null;
  student?: { name: string | null } | null;
}

function sketchbookOf(studentId: string | null, month: string | null): string {
  if (!studentId) return '/teacher/sketchbook';
  return `/teacher/sketchbook/${studentId}${month ? `?month=${month}` : ''}`;
}

export function reviewBackHref(ctx: ReviewContext, sub: ReviewSubjectFacts): string {
  switch (ctx.from) {
    case 'assignment': {
      const a = ctx.assignmentId ?? sub.assignment_id;
      return a ? `/teacher/assignments/${a}` : '/teacher/assignments';
    }
    case 'sketchbook':
      return sketchbookOf(ctx.studentId ?? sub.student_id, ctx.month);
    case 'flip':
      return '/teacher/sketchbook';
    case 'exam':
      return ctx.classId ? `/teacher/timetable/${ctx.classId}/exam?results=1` : '/teacher/exams';
    case 'inspiration':
      return ctx.itemId ? `/teacher/inspiration/${ctx.itemId}` : '/teacher/inspiration';
    default:
      if (sub.assignment_id) return `/teacher/assignments/${sub.assignment_id}`;
      if (sub.source_type === 'exam') return '/teacher/exams';
      return sketchbookOf(sub.student_id, null);
  }
}

export interface ReviewCrumb {
  label: string;
  href?: string;
}

export function reviewCrumbs(ctx: ReviewContext, sub: ReviewSubjectFacts): ReviewCrumb[] {
  const back = reviewBackHref(ctx, sub);
  const review: ReviewCrumb = { label: 'Review' };
  if (ctx.from === 'assignment' || (!ctx.from && sub.assignment_id)) {
    const a = ctx.assignmentId ?? sub.assignment_id;
    return [
      { label: 'Assignments', href: '/teacher/assignments' },
      ...(a ? [{ label: sub.assignment?.title || 'Assignment', href: `/teacher/assignments/${a}` }] : []),
      review,
    ];
  }
  if (ctx.from === 'exam' || (!ctx.from && sub.source_type === 'exam')) {
    return [{ label: 'Exams', href: '/teacher/exams' }, ...(ctx.classId ? [{ label: 'Results', href: back }] : []), review];
  }
  if (ctx.from === 'inspiration') {
    return [{ label: 'Inspiration', href: '/teacher/inspiration' }, { label: 'Drawing', href: back }, review];
  }
  const crumbs: ReviewCrumb[] = [{ label: 'Sketchbooks', href: '/teacher/sketchbook' }];
  if (ctx.from !== 'flip' && (ctx.studentId ?? sub.student_id)) {
    const name = sub.student?.name?.trim();
    crumbs.push({ label: name ? `${name}'s sketchbook` : 'Sketchbook', href: back });
  }
  crumbs.push(review);
  return crumbs;
}

export type QueueSource =
  | { kind: 'assignment'; assignmentId: string; lane: TriageBand | null }
  | { kind: 'list'; url: string; pick: 'sketchbook' | 'inbox' | 'exam' }
  | null;

/** Which list J, K and Save and next walk. */
export function queueSourceFor(ctx: ReviewContext, fallbackAssignmentId: string | null): QueueSource {
  if (ctx.from === 'sketchbook' && ctx.studentId) {
    const month = ctx.month ? `?month=${ctx.month}` : '';
    return { kind: 'list', url: `/api/sketchbook/students/${ctx.studentId}${month}`, pick: 'sketchbook' };
  }
  if (ctx.from === 'flip' && ctx.classroomId) {
    return { kind: 'list', url: `/api/sketchbook/inbox?classroom=${ctx.classroomId}`, pick: 'inbox' };
  }
  if (ctx.from === 'exam' && ctx.examId) {
    return { kind: 'list', url: `/api/exams/${ctx.examId}/drawings`, pick: 'exam' };
  }
  const assignmentId = ctx.assignmentId ?? (ctx.from === null || ctx.from === 'assignment' ? fallbackAssignmentId : null);
  return assignmentId ? { kind: 'assignment', assignmentId, lane: ctx.lane } : null;
}

/** The ids of a list response, in the order the teacher sees them. */
export function pickQueueIds(pick: 'sketchbook' | 'inbox' | 'exam', body: any): string[] {
  if (pick === 'exam') {
    return ((body?.drawings ?? []) as Array<{ submission_id: string; status: string | null }>)
      .filter((d) => d.status === 'submitted' || d.status === 'under_review')
      .map((d) => d.submission_id);
  }
  return ((body?.sketches ?? []) as Array<{ id: string }>).map((s) => s.id);
}
```

- [ ] **Step 4: Rewrite the hook**

Replace `apps/nexus/src/hooks/useReviewQueue.ts` with:

```ts
'use client';

/**
 * Where this drawing sits in the place the teacher came from.
 *
 * An assignment's pending reviews (oldest first, the same order as Save and
 * next in lib/review-next.ts), one triage lane of it, a student's sketchbook
 * month, the flip-through inbox, or an exam's unmarked drawings. Which one is
 * decided in lib/review-context.ts; this hook only fetches it.
 */

import { useEffect, useRef, useState } from 'react';
import type { TriageBand } from '@/lib/drawing-triage';
import { parseLane, pickQueueIds, queueSourceFor, type ReviewContext } from '@/lib/review-context';

export { parseLane };

interface RosterRow {
  drawing?: { id: string; status: string; submitted_at: string } | null;
}

export interface ReviewQueue {
  total: number;
  /** 1-based, or null when this drawing is not itself in the list. */
  position: number | null;
  prevId: string | null;
  nextId: string | null;
  /**
   * Where to go once this drawing is done: the next one, or when this was the
   * last, the earliest one still in the list. Null when nothing else is.
   */
  afterId: string | null;
}

const EMPTY: ReviewQueue = { total: 0, position: null, prevId: null, nextId: null, afterId: null };

export function queueFor(ids: string[], currentId: string): ReviewQueue {
  const index = ids.indexOf(currentId);
  if (index === -1) {
    // Viewing something already done: offer the start of the list rather than
    // nothing, so J still leads somewhere useful.
    return { total: ids.length, position: null, prevId: null, nextId: ids[0] ?? null, afterId: ids[0] ?? null };
  }
  const nextId = index < ids.length - 1 ? ids[index + 1] : null;
  return {
    total: ids.length,
    position: index + 1,
    prevId: index > 0 ? ids[index - 1] : null,
    nextId,
    afterId: nextId ?? ids.find((x) => x !== currentId) ?? null,
  };
}

async function assignmentIds(assignmentId: string, lane: TriageBand | null, token: string | null): Promise<string[] | null> {
  const headers = { Authorization: `Bearer ${token}` };
  if (lane) {
    const res = await fetch(`/api/drawing/assignments/${assignmentId}/triage`, { headers });
    if (!res.ok) return null;
    const body = await res.json();
    // Already in triage order, which within a band is oldest first.
    return ((body.items ?? []) as Array<{ submission_id: string; band: TriageBand }>)
      .filter((item) => item.band === lane)
      .map((item) => item.submission_id);
  }
  const res = await fetch(`/api/assignments/${assignmentId}`, { headers });
  if (!res.ok) return null;
  const body = await res.json();
  return ((body.drawing_roster ?? []) as RosterRow[])
    .map((r) => r.drawing)
    .filter((d): d is NonNullable<RosterRow['drawing']> => !!d && ['submitted', 'under_review'].includes(d.status))
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
    .map((d) => d.id);
}

export function useReviewQueue(
  ctx: ReviewContext,
  fallbackAssignmentId: string | null,
  currentId: string,
  getToken: () => Promise<string | null>,
): ReviewQueue {
  const [ids, setIds] = useState<string[]>([]);
  // getToken is a fresh function every render; see RubricScorePanel.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const source = queueSourceFor(ctx, fallbackAssignmentId);
  const sourceKey = source ? JSON.stringify(source) : '';

  useEffect(() => {
    if (!source) { setIds([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        let next: string[] | null;
        if (source.kind === 'assignment') {
          next = await assignmentIds(source.assignmentId, source.lane, token);
        } else {
          const res = await fetch(source.url, { headers: { Authorization: `Bearer ${token}` } });
          next = res.ok ? pickQueueIds(source.pick, await res.json()) : null;
        }
        if (!cancelled && next) setIds(next);
      } catch {
        // No queue, no J and K. The screen works exactly as it did.
      }
    })();
    return () => { cancelled = true; };
    // sourceKey stands for source, which is rebuilt every render.
  }, [sourceKey, currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return source ? queueFor(ids, currentId) : EMPTY;
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test:run apps/nexus/src/lib/review-context.test.ts apps/nexus/src/hooks/useReviewQueue.test.ts`
Expected: PASS. (`npx tsc` will report the page's old `useReviewQueue(...)` call until Task 8. Fix nothing else here; mention it in the report.)

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/review-context.ts apps/nexus/src/lib/review-context.test.ts apps/nexus/src/hooks/useReviewQueue.ts
git commit -m "feat(nexus): the review screen knows where it was opened from

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**Ruling carried into this task:** every commit must compile. So that this task's commit compiles, ALSO change the one call in `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx` (lines 500-505) to:

```ts
  const reviewCtx = useMemo(() => parseReviewContext(searchParams), [searchParams]);
  const queue = useReviewQueue(
    reviewCtx,
    ((submission as any)?.assignment_id as string | null) ?? null,
    id,
    getToken,
  );
```

adding `import { parseReviewContext } from '@/lib/review-context';`, and include the page in the commit. Task 8 builds the rest of the page on `reviewCtx`. Then run `npx tsc --noEmit -p apps/nexus/tsconfig.json` (expected 0 errors) before committing.

---

### Task 6: Review API for practice, Inspiration state and test marks

**Files:**
- Create: `apps/nexus/src/lib/practice-review-message.ts`
- Test: `apps/nexus/src/lib/practice-review-message.test.ts`
- Modify: `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts` (GET, lines 56-96)
- Modify: `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts`
- Test: `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.test.ts` (create)

**Interfaces:**
- Consumes: Task 2 (`reviewKindOf`, `wasReviewedBefore`, `canRedo`); Task 3 (`getInspirationItemsForSubmission`, `getExamDrawingMaxMarks`, `listLiveFeatures`, `recordFlip`); existing `getInspirationItem(id, viewerId, scope)`, `displayTitle(row)` from `@/lib/inspiration-present`, `sendNudge`, `plainToHtmlWithLink`.
- Produces:
  - `shouldNotifyPractice(input: { action: 'complete' | 'redo'; previouslyReviewed: boolean; previousStatus: string; previousRating: number | null; rating: number | null; previousFeedback: string | null; feedback: string | null }): boolean`
  - `buildPracticeReviewMessage(input: { action: 'complete' | 'redo'; teacherName: string | null; sourceType: string | null; rating: number | null }): { subject: string; plain: string; buttonLabel: string }`
  - `GET /api/drawing/submissions/[id]` response gains: `inspiration: { original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null } | null` (staff only, null for a test drawing), `practised_from: { item_id: string; title: string; image_url: string } | null` (staff scope `all`, owner scope `visible`), `featured: SketchbookFeatureFact[]` (staff, practice only), `exam_max_marks: number | null` (staff, test drawings)
  - `PATCH /api/drawing/submissions/[id]/review`: refuses `action: 'redo'` with 400 when `canRedo` is false; practice reviews notify through `sendNudge` with `eventType: 'practice_reviewed'` and record a `seen` flip; response gains `notified: boolean`; `next_submission_id` is only computed for assignment drawings (null otherwise); the direct `drawing_notifications` insert is removed.

- [ ] **Step 1: Write the failing message test**

Create `apps/nexus/src/lib/practice-review-message.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPracticeReviewMessage, shouldNotifyPractice } from './practice-review-message';

const base = { action: 'complete' as const, previouslyReviewed: false, previousStatus: 'completed', previousRating: null, rating: 4, previousFeedback: null, feedback: 'Good lines' };

describe('shouldNotifyPractice', () => {
  it('tells the student about a first review', () => {
    expect(shouldNotifyPractice(base)).toBe(true);
  });
  it('stays quiet when a review is saved again unchanged', () => {
    expect(shouldNotifyPractice({ ...base, previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good lines' })).toBe(false);
  });
  it('tells the student when the stars or the words change', () => {
    expect(shouldNotifyPractice({ ...base, previouslyReviewed: true, previousRating: 3, previousFeedback: 'Good lines' })).toBe(true);
    expect(shouldNotifyPractice({ ...base, previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good' })).toBe(true);
  });
  it('tells the student about a redo once, and when a redo is closed', () => {
    expect(shouldNotifyPractice({ ...base, action: 'redo', previousStatus: 'submitted' })).toBe(true);
    expect(shouldNotifyPractice({ ...base, action: 'redo', previousStatus: 'redo', previouslyReviewed: true })).toBe(false);
    expect(shouldNotifyPractice({ ...base, previousStatus: 'redo', previouslyReviewed: true, previousRating: 4, previousFeedback: 'Good lines' })).toBe(true);
  });
});

describe('buildPracticeReviewMessage', () => {
  it('names the stars on a sketch', () => {
    const m = buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari Babu', sourceType: 'sketchbook', rating: 4 });
    expect(m.subject).toBe('Hari reviewed your sketch');
    expect(m.plain).toBe('Hari gave your sketch 4 out of 5 stars. Open it to read the feedback.');
    expect(m.buttonLabel).toBe('Open your sketchbook');
  });
  it('says feedback when there are no stars, and drawing for other practice', () => {
    const m = buildPracticeReviewMessage({ action: 'complete', teacherName: null, sourceType: 'question_bank', rating: null });
    expect(m.subject).toBe('Your teacher reviewed your drawing');
    expect(m.plain).toBe('Your teacher left feedback on your drawing. Open it to read it.');
  });
  it('asks for a redo in plain words', () => {
    const m = buildPracticeReviewMessage({ action: 'redo', teacherName: 'Hari Babu', sourceType: 'free_practice', rating: null });
    expect(m.subject).toBe('Hari asked you to try your drawing again');
    expect(m.buttonLabel).toBe('See what to change');
  });
  it('never uses a dash as punctuation', () => {
    const m = buildPracticeReviewMessage({ action: 'complete', teacherName: 'Hari', sourceType: 'sketchbook', rating: 5 });
    const emDash = String.fromCharCode(8212);
    expect(`${m.subject} ${m.plain} ${m.buttonLabel}`.includes(emDash)).toBe(false);
    expect(`${m.subject} ${m.plain} ${m.buttonLabel}`.includes('--')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/practice-review-message.test.ts`
Expected: FAIL, `Cannot find module './practice-review-message'`.

- [ ] **Step 3: Write `practice-review-message.ts`**

```ts
/**
 * What a student hears when a teacher reviews a practice drawing.
 *
 * Practice is optional to mark, so the message is short and never nags. It goes
 * out for a first review, a redo request, a closed redo, or a changed verdict
 * (stars or words), and never for a silent re-save of the same review.
 */

export interface PracticeNoticeInput {
  action: 'complete' | 'redo';
  previouslyReviewed: boolean;
  previousStatus: string;
  previousRating: number | null;
  rating: number | null;
  previousFeedback: string | null;
  feedback: string | null;
}

export function shouldNotifyPractice(input: PracticeNoticeInput): boolean {
  if (input.action === 'redo') return input.previousStatus !== 'redo';
  if (!input.previouslyReviewed || input.previousStatus === 'redo') return true;
  const sameStars = (input.previousRating ?? null) === (input.rating ?? null);
  const sameWords = (input.previousFeedback ?? '').trim() === (input.feedback ?? '').trim();
  return !(sameStars && sameWords);
}

function firstName(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'Your teacher';
}

export function buildPracticeReviewMessage(input: {
  action: 'complete' | 'redo';
  teacherName: string | null;
  sourceType: string | null;
  rating: number | null;
}): { subject: string; plain: string; buttonLabel: string } {
  const who = firstName(input.teacherName);
  const noun = input.sourceType === 'sketchbook' ? 'sketch' : 'drawing';
  if (input.action === 'redo') {
    return {
      subject: `${who} asked you to try your ${noun} again`,
      plain: `${who} looked at your ${noun} and asked you to draw it again. Open it to see what to change.`,
      buttonLabel: 'See what to change',
    };
  }
  return {
    subject: `${who} reviewed your ${noun}`,
    plain: input.rating
      ? `${who} gave your ${noun} ${input.rating} out of 5 stars. Open it to read the feedback.`
      : `${who} left feedback on your ${noun}. Open it to read it.`,
    buttonLabel: 'Open your sketchbook',
  };
}
```

Run: `pnpm test:run apps/nexus/src/lib/practice-review-message.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing review route test**

Create `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  save: vi.fn(),
  sendNudge: vi.fn(),
  recordFlip: vi.fn(),
  roster: vi.fn(),
}));

function chain(result: { data: unknown; error: unknown }) {
  const c: any = new Proxy({}, { get: (_t, p: string) => (p === 'then' ? (res: (v: unknown) => void) => res(result) : () => c) });
  return c;
}

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid' }), extractBearerToken: () => 'test_token' }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (name: string) => chain(m.tables[name] ?? { data: null, error: null }) }),
  getAssignmentDrawingRoster: (...a: unknown[]) => m.roster(...a),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  saveDrawingReviewWithAction: (...a: unknown[]) => m.save(...a),
  recordGamificationEvent: async () => undefined,
  setSubmissionTags: async () => undefined,
  recomputeExamAttemptScore: async () => undefined,
  recordFlip: (...a: unknown[]) => m.recordFlip(...a),
}));
vi.mock('@/lib/nudge-delivery', () => ({ sendNudge: (...a: unknown[]) => m.sendNudge(...a), plainToHtmlWithLink: () => '<p>html</p>' }));
vi.mock('@/lib/teams-assignment-announcements', () => ({ canPostToGraph: () => false }));
vi.mock('@/lib/class-share-links', () => ({ shareBaseUrl: () => 'https://nexus.test' }));
vi.mock('@/lib/drawing-voice-feedback', () => ({ markVoiceSent: async () => null }));
vi.mock('@/lib/drawing-eval/db', () => ({ evalTables: () => ({}) }));
vi.mock('@/lib/drawing-hold', () => ({ releaseModeFor: async () => 'immediate', heldSubmissionIds: async () => new Set(), holdReview: async () => ({}) }));
vi.mock('@/lib/drawing-region-sync', () => ({ syncRegionMarks: async () => undefined }));

import { PATCH } from './route';

const ctx = { params: Promise.resolve({ id: 'd1' }) };
const patch = (body: unknown) =>
  new NextRequest('http://localhost/api/drawing/submissions/d1/review', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer test_token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const sketch = { id: 'd1', student_id: 's1', source_type: 'sketchbook', status: 'completed', assignment_id: null, reviewed_at: null, tutor_rating: null, tutor_feedback: null, original_image_url: 'https://x/d1.jpg' };

describe('PATCH review for practice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.tables = { users: { data: { id: 't1', user_type: 'teacher', name: 'Hari Babu' }, error: null } };
    m.save.mockImplementation(async (id: string) => ({ id, student_id: 's1' }));
    m.sendNudge.mockResolvedValue({ results: [{ chat: true, teams: false, inapp: true }] });
    m.recordFlip.mockResolvedValue(undefined);
    m.roster.mockResolvedValue({ rows: [] });
  });

  it('tells the student about a first review of a sketch and marks it seen', async () => {
    m.tables.drawing_submissions = { data: sketch, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'Good lines', action: 'complete' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(true);
    expect(body.next_submission_id).toBeNull();
    expect(m.sendNudge).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'practice_reviewed',
      studentIds: ['s1'],
      subject: 'Hari reviewed your sketch',
    }));
    expect(m.recordFlip).toHaveBeenCalledWith('t1', 'd1', 'seen');
  });

  it('stays quiet when the same review is saved again', async () => {
    m.tables.drawing_submissions = { data: { ...sketch, reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: 4, tutor_feedback: 'Good lines' }, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'Good lines', action: 'complete' }), ctx);
    expect(res.status).toBe(200);
    expect(m.sendNudge).not.toHaveBeenCalled();
  });

  it('refuses a redo on a sketch without saving anything', async () => {
    m.tables.drawing_submissions = { data: sketch, error: null };
    const res = await PATCH(patch({ action: 'redo' }), ctx);
    expect(res.status).toBe(400);
    expect(m.save).not.toHaveBeenCalled();
  });

  it('keeps assignment drawings on the assignment message', async () => {
    m.tables.drawing_submissions = { data: { ...sketch, source_type: 'assignment', assignment_id: 'a1', status: 'submitted' }, error: null };
    m.tables.nexus_class_assignments = { data: { id: 'a1', title: 'Line Practice', evaluation_type: 'stars', max_marks: 5 }, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'ok', action: 'complete' }), ctx);
    expect(res.status).toBe(200);
    expect(m.sendNudge).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'assignment_reviewed' }));
    expect(m.recordFlip).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm test:run "apps/nexus/src/app/api/drawing/submissions/[id]/review/route.test.ts"`
Expected: FAIL (no `notified`, no practice nudge, redo accepted).

- [ ] **Step 6: Change the review route**

In `apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts`:

1. Imports: remove `getDrawingReviewQueue`; add `recordFlip` to the `@neram/database/queries/nexus` import; add
```ts
import { canRedo, reviewKindOf, wasReviewedBefore } from '@/lib/drawing-source';
import { buildPracticeReviewMessage, shouldNotifyPractice } from '@/lib/practice-review-message';
```
2. Replace `const wasAlreadyReviewed = ['reviewed', 'redo', 'completed'].includes(sub?.status || '');` with:
```ts
    const kind = reviewKindOf(sub);
    // A sketch is stored 'completed' at upload, so status alone would read every
    // first review of a sketch as a re-review.
    const wasAlreadyReviewed = wasReviewedBefore(sub);
```
3. Directly after `const reviewAction = action || 'complete'; // backward compat`, insert:
```ts
    if (reviewAction === 'redo' && !canRedo(sub)) {
      return NextResponse.json(
        { error: kind === 'test' ? 'A test drawing is marked, not sent back for a redo.' : 'A sketch has no redo round. Save the review instead.' },
        { status: 400 },
      );
    }
```
4. After the assignment notification block (the `if (notify && assignment) { ... }` that ends before the re-review comment), insert:
```ts
    // Practice (a sketch, question bank, free practice, homework): the same one
    // door, the teacher's own Teams chat first, a link to the drawing in the
    // student's sketchbook. Marking practice is optional, so only a first
    // review, a redo, or a changed verdict is worth a message.
    if (
      kind === 'practice' &&
      shouldNotifyPractice({
        action: reviewAction,
        previouslyReviewed: wasAlreadyReviewed,
        previousStatus: sub?.status ?? '',
        previousRating: sub?.tutor_rating ?? null,
        rating: tutor_rating || null,
        previousFeedback: sub?.tutor_feedback ?? null,
        feedback: tutor_feedback || null,
      })
    ) {
      try {
        const link = `${shareBaseUrl(request.nextUrl.origin)}/student/sketchbook/${id}`;
        const message = buildPracticeReviewMessage({
          action: reviewAction,
          teacherName: (user as any).name ?? null,
          sourceType: sub?.source_type ?? null,
          rating: tutor_rating || null,
        });
        const { results } = await sendNudge({
          teacher: { authHeader, userId: user.id },
          studentIds: [submission.student_id],
          subject: message.subject,
          plain: message.plain,
          html: plainToHtmlWithLink(message.plain, link, message.buttonLabel),
          eventType: 'practice_reviewed',
          metadata: { submission_id: id, action: reviewAction, source: sub?.source_type ?? null },
          respectDormancy: false,
        });
        const r = results[0];
        delivery = r ? { chat: r.chat, teams: r.teams, inapp: r.inapp, reasons: r.reasons ?? null } : null;
      } catch (err) {
        console.error('[Drawing review] student was not told about the practice review:', err);
      }
    }

    // Reviewing practice is also looking at it: it leaves the flip-through.
    if (kind === 'practice') {
      try {
        await recordFlip(user.id, id, 'seen');
      } catch (err) {
        console.error('[Drawing review] seen was not recorded:', err);
      }
    }
```
5. Delete the whole `// Notify student if this is a re-review ...` block (the `if (wasAlreadyReviewed) { ... drawing_notifications ... }`). Every message now goes through `sendNudge`.
6. Replace the `else { const queue = await getDrawingReviewQueue(...) ... }` branch of the next lookup with nothing, and put this comment above the `if (sub?.assignment_id)`:
```ts
    // Practice and test drawings: the screen walks its own list (lib/review-context),
    // never the whole school's queue.
```
7. Add `notified: delivery !== null,` to the final `NextResponse.json({...})` object.

- [ ] **Step 7: Extend the submission GET route**

In `apps/nexus/src/app/api/drawing/submissions/[id]/route.ts`:

1. Add imports:
```ts
import {
  getExamDrawingMaxMarks,
  getInspirationItem,
  getInspirationItemsForSubmission,
  listLiveFeatures,
} from '@neram/database/queries/nexus';
import { reviewKindOf } from '@/lib/drawing-source';
import { displayTitle } from '@/lib/inspiration-present';
```
(merge into the existing `@neram/database/queries/nexus` import).
2. After `const voiceBySubmission = ...`, insert:
```ts
    // What the one review screen needs beyond the row: the Show in Inspiration
    // switch, the Inspiration drawing this was practised from, whether it is
    // featured in a class, and a test drawing's marks ceiling. exam_attempt_id
    // and exam_qb_question_id are read off the select('*') row, never named in a
    // select, because staging has neither column.
    const row = submission as any;
    const kind = reviewKindOf(row);
    const itemId = (row.inspiration_item_id as string | null) ?? null;
    const [inspiration, practisedFrom, featured, examMaxMarks] = await Promise.all([
      isStaffViewer && kind !== 'test' ? getInspirationItemsForSubmission(id).catch(() => null) : Promise.resolve(null),
      itemId && viewer
        ? getInspirationItem(itemId, viewer.id, isStaffViewer ? 'all' : 'visible').then((r) => r.item).catch(() => null)
        : Promise.resolve(null),
      isStaffViewer && kind === 'practice' ? listLiveFeatures([id]).then((f) => f[id] ?? []).catch(() => []) : Promise.resolve([]),
      isStaffViewer && kind === 'test' && row.exam_attempt_id && row.exam_qb_question_id
        ? getExamDrawingMaxMarks(row.exam_attempt_id, row.exam_qb_question_id).catch(() => null)
        : Promise.resolve(null),
    ]);
```
3. Add to the response object:
```ts
      inspiration: isStaffViewer ? inspiration : null,
      practised_from: practisedFrom
        ? { item_id: practisedFrom.id, title: displayTitle(practisedFrom), image_url: practisedFrom.thumbnail_url || practisedFrom.image_url }
        : null,
      featured,
      exam_max_marks: examMaxMarks,
```

- [ ] **Step 8: Run tests and type-check**

Run: `pnpm test:run apps/nexus/src/lib/practice-review-message.test.ts "apps/nexus/src/app/api/drawing/submissions/[id]/review/route.test.ts" apps/nexus/src/lib/notification-door-guard.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/lib/practice-review-message.ts apps/nexus/src/lib/practice-review-message.test.ts "apps/nexus/src/app/api/drawing/submissions/[id]/route.ts" "apps/nexus/src/app/api/drawing/submissions/[id]/review/route.ts" "apps/nexus/src/app/api/drawing/submissions/[id]/review/route.test.ts"
git commit -m "feat(nexus): practice reviews tell the student through the one door and leave the flip-through

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Review action bar and Show in Inspiration switch

**Files:**
- Create: `apps/nexus/src/components/drawings/review/InspirationSwitch.tsx`
- Test: `apps/nexus/src/components/drawings/review/InspirationSwitch.test.tsx`
- Modify: `apps/nexus/src/components/drawings/review/ReviewActionBar.tsx` (props and the grading branch)
- Test: `apps/nexus/src/components/drawings/review/ReviewActionBar.test.tsx` (create)
- Modify: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx` (only the `<ReviewActionBar .../>` props, so this commit compiles)

**Interfaces:**
- Consumes: `SubmissionInspirationState` (Task 3), `patchItem(getToken, itemId, patch)` from `@/components/inspiration/inspiration-api`, `completeLabel` from `@/lib/drawing-ai-draft`.
- Produces:
  - `InspirationSwitch` default export, props `{ state: SubmissionInspirationState; getToken: () => Promise<string | null>; onChange: (next: SubmissionInspirationState) => void }`
  - `ReviewActionBarProps` loses `showInGallery` and `onShowInGalleryChange`, gains `mode: 'owed' | 'practice'`, `canRedo: boolean`, `onNext: (() => void) | null`, `inspirationSlot?: ReactNode`
  - Practice grading bar: inspiration slot, Redo (only when `canRedo`), Next (outlined, when `onNext`), and the primary "Send review" (or "Update review" when `alreadyReviewed`). No Save draft.
  - Owed grading bar: unchanged buttons (Save draft, Redo when `canRedo`, Complete); the slot replaces the gallery switch.
  - Locked bar in practice mode adds Next beside Evaluate.

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/components/drawings/review/InspirationSwitch.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ patchItem: vi.fn(async () => ({ item: null })) }));
vi.mock('@/components/inspiration/inspiration-api', () => api);

import InspirationSwitch from './InspirationSwitch';

const auto = { item_id: 'i1', curation: 'auto' as const, visible: true, auto_eligible: true };

describe('InspirationSwitch', () => {
  beforeEach(() => api.patchItem.mockClear());

  it('hides the drawing by hand', async () => {
    const onChange = vi.fn();
    render(<InspirationSwitch state={auto} getToken={async () => 't'} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show in Inspiration' }));
    await waitFor(() => expect(api.patchItem).toHaveBeenCalledWith(expect.any(Function), 'i1', { curation: 'hidden' }));
    expect(onChange).toHaveBeenCalledWith({ ...auto, curation: 'hidden', visible: false });
  });

  it('hands a hand-set choice back to the automatic rule', async () => {
    const onChange = vi.fn();
    render(<InspirationSwitch state={{ ...auto, curation: 'hidden', visible: false }} getToken={async () => 't'} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use automatic' }));
    await waitFor(() => expect(api.patchItem).toHaveBeenCalledWith(expect.any(Function), 'i1', { curation: 'auto' }));
    expect(onChange).toHaveBeenCalledWith({ ...auto, curation: 'auto', visible: true });
  });

  it('says why it is on when it is automatic', () => {
    render(<InspirationSwitch state={auto} getToken={async () => 't'} onChange={vi.fn()} />);
    expect(screen.getByText('Automatic at 4 stars and above.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use automatic' })).toBeNull();
  });
});
```

Create `apps/nexus/src/components/drawings/review/ReviewActionBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReviewActionBar, { type ReviewActionBarProps } from './ReviewActionBar';

const props = (over: Partial<ReviewActionBarProps> = {}): ReviewActionBarProps => ({
  isEditMode: true,
  isSuperseded: false,
  attemptIndex: 1,
  attemptTotal: 1,
  statusLabel: 'Submitted',
  alreadyReviewed: false,
  onEvaluate: vi.fn(),
  onOpenLatest: null,
  onSaveDraft: vi.fn(),
  draftSaving: false,
  draftSaved: false,
  onRedo: vi.fn(),
  onComplete: vi.fn(),
  saving: false,
  pendingAction: 'complete',
  voiceBusy: false,
  mode: 'owed',
  canRedo: true,
  onNext: null,
  ...over,
});

describe('ReviewActionBar', () => {
  it('keeps the owed bar: draft, redo, complete, and no Next', () => {
    render(<ReviewActionBar {...props()} />);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Complete' })).toBeTruthy();
    expect(screen.getAllByTitle('Save draft').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('gives a sketch Next and Send review, with no redo and no draft', () => {
    const onNext = vi.fn();
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext })} />);
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull();
    expect(screen.queryAllByTitle('Save draft')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onNext).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send review' })).toBeTruthy();
  });

  it('says Update review once practice has a review', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn(), alreadyReviewed: true })} />);
    expect(screen.getByRole('button', { name: 'Update review' })).toBeTruthy();
  });

  it('keeps Next on a locked practice drawing', () => {
    render(<ReviewActionBar {...props({ mode: 'practice', canRedo: false, onNext: vi.fn(), isEditMode: false, statusLabel: 'Completed' })} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Evaluate' })).toBeTruthy();
  });

  it('renders the Inspiration slot where the gallery switch was', () => {
    render(<ReviewActionBar {...props({ inspirationSlot: <span>slot here</span> })} />);
    expect(screen.getByText('slot here')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:run apps/nexus/src/components/drawings/review/InspirationSwitch.test.tsx apps/nexus/src/components/drawings/review/ReviewActionBar.test.tsx`
Expected: FAIL (no switch component; bar has no practice mode).

- [ ] **Step 3: Write `InspirationSwitch.tsx`**

```tsx
'use client';

/**
 * Show in Inspiration, for the student's own drawing.
 *
 * Automatic by default: the drawing is in once it is rated 4 stars and above
 * (or 80% of the marks). Switching it on or off by hand pins that choice, and
 * "Use automatic" hands it back to the rule. It saves at once rather than with
 * the review, because the Inspiration item lives on its own row.
 */

import { useState } from 'react';
import { Box, Button, Switch, Typography } from '@neram/ui';
import type { SubmissionInspirationState } from '@neram/database/queries/nexus';
import { patchItem } from '@/components/inspiration/inspiration-api';

interface InspirationSwitchProps {
  state: SubmissionInspirationState;
  getToken: () => Promise<string | null>;
  onChange: (next: SubmissionInspirationState) => void;
}

export default function InspirationSwitch({ state, getToken, onChange }: InspirationSwitchProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = async (curation: SubmissionInspirationState['curation']) => {
    setBusy(true);
    setError('');
    try {
      await patchItem(getToken, state.item_id, { curation });
      const visible = curation === 'shown' ? true : curation === 'hidden' ? false : state.auto_eligible;
      onChange({ ...state, curation, visible });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change Inspiration');
    } finally {
      setBusy(false);
    }
  };

  const manual = state.curation !== 'auto';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'inline' }, fontWeight: 600 }}>
        Show in Inspiration
      </Typography>
      <Switch
        checked={state.visible}
        disabled={busy}
        onChange={(e) => void set(e.target.checked ? 'shown' : 'hidden')}
        size="small"
        inputProps={{ 'aria-label': 'Show in Inspiration' }}
      />
      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: { xs: 'none', md: 'inline' } }}>
        {manual ? 'Set by you.' : 'Automatic at 4 stars and above.'}
      </Typography>
      {manual && (
        <Button
          size="small"
          variant="text"
          disabled={busy}
          onClick={() => void set('auto')}
          sx={{ minHeight: 44, textTransform: 'none', display: { xs: 'none', md: 'inline-flex' } }}
        >
          Use automatic
        </Button>
      )}
      {error && (
        <Typography role="alert" variant="caption" color="error" sx={{ width: '100%', textAlign: 'right' }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Change `ReviewActionBar.tsx`**

1. Add `import type { ReactNode } from 'react';` and `import ArrowForwardIcon from '@mui/icons-material/ArrowForward';`.
2. Update the file's top doc comment: replace "Grading: Save draft, Redo, Complete, and the gallery opt-in." with "Owed work (assignments, tests): Save draft, Redo, Complete. Practice: Next and Send review, marking optional. Both carry the Show in Inspiration switch when the drawing has an item."
3. In `ReviewActionBarProps`, delete `showInGallery` and `onShowInGalleryChange`, and add:
```ts
  /** Owed work must be marked; practice only may be. */
  mode: 'owed' | 'practice';
  /** A sketch and a test drawing have no redo round. */
  canRedo: boolean;
  /** Practice: move on without saving. Null hides Next. */
  onNext: (() => void) | null;
  /** The Show in Inspiration switch, when this drawing has an Inspiration item. */
  inspirationSlot?: ReactNode;
```
4. Destructure the new props instead of the removed ones.
5. In the locked branch, add before the Evaluate button:
```tsx
        {mode === 'practice' && onNext && (
          <Button
            variant="outlined"
            size="small"
            endIcon={<ArrowForwardIcon />}
            onClick={onNext}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 48, minWidth: 0, px: 1.5, ...hideStartIconOnPhone }}
          >
            Next
          </Button>
        )}
```
6. In the grading branch, replace the gallery `<Box component="label">...</Box>` block with:
```tsx
      {inspirationSlot && (
        <Box sx={{ order: { xs: 10, md: -1 }, width: { md: '100%' }, display: 'flex', justifyContent: 'flex-end', minHeight: { md: 32 } }}>
          {inspirationSlot}
        </Box>
      )}
```
7. Wrap both Save draft controls (the `IconButton` and the `Button`) in `{mode === 'owed' && (<>...</>)}`.
8. Wrap the Redo `Button` in `{canRedo && (...)}`.
9. After the Redo block, add:
```tsx
      {mode === 'practice' && onNext && (
        <Button
          variant="outlined"
          size="small"
          onClick={onNext}
          disabled={saving}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 48, minWidth: 0, px: { xs: 1.5, md: 2 }, whiteSpace: 'nowrap' }}
        >
          Next
        </Button>
      )}
```
10. Change the primary button's label expression to:
```tsx
        {saving && pendingAction === 'complete'
          ? '...'
          : mode === 'practice'
            ? (alreadyReviewed ? 'Update review' : 'Send review')
            : completeLabel({ hasDraft: !!hasAiDraft, alreadyReviewed })}
```
The Next button in the grading branch has no icon on purpose: the bar is tight at 375px and the word carries it.

- [ ] **Step 5: Keep the page compiling**

In `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`, in the `<ReviewActionBar .../>` element (around line 970) replace the two props `showInGallery={showInGallery}` and `onShowInGalleryChange={setShowInGallery}` with `mode="owed"`, `canRedo`, `onNext={null}`. (Task 8 wires the real values.) Leave the `showInGallery` state in place for now.

- [ ] **Step 6: Run tests and type-check**

Run: `pnpm test:run apps/nexus/src/components/drawings/review`
Expected: PASS.
Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/components/drawings/review/InspirationSwitch.tsx apps/nexus/src/components/drawings/review/InspirationSwitch.test.tsx apps/nexus/src/components/drawings/review/ReviewActionBar.tsx apps/nexus/src/components/drawings/review/ReviewActionBar.test.tsx "apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx"
git commit -m "feat(nexus): review bar for practice (Next, Send review) and a Show in Inspiration switch

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: One review screen for every drawing

**Files:**
- Modify: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx`
- Modify: `apps/nexus/src/components/drawings/review/ReviewPanelBody.tsx` (props; the fragment returned at line 112)
- Modify: `apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx` (props at lines 38-60; the encouragement block at lines 542-545)

**Interfaces:**
- Consumes: Task 2 (`reviewKindOf`, `opensForGrading`, `canRedo`), Task 3 (`SubmissionInspirationState`, `SketchbookFeatureFact`), Task 5 (`parseReviewContext`, `reviewBackHref`, `reviewCrumbs`, `reviewHref`, `useReviewQueue(ctx, fallbackAssignmentId, id, getToken)`), Task 6 (GET response fields `inspiration`, `practised_from`, `featured`, `exam_max_marks`; PATCH response `notified`), Task 7 (`ReviewActionBar` props, `InspirationSwitch`), existing `TeacherSketchActions` and `flipSketch`.
- Produces:
  - `ReviewPanelBodyProps` gains `quickActions?: ReactNode` (rendered first in the rail) and `showEncouragement?: boolean` (passed through)
  - `AIFeedbackWorkspace` prop `showEncouragement?: boolean` (default `true`)

- [ ] **Step 1: Add the two pass-through props**

In `AIFeedbackWorkspace.tsx`, add to `AIFeedbackWorkspaceProps`:
```ts
  /**
   * The "Send some encouragement" picker. Off for practice, where the review
   * screen shows the quick reactions (Nice, Great, Wow) that the flip-through uses.
   */
  showEncouragement?: boolean;
```
default it to `true` in the destructuring, and wrap the encouragement block (the `<Box sx={{ mt: 2 }}>` holding `<ReactionPicker ... />`) in `{showEncouragement && (...)}`.

In `ReviewPanelBody.tsx`, add to `ReviewPanelBodyProps`:
```ts
  /** Practice only: quick reactions and Feature, above everything else. */
  quickActions?: ReactNode;
  /** Passed to AIFeedbackWorkspace. */
  showEncouragement?: boolean;
```
destructure them (default `showEncouragement = true`), render `{quickActions}` as the first child of the returned fragment (before `{supersededBanner}`), and pass `showEncouragement={showEncouragement}` to `<AIFeedbackWorkspace ... />`.

- [ ] **Step 2: Imports and context in the page**

In `page.tsx`:
1. Add imports:
```ts
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import InspirationSwitch from '@/components/drawings/review/InspirationSwitch';
import TeacherSketchActions from '@/components/sketchbook/TeacherSketchActions';
import { flipSketch } from '@/components/sketchbook/sketchbook-api';
import { canRedo, opensForGrading, reviewKindOf } from '@/lib/drawing-source';
import { parseReviewContext, reviewBackHref, reviewCrumbs, reviewHref } from '@/lib/review-context';
import type { SketchbookFeatureFact, SubmissionInspirationState } from '@neram/database/queries/nexus';
```
and remove `drawingRoundOpensForGrading` from the `@/lib/submission-history` import and `parseLane` from the `@/hooks/useReviewQueue` import.
2. Replace lines 68-77 (the `fromAssignmentId`, `lane`, `laneQs` and `backHref` block and its comment) with:
```ts
  // Where this drawing was opened from (lib/review-context): Back, the trail,
  // J and K, and Save and next all follow that place.
  const reviewCtx = useMemo(() => parseReviewContext(searchParams), [searchParams]);
  const lane = reviewCtx.lane;
```
and delete the duplicate `reviewCtx` line Task 5 added beside the queue call.
3. Directly after `const [loading, setLoading] = useState(true);` add:
```ts
  const backHref = submission ? reviewBackHref(reviewCtx, submission as any) : '/teacher/sketchbook';
```
4. Replace the `showInGallery` state and its comment (lines 104-106) with:
```ts
  // The Show in Inspiration switch, the drawing this was practised from, where
  // it is featured, and a test drawing's marks ceiling (GET /api/drawing/submissions/[id]).
  const [inspiration, setInspiration] = useState<{ original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null } | null>(null);
  const [practisedFrom, setPractisedFrom] = useState<{ item_id: string; title: string; image_url: string } | null>(null);
  const [featured, setFeatured] = useState<SketchbookFeatureFact[]>([]);
  const [examMaxMarks, setExamMaxMarks] = useState<number | null>(null);
```
5. In `fetchData`, after `setStudentTeamsEmail(...)`, add:
```ts
      setInspiration(data.inspiration ?? null);
      setPractisedFrom(data.practised_from ?? null);
      setFeatured(Array.isArray(data.featured) ? data.featured : []);
      setExamMaxMarks(typeof data.exam_max_marks === 'number' ? data.exam_max_marks : null);
```
and in its `catch`, add `setInspiration(null); setPractisedFrom(null); setFeatured([]); setExamMaxMarks(null);`.
6. In the submission-initialising effect, replace `setIsEditMode(drawingRoundOpensForGrading(submission.status, newerAttemptExists));` with `setIsEditMode(opensForGrading(submission as any, newerAttemptExists));`, and delete the gallery block (the comment starting "Visibility toggle reflects the server state" through `setShowInGallery(...)`).

- [ ] **Step 3: Practice reactions belong to the quick bar**

Replace `handleWorkspaceChange` with:
```ts
  // On practice the reaction is set by the quick bar (Nice, Great, Wow), and the
  // workspace's own picker is hidden. The workspace still reports its stale copy
  // of the reaction with every other change, so keep the page's value.
  const isPracticeRef = useRef(false);
  isPracticeRef.current = !!submission && reviewKindOf(submission as any) === 'practice';
  const handleWorkspaceChange = useCallback((data: WorkspaceData) => {
    const next = isPracticeRef.current ? { ...data, reaction: workspaceRef.current.reaction } : data;
    workspaceRef.current = next;
    setWorkspaceData(next);
  }, []);
```

- [ ] **Step 4: Save and next, Next, J and K follow the context**

In `handleSaveReview`:
1. Replace `is_gallery_visible: showInGallery,` with:
```ts
          // The old gallery flag stays as it was. Inspiration has its own switch.
          is_gallery_visible: !!(submission as any)?.is_gallery_visible,
```
2. Replace everything from `const chatMissed = ...` through the closing of the `if (nextId) { ... } else { ... }` with:
```ts
      const chatMissed = result?.delivery && result.delivery.chat === false;
      const verb = reviewAction === 'redo' ? 'Redo' : 'Review';
      // A held assignment tells nobody on Complete, and a practice re-save that
      // changed nothing tells nobody either, so neither receipt may say "sent".
      const told = result?.held
        ? `${verb} for ${who} held. ${result.held_count} waiting to hand back.`
        : result?.notified
          ? `${verb} sent to ${who}.` + (chatMissed ? ' Teams chat did not send, the Nexus bell did.' : '')
          : `${verb} saved.`;
      // A lane, a sketchbook month, the flip-through or an exam walk their own
      // list; a plain assignment link uses the server's oldest-first pick.
      const ownList = !!lane || (reviewCtx.from !== null && reviewCtx.from !== 'assignment');
      const nextId = ownList ? queue.afterId : result?.next_submission_id;
      const waiting = Math.max(0, queue.total - (queue.position != null ? 1 : 0));
      const left = lane
        ? `${waiting} left in ${BAND_LABEL[lane]}.`
        : reviewCtx.from === 'flip' || reviewCtx.from === 'exam'
          ? `${waiting} left.`
          : reviewCtx.from === 'sketchbook'
            ? ''
            : `${result?.remaining} left to review.`;
      if (nextId) {
        router.push(reviewHref(nextId, reviewCtx, { notice: `${told} ${left}`.trim() }));
      } else {
        router.push(backHref);
      }
```
3. Replace `openAttempt` with:
```ts
  const openAttempt = useCallback(
    (attemptId: string) => router.push(reviewHref(attemptId, reviewCtx)),
    [router, reviewCtx],
  );
```
4. In the key handler, replace the `go` body's two `qs` lines with `router.push(reviewHref(to, reviewCtx));`, and change that effect's dependency list to `[reviewCtx, router]`.
5. After the `queue` declaration, add:
```ts
  // A practice drawing on screen for 1.5 seconds has been looked at: the same
  // rule as the flip-through card, so it leaves that inbox.
  useEffect(() => {
    if (!submission || reviewKindOf(submission as any) !== 'practice') return;
    const timer = setTimeout(() => { void flipSketch(getToken, submission.id, 'seen').catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, [submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Practice only: move on without saving. From the flip-through that is a skip. */
  const handleNext = useCallback(() => {
    if (reviewCtx.from === 'flip' && submission && !(submission as any).reviewed_at) {
      void flipSketch(getToken, submission.id, 'skipped').catch(() => {});
    }
    router.push(queue.nextId ? reviewHref(queue.nextId, reviewCtx) : backHref);
  }, [reviewCtx, submission, getToken, router, queue.nextId, backHref]);
```

- [ ] **Step 5: Kind, grade scale and the trail**

1. After `const sub = submission as any;` add:
```ts
  const kind = reviewKindOf(sub);
  const isPractice = kind === 'practice';
  // A test drawing is marked out of the marks its test gives the question. When
  // that cannot be read, 100 keeps the box usable rather than refusing a mark.
  const evaluationType: 'marks' | 'stars' = kind === 'test' ? 'marks' : (submission.assignment?.evaluation_type ?? 'stars');
  const maxMarks = kind === 'test' ? (examMaxMarks ?? 100) : (submission.assignment?.max_marks ?? 5);
```
2. Replace the whole breadcrumb block (the comment "This drawing belongs to a class assignment when it was opened from one", `assignmentId`, `assignmentTitle` and `assignmentContextBar`) with:
```tsx
  // Where this drawing sits: its assignment, the student's sketchbook, the exam
  // or the Inspiration drawing it was opened from (lib/review-context).
  const crumbs = reviewCrumbs(reviewCtx, sub);
  const ContextIcon =
    kind === 'assignment' ? AssignmentOutlinedIcon
      : kind === 'test' ? EventNoteOutlinedIcon
        : reviewCtx.from === 'inspiration' ? CollectionsOutlinedIcon
          : AutoStoriesOutlinedIcon;
  const assignmentContextBar = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: { xs: 1.5, md: 2 },
        py: 0.75,
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <ContextIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
      <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: '0.85rem' }} />} sx={{ flex: 1, minWidth: 0 }}>
        {crumbs.map((c) =>
          c.href ? (
            <MuiLink
              key={c.label}
              component={NextLink}
              href={c.href}
              underline="hover"
              color="text.secondary"
              variant="caption"
              sx={{
                fontWeight: 500,
                display: 'inline-block',
                maxWidth: { xs: 150, sm: 280 },
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                verticalAlign: 'bottom',
              }}
            >
              {c.label}
            </MuiLink>
          ) : (
            <Typography key={c.label} variant="caption" color="primary.dark" sx={{ fontWeight: 700 }}>
              {c.label}
            </Typography>
          ),
        )}
      </Breadcrumbs>
    </Box>
  );
```
3. In `panelHeader`, replace `(submission.assignment?.evaluation_type ?? 'stars') === 'marks'` with `evaluationType === 'marks'` and `{submission.assignment?.max_marks ?? 5}` with `{maxMarks}`.
4. In `<ReviewPanelBody ... />`, replace `evaluationType={submission.assignment?.evaluation_type ?? 'stars'}` with `evaluationType={evaluationType}` and `maxMarks={submission.assignment?.max_marks ?? 5}` with `maxMarks={maxMarks}`, and add:
```tsx
            showEncouragement={!isPractice}
            quickActions={isPractice ? (
              <TeacherSketchActions
                key={submission.id}
                compact
                sketchId={submission.id}
                reaction={(['heart', 'fire', 'wow'] as const).includes(workspaceData.reaction as never) ? (workspaceData.reaction as 'heart' | 'fire' | 'wow') : null}
                featured={featured}
                selfNote={submission.self_note}
                onChanged={(change) => {
                  if (change.reaction !== undefined) {
                    const next = { ...workspaceRef.current, reaction: change.reaction as WorkspaceData['reaction'] };
                    workspaceRef.current = next;
                    setWorkspaceData(next);
                  }
                  if (change.featured) setFeatured(change.featured);
                }}
              />
            ) : null}
```

- [ ] **Step 6: Practised-from strip and the action bar**

1. Before `const previousAttemptsPanel`, add:
```tsx
  // A sketch made with "Practise this": the Inspiration drawing it was drawn from.
  const practisedStrip = practisedFrom ? (
    <Box
      component={NextLink}
      href={`/teacher/inspiration/${practisedFrom.item_id}`}
      sx={{
        px: 1.5, py: 1, minHeight: 56, display: 'flex', alignItems: 'center', gap: 1,
        borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0,
        color: 'text.primary', textDecoration: 'none',
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 },
      }}
    >
      <Box component="img" src={practisedFrom.image_url} alt="" sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>Practised from Inspiration</Typography>
        <Typography variant="body2" noWrap>{practisedFrom.title}</Typography>
      </Box>
    </Box>
  ) : null;
```
2. Change the `referenceStrip` prop of `<ReviewShell>` to:
```tsx
        referenceStrip={
          practisedStrip || partsStrip || referenceStrip ? (
            <>
              {practisedStrip}
              {partsStrip}
              {referenceStrip}
            </>
          ) : null
        }
```
3. In `<ReviewActionBar ... />`, replace the temporary `mode="owed" canRedo onNext={null}` (from Task 7) with:
```tsx
            mode={isPractice ? 'practice' : 'owed'}
            canRedo={canRedo(sub)}
            onNext={isPractice ? handleNext : null}
            inspirationSlot={
              inspiration?.original ? (
                <InspirationSwitch
                  state={inspiration.original}
                  getToken={getToken}
                  onChange={(next) => setInspiration((prev) => (prev ? { ...prev, original: next } : prev))}
                />
              ) : null
            }
```
4. In `handleDeleteSubmission` nothing changes: it already pushes `backHref`, which now follows the context.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json`
Expected: 0 errors.
Run: `pnpm test:run apps/nexus/src/components/drawings apps/nexus/src/lib/review-context.test.ts apps/nexus/src/hooks/useReviewQueue.test.ts`
Expected: PASS.
Run: `pnpm --filter @neram/nexus lint`
Expected: 0 errors.
Read back through the page once for any remaining `fromAssignmentId`, `laneQs`, `showInGallery` or `/teacher/drawing-reviews'` string used as a destination: there must be none.

- [ ] **Step 8: Commit**

```bash
git add "apps/nexus/src/app/(teacher)/teacher/drawing-reviews/[id]/page.tsx" apps/nexus/src/components/drawings/review/ReviewPanelBody.tsx apps/nexus/src/components/drawings/AIFeedbackWorkspace.tsx
git commit -m "feat(nexus): one review screen for sketches, practice, assignments and tests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Sketchbook screens

**Files:**
- Modify: `apps/nexus/src/lib/drawing-source.ts` (append `reviewStateWords`) and its test
- Modify: `apps/nexus/src/lib/review-context.ts` (append `sketchbookReviewHref`, `flipReviewHref`) and its test
- Create: `apps/nexus/src/components/drawings/ReviewStateBadge.tsx`
- Modify: `apps/nexus/src/components/sketchbook/SketchGrid.tsx` and `SketchGrid.test.tsx`
- Modify: `apps/nexus/src/components/sketchbook/SketchbookView.tsx`
- Modify: `apps/nexus/src/components/sketchbook/SketchPageView.tsx`
- Create: `apps/nexus/src/components/sketchbook/StudentDrawingReview.tsx` and `StudentDrawingReview.test.tsx`
- Modify: `apps/nexus/src/components/sketchbook/FlipThrough.tsx` and `FlipThrough.test.tsx`
- Modify: `apps/nexus/src/components/sketchbook/RhythmRow.tsx` (line 114), `SketchbookSection.tsx` (line 27)
- Modify: `apps/nexus/src/components/sketchbook/AddSketchSheet.tsx`, `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx` (props and the title row near line 266)
- Modify: `apps/nexus/src/app/(teacher)/teacher/sketchbook/[studentId]/page.tsx`, `[studentId]/[sketchId]/page.tsx`, `apps/nexus/src/app/(student)/student/sketchbook/page.tsx`, `apps/nexus/src/app/(student)/student/sketchbook/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2, Task 4 (`SketchbookEntry`, `SketchbookPayload.shareOptOut`, `setShareOptOut`, `practiseBody`), Task 5 (`parseReviewContext`, `reviewHref`), Task 6 (GET submission `practised_from`).
- Produces:
  - `reviewStateWords(summary: ReviewSummary, opts: { maxMarks: number | null; viewer: 'own' | 'teacher' }): string | null`
  - `sketchbookReviewHref(submissionId: string, studentId: string, month?: string | null): string`
  - `flipReviewHref(submissionId: string, classroomId: string): string`
  - `ReviewStateBadge` default export `{ review: ReviewSummary; maxMarks: number | null }` (renders nothing for `none`)
  - `SketchGrid` gains `viewer?: 'own' | 'teacher'`; `GridSketch` is `SketchbookEntry`
  - `SketchbookView` gains `onShareOptOutChange?: (optOut: boolean) => Promise<void>`
  - `SketchPageView` gains `review?: ReactNode`
  - `StudentDrawingReview` default export `{ entry: SketchbookEntry; submission: { original_image_url: string; tutor_feedback: string | null; reviewed_image_url: string | null; corrected_image_url: string | null } | null; practisedFrom: { item_id: string; title: string; image_url: string } | null }`
  - `DrawingSubmissionSheet` gains `intro?: string`; `AddSketchSheet` gains `practise?: { itemId: string; imageUrl: string; title: string } | null`

- [ ] **Step 1: Write the failing tests**

Append to `apps/nexus/src/lib/drawing-source.test.ts` (add `reviewStateWords` to the import):

```ts
describe('reviewStateWords', () => {
  it('names stars, marks, waiting and redo in plain words', () => {
    expect(reviewStateWords({ state: 'reviewed', rating: 4, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('reviewed, 4 stars');
    expect(reviewStateWords({ state: 'reviewed', rating: null, marks: 7 }, { maxMarks: 10, viewer: 'own' })).toBe('reviewed, 7 of 10 marks');
    expect(reviewStateWords({ state: 'reviewed', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('reviewed');
    expect(reviewStateWords({ state: 'waiting', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('waiting for your teacher');
    expect(reviewStateWords({ state: 'waiting', rating: null, marks: null }, { maxMarks: null, viewer: 'teacher' })).toBe('waiting for review');
    expect(reviewStateWords({ state: 'redo', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBe('redo asked');
    expect(reviewStateWords({ state: 'none', rating: null, marks: null }, { maxMarks: null, viewer: 'own' })).toBeNull();
  });
});
```

Append to `apps/nexus/src/lib/review-context.test.ts` (add the two names to the import):

```ts
describe('sketchbook and flip links', () => {
  it('opens a sketchbook tile with its student and month', () => {
    expect(sketchbookReviewHref('d1', S, '2026-09')).toBe(`/teacher/drawing-reviews/d1?from=sketchbook&student=${S}&month=2026-09`);
    expect(sketchbookReviewHref('d1', S)).toBe(`/teacher/drawing-reviews/d1?from=sketchbook&student=${S}`);
  });
  it('opens a flip card with its classroom', () => {
    expect(flipReviewHref('d1', C)).toBe(`/teacher/drawing-reviews/d1?from=flip&classroom=${C}`);
  });
});
```

Replace `apps/nexus/src/components/sketchbook/SketchGrid.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SketchGrid from './SketchGrid';

const sketch = (id: string, day: string, over: Record<string, unknown> = {}) => ({
  id, student_id: 's', original_image_url: `https://x/${id}.jpg`, thumbnail_url: null, self_note: null,
  reaction: null, submitted_at: `${day}T10:00:00.000Z`, is_gallery_visible: false, seenBy: null, featured: [],
  source_type: 'sketchbook', status: 'completed', assignment_id: null, question_id: null, reviewed_at: null,
  tutor_rating: null, tutor_marks: null, inspiration_item_id: null, assignment: null,
  kind: 'practice', review: { state: 'none', rating: null, marks: null },
  ...over,
}) as any;

describe('SketchGrid', () => {
  it('renders the thumbnail when present and falls back to the original', () => {
    render(<SketchGrid sketches={[sketch('a', '2026-09-09', { thumbnail_url: 'https://x/a-thumb.jpg' }), sketch('b', '2026-09-08')]} hrefFor={(s) => `/student/sketchbook/${s.id}`} />);
    const imgs = screen.getAllByRole('img');
    expect(imgs[0].getAttribute('src')).toBe('https://x/a-thumb.jpg');
    expect(imgs[1].getAttribute('src')).toBe('https://x/b.jpg');
    expect(imgs[0].getAttribute('loading')).toBe('lazy');
  });

  it('links every tile to its page', () => {
    render(<SketchGrid sketches={[sketch('a', '2026-09-09')]} hrefFor={(s) => `/student/sketchbook/${s.id}`} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/student/sketchbook/a');
  });

  it('says where a drawing came from and how it was reviewed, in words', () => {
    const assignment = sketch('a', '2026-09-15', {
      source_type: 'assignment', assignment_id: 'as1', kind: 'assignment',
      assignment: { id: 'as1', title: 'Line Practice', evaluation_type: 'stars', max_marks: 5 },
      review: { state: 'reviewed', rating: 4, marks: null },
    });
    render(<SketchGrid sketches={[assignment]} hrefFor={() => '#'} viewer="teacher" />);
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Assignment from 15 Sept, Line Practice, reviewed, 4 stars');
    expect(screen.getByText('Assignment')).toBeTruthy();
  });

  it('shows the empty state copy when there is nothing', () => {
    render(<SketchGrid sketches={[]} hrefFor={() => '#'} />);
    expect(screen.getByText('Your sketchbook is empty')).toBeTruthy();
  });
});
```

(`en-IN` short month for September renders `Sept` in current Node ICU; if the test run shows `Sep`, use the rendered value in the expectation. Check it once with `node -e "console.log(new Date('2026-09-15T10:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'}))"`.)

Create `apps/nexus/src/components/sketchbook/StudentDrawingReview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/drawings/ImageToggleTabs', () => ({ default: () => <div>image tabs</div> }));

import StudentDrawingReview from './StudentDrawingReview';

const entry = (over: Record<string, unknown> = {}) =>
  ({
    id: 'd1', source_type: 'sketchbook', assignment: null, inspiration_item_id: null,
    review: { state: 'none', rating: null, marks: null }, ...over,
  }) as any;

const detail = { original_image_url: 'https://x/o.jpg', tutor_feedback: 'Keep the lines light.', reviewed_image_url: 'https://x/r.jpg', corrected_image_url: null };

describe('StudentDrawingReview', () => {
  it('shows the stars and the words of a released review', () => {
    render(<StudentDrawingReview entry={entry({ review: { state: 'reviewed', rating: 4, marks: null } })} submission={detail} practisedFrom={null} />);
    expect(screen.getByText("Your teacher's review")).toBeTruthy();
    expect(screen.getByText('4 out of 5 stars')).toBeTruthy();
    expect(screen.getByText('Keep the lines light.')).toBeTruthy();
    expect(screen.getByText('image tabs')).toBeTruthy();
  });

  it('says an assignment drawing is waiting, and links to the assignment', () => {
    render(
      <StudentDrawingReview
        entry={entry({ source_type: 'assignment', assignment: { id: 'as1', title: 'Line Practice', evaluation_type: 'stars', max_marks: 5 }, review: { state: 'waiting', rating: null, marks: null } })}
        submission={null}
        practisedFrom={null}
      />,
    );
    expect(screen.getByText('Your teacher has not reviewed this yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Line Practice' }).getAttribute('href')).toBe('/student/assignments/as1');
  });

  it('links to the Inspiration drawing it was practised from, or says it is gone', () => {
    const { rerender } = render(
      <StudentDrawingReview entry={entry({ inspiration_item_id: 'i1' })} submission={null} practisedFrom={{ item_id: 'i1', title: 'Street view', image_url: 'https://x/i.jpg' }} />,
    );
    expect(screen.getByRole('link', { name: /Practised from Inspiration/ }).getAttribute('href')).toBe('/student/inspiration/i1');
    rerender(<StudentDrawingReview entry={entry({ inspiration_item_id: 'i1' })} submission={null} practisedFrom={null} />);
    expect(screen.getByText('Practised from an Inspiration drawing that is no longer shown.')).toBeTruthy();
  });
});
```

In `apps/nexus/src/components/sketchbook/FlipThrough.test.tsx`, add `source_type: 'sketchbook', status: 'completed', assignment_id: null, reviewed_at: null,` to `row()`, and add this case:

```tsx
  it('opens the full review for the card on screen', () => {
    swr.mockReturnValue({ data: { sketches: [row('11111111-1111-4111-8111-111111111111')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="22222222-2222-4222-8222-222222222222" />);
    expect(screen.getByRole('link', { name: 'Open review' }).getAttribute('href')).toBe(
      '/teacher/drawing-reviews/11111111-1111-4111-8111-111111111111?from=flip&classroom=22222222-2222-4222-8222-222222222222',
    );
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/drawing-source.test.ts apps/nexus/src/lib/review-context.test.ts apps/nexus/src/components/sketchbook`
Expected: FAIL on the new cases.

- [ ] **Step 3: Pure helpers**

Append to `apps/nexus/src/lib/drawing-source.ts`:

```ts
/** The review part of a tile's spoken label. Null when there is nothing to say. */
export function reviewStateWords(
  summary: ReviewSummary,
  opts: { maxMarks: number | null; viewer: 'own' | 'teacher' },
): string | null {
  switch (summary.state) {
    case 'reviewed':
      if (summary.marks != null && opts.maxMarks) return `reviewed, ${summary.marks} of ${opts.maxMarks} marks`;
      if (summary.rating) return `reviewed, ${summary.rating} stars`;
      return 'reviewed';
    case 'waiting':
      return opts.viewer === 'own' ? 'waiting for your teacher' : 'waiting for review';
    case 'redo':
      return 'redo asked';
    default:
      return null;
  }
}
```

Append to `apps/nexus/src/lib/review-context.ts`:

```ts
/** A tile in a student's sketchbook opens the review screen, and Back returns to that month. */
export function sketchbookReviewHref(submissionId: string, studentId: string, month?: string | null): string {
  const qs = new URLSearchParams({ from: 'sketchbook', student: studentId });
  if (month) qs.set('month', month);
  return reviewHref(submissionId, parseReviewContext(qs));
}

/** The flip-through card's "Open review". */
export function flipReviewHref(submissionId: string, classroomId: string): string {
  return reviewHref(submissionId, parseReviewContext(new URLSearchParams({ from: 'flip', classroom: classroomId })));
}
```

- [ ] **Step 4: `ReviewStateBadge.tsx`**

```tsx
'use client';

/**
 * The review state on a drawing tile: stars, marks, a tick, waiting or redo.
 * Decorative (aria-hidden): the tile's own label says the same in words, so
 * nothing is conveyed by the badge's colour or icon alone.
 */

import { Box, alpha } from '@neram/ui';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import type { ReviewSummary } from '@/lib/drawing-source';

export const tileBadgeSx = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  gap: 0.25,
  px: 0.75,
  py: 0.25,
  borderRadius: 1,
  bgcolor: (t: any) => alpha(t.palette.common.black, 0.66),
  color: 'common.white',
  typography: 'caption',
  fontWeight: 700,
  lineHeight: 1.4,
  maxWidth: 'calc(100% - 12px)',
} as const;

export default function ReviewStateBadge({ review, maxMarks }: { review: ReviewSummary; maxMarks: number | null }) {
  if (review.state === 'none') return null;
  let content: React.ReactNode;
  if (review.state === 'reviewed') {
    content =
      review.marks != null && maxMarks ? `${review.marks}/${maxMarks}`
        : review.rating ? (<><StarRoundedIcon sx={{ fontSize: 16 }} />{review.rating}</>)
          : <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />;
  } else if (review.state === 'waiting') {
    content = <HourglassEmptyRoundedIcon sx={{ fontSize: 16 }} />;
  } else {
    content = <ReplayRoundedIcon sx={{ fontSize: 16 }} />;
  }
  return (
    <Box aria-hidden sx={{ ...tileBadgeSx, top: 6, right: 6 }}>
      {content}
    </Box>
  );
}
```

- [ ] **Step 5: `SketchGrid.tsx`**

1. Imports: add `import ReviewStateBadge, { tileBadgeSx } from '@/components/drawings/ReviewStateBadge';` and `import { drawingSourceLabel, reviewStateWords } from '@/lib/drawing-source';`.
2. Add `viewer?: 'own' | 'teacher';` to `SketchGridProps` (default `'own'`).
3. Add above the component:
```tsx
function tileLabel(s: GridSketch, viewer: 'own' | 'teacher'): string {
  const date = new Date(s.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const parts = [`${drawingSourceLabel(s.source_type)} from ${date}`];
  if (s.assignment?.title) parts.push(s.assignment.title);
  const words = reviewStateWords(s.review, { maxMarks: s.assignment?.max_marks ?? null, viewer });
  if (words) parts.push(words);
  if (s.featured.length > 0) parts.push('featured in class');
  return parts.join(', ');
}
```
4. On the tile link replace the `aria-label` with `aria-label={tileLabel(s, viewer)}`, set the image `alt=""` (the link label carries it), and change the featured badge to `<Box aria-hidden sx={{ ...tileBadgeSx, top: 6, left: 6, bgcolor: 'warning.main', color: 'warning.contrastText' }}><StarOutlinedIcon sx={{ fontSize: 16 }} /></Box>`.
5. After the featured badge add:
```tsx
            <ReviewStateBadge review={s.review} maxMarks={s.assignment?.max_marks ?? null} />
            {s.source_type !== 'sketchbook' && (
              <Box aria-hidden sx={{ ...tileBadgeSx, left: 6, bottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {drawingSourceLabel(s.source_type)}
              </Box>
            )}
```
6. Change the caption to `Tap a drawing to open it.`

- [ ] **Step 6: `SketchbookView.tsx`**

1. Import `CollectionsOutlinedIcon` from `@mui/icons-material/CollectionsOutlined` and add `onShareOptOutChange?: (optOut: boolean) => Promise<void>;` to the props (destructure it); add `const [savingShare, setSavingShare] = useState(false);`.
2. Month count: `{payload.sketches.length} {payload.sketches.length === 1 ? 'drawing' : 'drawings'}, {payload.practiceDaysThisMonth} practice ...`.
3. Show the options menu when `mode === 'own' && (onOptOutChange || onShareOptOutChange)`; guard the existing feature item with `{onOptOutChange && (...)}` and add after it:
```tsx
              {onShareOptOutChange && (
                <MenuItem
                  disabled={savingShare || !payload}
                  onClick={async () => {
                    if (!payload) return;
                    setSavingShare(true);
                    try { await onShareOptOutChange(!payload.shareOptOut); } finally { setSavingShare(false); }
                  }}
                  sx={{ minHeight: 48 }}
                >
                  <ListItemIcon><CollectionsOutlinedIcon /></ListItemIcon>
                  <ListItemText primary="Show my drawings in Inspiration" secondary="Your best drawings can help classmates. Your name shows with them." />
                  <Switch edge="end" checked={!!payload && !payload.shareOptOut} inputProps={{ 'aria-label': 'Show my drawings in Inspiration' }} />
                </MenuItem>
              )}
```
(The existing feature item's `onClick` already guards `onOptOutChange`; keep it.)
4. Pass `viewer={mode}` to `<SketchGrid>`; empty copy: own `'Your sketchbook is empty'` / `'Draw anything for ten minutes and add it here. Assignment drawings appear here on their own.'`; teacher `'No drawings this month'` / `'Try an older month, or check back after the next class.'`.

- [ ] **Step 7: `SketchPageView.tsx` and `StudentDrawingReview.tsx`**

In `SketchPageView.tsx`:
1. Add `review?: ReactNode;` to props (destructure), `import { drawingSourceLabel } from '@/lib/drawing-source';`.
2. Title: `title={studentName ? `${studentName}'s ${sketch.source_type === 'sketchbook' ? 'sketch' : 'drawing'}` : drawingSourceLabel(sketch.source_type)}`.
3. In the chip row, add first: `{sketch.source_type !== 'sketchbook' && <Chip label={sketch.assignment?.title ? `${drawingSourceLabel(sketch.source_type)}: ${sketch.assignment.title}` : drawingSourceLabel(sketch.source_type)} variant="outlined" sx={{ height: 36, maxWidth: '100%' }} />}`, and guard the reaction chip with `sketch.reaction && REACTION_LABEL[sketch.reaction as keyof typeof REACTION_LABEL]` so an assignment's clap or star reaction never reads "undefined".
4. Render `{review}` right after the `self_note` paragraph and before `{actions}`.
5. The delete confirmation copy stays; the delete button still needs `onDelete` (the page decides when to pass it).

Create `apps/nexus/src/components/sketchbook/StudentDrawingReview.tsx`:

```tsx
'use client';

/**
 * A student's own drawing, as their teacher left it: the stars or marks, the
 * words, the overlay and the teacher reference, and where the drawing came from.
 * Only released reviews reach here (lib/sketchbook-payload, and the owner branch
 * of GET /api/drawing/submissions/[id]), so a held or draft review never shows.
 */

import Link from 'next/link';
import { Alert, Box, Button, Paper, Rating, Typography } from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import ImageToggleTabs from '@/components/drawings/ImageToggleTabs';
import type { SketchbookEntry } from '@/lib/sketchbook-payload';

interface StudentDrawingReviewProps {
  entry: SketchbookEntry;
  submission: { original_image_url: string; tutor_feedback: string | null; reviewed_image_url: string | null; corrected_image_url: string | null } | null;
  practisedFrom: { item_id: string; title: string; image_url: string } | null;
}

export default function StudentDrawingReview({ entry, submission, practisedFrom }: StudentDrawingReviewProps) {
  const r = entry.review;
  const maxMarks = entry.assignment?.max_marks ?? null;
  const shown = r.state === 'reviewed' || r.state === 'redo';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
      {entry.assignment && (
        <Button
          component={Link}
          href={`/student/assignments/${entry.assignment.id}`}
          variant="outlined"
          startIcon={<AssignmentOutlinedIcon />}
          sx={{ minHeight: 48, alignSelf: 'flex-start' }}
        >
          {entry.assignment.title ? `Open ${entry.assignment.title}` : 'Open the assignment'}
        </Button>
      )}

      {r.state === 'waiting' && <Alert severity="info">Your teacher has not reviewed this yet.</Alert>}
      {r.state === 'redo' && (
        <Alert severity="info">
          Your teacher asked you to draw this again.{entry.assignment ? ' Open the assignment to see what to change.' : ''}
        </Alert>
      )}

      {shown && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
            Your teacher&apos;s review
          </Typography>
          {r.marks != null && maxMarks ? (
            <Typography variant="body1" sx={{ fontWeight: 600 }}>{r.marks} of {maxMarks} marks</Typography>
          ) : r.rating ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Rating value={r.rating} readOnly aria-hidden />
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{r.rating} out of 5 stars</Typography>
            </Box>
          ) : null}
          {submission?.tutor_feedback && (
            <Typography variant="body1" sx={{ mt: 1.5, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
              {submission.tutor_feedback}
            </Typography>
          )}
          {submission && (submission.reviewed_image_url || submission.corrected_image_url) && (
            <Box sx={{ mt: 2 }}>
              <ImageToggleTabs
                originalImageUrl={submission.original_image_url}
                overlayImageUrl={submission.reviewed_image_url}
                correctedImageUrl={submission.corrected_image_url}
                isEditMode={false}
                studentView
                tabLabels={{ corrected: 'Teacher reference' }}
              />
            </Box>
          )}
        </Paper>
      )}

      {practisedFrom ? (
        <Box
          component={Link}
          href={`/student/inspiration/${practisedFrom.item_id}`}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1, minHeight: 56, borderRadius: 2,
            border: 1, borderColor: 'divider', color: 'text.primary', textDecoration: 'none',
            '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          <Box component="img" src={practisedFrom.image_url} alt="" sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>Practised from Inspiration</Typography>
            <Typography variant="body2" noWrap>{practisedFrom.title}</Typography>
          </Box>
          <CollectionsOutlinedIcon aria-hidden sx={{ ml: 'auto', color: 'text.secondary' }} />
        </Box>
      ) : entry.inspiration_item_id ? (
        <Typography variant="body2" color="text.secondary">
          Practised from an Inspiration drawing that is no longer shown.
        </Typography>
      ) : null}
    </Box>
  );
}
```

- [ ] **Step 8: Pages, links and sheets**

Replace `apps/nexus/src/app/(student)/student/sketchbook/[id]/page.tsx` with:

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { Box, Skeleton, EmptyState } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchPageView from '@/components/sketchbook/SketchPageView';
import StudentDrawingReview from '@/components/sketchbook/StudentDrawingReview';
import { deleteSketch } from '@/components/sketchbook/sketchbook-api';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { SketchbookEntry, SketchbookPayload } from '@/lib/sketchbook-payload';

interface SubmissionDetail {
  submission: { original_image_url: string; tutor_feedback: string | null; reviewed_image_url: string | null; corrected_image_url: string | null };
  practised_from: { item_id: string; title: string; image_url: string } | null;
}

/** A student deletes only their own sketch, before anyone reviewed or featured it. */
function canDelete(entry: SketchbookEntry): boolean {
  return entry.source_type === 'sketchbook' && entry.review.state === 'none' && entry.featured.length === 0;
}

export default function StudentSketchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const { data, isLoading, error } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/me?sketch=${id}`);
  const sketch = data?.sketches.find((s) => s.id === id) ?? null;
  const needsDetail = !!sketch && (sketch.review.state === 'reviewed' || sketch.review.state === 'redo' || !!sketch.inspiration_item_id);
  const { data: detail } = useAuthSWR<SubmissionDetail>(needsDetail ? `/api/drawing/submissions/${id}` : null);

  if (isLoading) return <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />;
  if (error || !sketch) {
    return (
      <Box>
        <PageHeader title="Drawing" backHref="/student/sketchbook" />
        <EmptyState title="Drawing not found" description="It may have been deleted." />
      </Box>
    );
  }
  return (
    <Box>
      <SketchPageView
        sketch={sketch}
        mode="own"
        backHref="/student/sketchbook"
        getToken={getToken}
        review={<StudentDrawingReview entry={sketch} submission={detail?.submission ?? null} practisedFrom={detail?.practised_from ?? null} />}
        onDelete={canDelete(sketch) ? async () => {
          await deleteSketch(getToken, sketch.id);
          router.push('/student/sketchbook');
        } : undefined}
      />
    </Box>
  );
}
```

In `apps/nexus/src/app/(student)/student/sketchbook/page.tsx`: import `setShareOptOut`, add
```tsx
  const onShareOptOutChange = useCallback(async (optOut: boolean) => {
    await setShareOptOut(getToken, optOut);
    await mutate();
  }, [getToken, mutate]);
```
and pass `onShareOptOutChange={onShareOptOutChange}` to `SketchbookView`.

Replace `apps/nexus/src/app/(teacher)/teacher/sketchbook/[studentId]/page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Box } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchbookView from '@/components/sketchbook/SketchbookView';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import { istDate } from '@/lib/sketchbook-rhythm';
import { patchQuery, readSearch } from '@/lib/list-url-state';
import { sketchbookReviewHref } from '@/lib/review-context';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

/**
 * A teacher's view of one student's sketchbook: every drawing on its date, each
 * opening in the one review screen. The month lives in the address (?month=) so
 * Back from a review lands on the month the teacher was looking at.
 */
export default function TeacherStudentSketchbookPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { factsFor } = useStudentStageFacts();
  const [month, setMonth] = useState(() => istDate(new Date()).slice(0, 7));
  useEffect(() => {
    const asked = new URLSearchParams(readSearch()).get('month');
    if (asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) setMonth(asked);
  }, []);
  const changeMonth = (next: string) => {
    setMonth(next);
    patchQuery({ month: next });
  };
  const { data, isLoading } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/students/${studentId}?month=${month}`);
  const name = factsFor(studentId)?.name || 'Student';

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title={`${name}'s sketchbook`} subtitle={data?.classroom?.name} backHref="/teacher/sketchbook" />
      <SketchbookView
        payload={data ?? null}
        loading={isLoading}
        mode="teacher"
        month={month}
        onMonthChange={changeMonth}
        hrefFor={(s) => sketchbookReviewHref(s.id, studentId, month)}
      />
    </Box>
  );
}
```

Replace `apps/nexus/src/app/(teacher)/teacher/sketchbook/[studentId]/[sketchId]/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';
import { sketchbookReviewHref } from '@/lib/review-context';

/**
 * The old one-sketch page. Every drawing now opens in the one review screen,
 * which carries the reactions, Feature and optional marking this page had.
 * Kept as a redirect because Teams feature cards and digests link here.
 */
export default function TeacherSketchRedirect({ params }: { params: { studentId: string; sketchId: string } }) {
  redirect(sketchbookReviewHref(params.sketchId, params.studentId));
}
```

In `RhythmRow.tsx` line 114 change the href to `sketchbookReviewHref(s.latestSketch.id, s.userId)` (import from `@/lib/review-context`) and its `aria-label` to `Open ${name}'s latest drawing, ${sketchDate(s.latestSketch.submittedAt)}`. In `SketchbookSection.tsx` line 27 change `hrefFor` to `(s) => sketchbookReviewHref(s.id, studentId)`.

In `FlipThrough.tsx`:
1. Import `Link from 'next/link'`, `Chip` from `@neram/ui`, `drawingSourceLabel` from `@/lib/drawing-source`, `flipReviewHref` from `@/lib/review-context`.
2. In the header, after the date caption, add `{current.source_type !== 'sketchbook' && <Chip size="small" label={drawingSourceLabel(current.source_type)} sx={{ ml: 1, height: 24 }} />}`.
3. Replace the bottom button row with:
```tsx
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Button variant="text" disabled={index === 0} onClick={() => setIndex(index - 1)} sx={{ minHeight: 48 }}>Previous</Button>
          <Button component={Link} href={flipReviewHref(current.id, classroomId)} variant="outlined" sx={{ minHeight: 48 }}>Open review</Button>
          <Button variant="contained" onClick={() => next()} sx={{ minHeight: 48, minWidth: 96 }}>Next</Button>
        </Box>
```
4. Update the component doc comment: add "Open review takes the card to the one review screen for stars, words and markup."

In `DrawingSubmissionSheet.tsx`: add `intro?: string;` to the props interface (document it: "A line under the title, e.g. why this sheet exists."), destructure it, and render directly after the title row's closing `</Box>`:
```tsx
        {intro && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {intro}
          </Typography>
        )}
```

Replace `apps/nexus/src/components/sketchbook/AddSketchSheet.tsx` with:

```tsx
'use client';

import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { addSketchBody, practiseBody } from './sketchbook-api';

interface AddSketchSheetProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  /** "Practise this" from an Inspiration drawing: pins it as the reference and links the sketch to it. */
  practise?: { itemId: string; imageUrl: string; title: string } | null;
}

/** The drawing module's sheet, in sketchbook clothes: one photo, one optional line, a thumbnail. */
export default function AddSketchSheet({ open, onClose, onAdded, practise = null }: AddSketchSheetProps) {
  const { getToken } = useNexusAuthContext();
  return (
    <DrawingSubmissionSheet
      open={open}
      onClose={onClose}
      sourceType="sketchbook"
      getToken={getToken}
      onSubmitted={onAdded}
      withThumbnail
      submitUrl="/api/sketchbook/entries"
      submitBody={practise ? practiseBody(practise.itemId) : addSketchBody}
      referenceImageUrl={practise?.imageUrl ?? null}
      title={practise ? 'Practise this drawing' : 'Add a sketch'}
      intro={
        practise
          ? `Draw your own version of "${practise.title}", then take a photo of it.`
          : 'Assignment drawings appear in your sketchbook on their own, so there is no need to add them here.'
      }
      noteLabel="One line about this sketch (optional)"
      notePlaceholder="What did you draw, or what did you try?"
      noteMaxLength={80}
      submitLabel="Add to sketchbook"
    />
  );
}
```

- [ ] **Step 9: Verify**

Run: `pnpm test:run apps/nexus/src/lib apps/nexus/src/components/sketchbook apps/nexus/src/components/drawings`
Expected: PASS.
Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json` and `pnpm --filter @neram/nexus lint`
Expected: 0 errors. `ThenAndNowCard` and `SketchbookHomeCard` read `SketchbookSketchRow` fields only; if tsc flags a fixture in their tests, add the new row fields to that fixture.

- [ ] **Step 10: Commit**

```bash
git add apps/nexus/src/lib/drawing-source.ts apps/nexus/src/lib/drawing-source.test.ts apps/nexus/src/lib/review-context.ts apps/nexus/src/lib/review-context.test.ts apps/nexus/src/components/drawings/ReviewStateBadge.tsx apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx apps/nexus/src/components/sketchbook "apps/nexus/src/app/(teacher)/teacher/sketchbook" "apps/nexus/src/app/(student)/student/sketchbook"
git commit -m "feat(nexus): every drawing in the sketchbook, each opening in the one review screen

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Practise this and Drawn from this

**Files:**
- Create: `apps/nexus/src/lib/inspiration-attempts.ts`
- Test: `apps/nexus/src/lib/inspiration-attempts.test.ts`
- Create: `apps/nexus/src/components/inspiration/InspirationAttempts.tsx`
- Test: `apps/nexus/src/components/inspiration/InspirationAttempts.test.tsx`
- Modify: `apps/nexus/src/app/api/inspiration/items/[id]/route.ts` (GET) and `route.test.ts`
- Modify: `apps/nexus/src/components/inspiration/InspirationItemView.tsx`

**Interfaces:**
- Consumes: Task 3 (`listInspirationAttempts`, `InspirationAttemptRow`), Task 2 (`ReviewSummary`, `reviewStateWords`), Task 9 (`ReviewStateBadge`, `tileBadgeSx`, `AddSketchSheet` `practise` prop), existing `formatInspirationCredit`, `examYearOf` (`@/lib/student-stage`), `inspirationBase(mode)` (`./inspiration-nav`).
- Produces:
  - `interface AttemptCard { key: string; submissionId: string | null; itemId: string | null; imageUrl: string; thumbnailUrl: string | null; credit: string; submittedAt: string; practisedFrom: boolean; review: ReviewSummary | null }`
  - `interface AttemptsView { students: number; shown: number; cards: AttemptCard[] }`
  - `presentAttempts(result: { students: number; shown: number; rows: InspirationAttemptRow[] }, staff: boolean): AttemptsView`
  - `attemptCountLine(students: number, shown: number, staff: boolean): string | null`
  - `GET /api/inspiration/items/[id]` response gains `attempts: AttemptsView`
  - `InspirationAttempts` default export `{ mode: InspirationMode; itemId: string; view: AttemptsView }`

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/lib/inspiration-attempts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { attemptCountLine, presentAttempts } from './inspiration-attempts';

const row = (over: Record<string, unknown> = {}) =>
  ({
    submission_id: 'sub1', original_item_id: 'item1', image_url: 'https://x/o.jpg', thumbnail_url: 'https://x/t.jpg',
    author_first_name: 'Priya', author_last_name: 'Sharma', author_name: 'Priya Sharma', author_is_alumni: false,
    author_academic_year: '2025-26', submitted_at: '2026-09-10T10:00:00Z', status: 'completed', tutor_rating: 5,
    tutor_marks: null, reviewed_at: '2026-09-11T10:00:00Z', practised_from: true, ...over,
  }) as any;

describe('presentAttempts', () => {
  it('gives staff the submission and its review', () => {
    const view = presentAttempts({ students: 3, shown: 1, rows: [row()] }, true);
    expect(view.cards[0]).toMatchObject({ key: 'sub1', submissionId: 'sub1', itemId: 'item1', practisedFrom: true, review: { state: 'reviewed', rating: 5, marks: null } });
    expect(view.cards[0].credit).toContain('Priya S.');
  });

  it('gives a student no submission id and no review', () => {
    const view = presentAttempts({ students: 3, shown: 1, rows: [row({ submission_id: null, status: null, tutor_rating: null, reviewed_at: null })] }, false);
    expect(view.cards[0].submissionId).toBeNull();
    expect(view.cards[0].review).toBeNull();
    expect(view.cards[0].key).toBe('item1');
  });

  it('reads an unreviewed assignment attempt as waiting for staff', () => {
    const view = presentAttempts({ students: 1, shown: 1, rows: [row({ status: 'submitted', reviewed_at: null, tutor_rating: null })] }, true);
    expect(view.cards[0].review).toEqual({ state: 'waiting', rating: null, marks: null });
  });
});

describe('attemptCountLine', () => {
  it('says how many drew it and how many a student can see', () => {
    expect(attemptCountLine(14, 5, false)).toBe('14 students drew this. 5 scored 4 stars and above.');
    expect(attemptCountLine(1, 0, false)).toBe('1 student drew this. None scored 4 stars and above yet.');
    expect(attemptCountLine(14, 14, true)).toBe('14 students drew this.');
    expect(attemptCountLine(0, 0, false)).toBeNull();
  });
});
```

Create `apps/nexus/src/components/inspiration/InspirationAttempts.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import InspirationAttempts from './InspirationAttempts';

const card = (over: Record<string, unknown> = {}) =>
  ({
    key: 'k1', submissionId: 'sub1', itemId: 'item1', imageUrl: 'https://x/o.jpg', thumbnailUrl: null,
    credit: 'Priya S. · 2026 batch', submittedAt: '2026-09-10T10:00:00Z', practisedFrom: false,
    review: { state: 'reviewed', rating: 5, marks: null }, ...over,
  }) as any;

describe('InspirationAttempts', () => {
  it('links staff to the review screen of each attempt', () => {
    render(<InspirationAttempts mode="staff" itemId="i0" view={{ students: 2, shown: 1, cards: [card()] }} />);
    expect(screen.getByText('Drawn from this')).toBeTruthy();
    expect(screen.getByText('2 students drew this.')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/teacher/drawing-reviews/sub1?from=inspiration&item=i0');
  });

  it('links a student to the Inspiration drawing of each attempt', () => {
    render(<InspirationAttempts mode="student" itemId="i0" view={{ students: 2, shown: 1, cards: [card({ submissionId: null, review: null })] }} />);
    expect(screen.getByText('2 students drew this. 1 scored 4 stars and above.')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/student/inspiration/item1');
  });

  it('renders nothing when nobody has drawn it', () => {
    const { container } = render(<InspirationAttempts mode="student" itemId="i0" view={{ students: 0, shown: 0, cards: [] }} />);
    expect(container.textContent).toBe('');
  });
});
```

In `apps/nexus/src/app/api/inspiration/items/[id]/route.test.ts`: add `listInspirationAttempts: vi.fn()` to the hoisted mocks, add `listInspirationAttempts: (...a: unknown[]) => mocks.listInspirationAttempts(...a),` to the `@neram/database/queries/nexus` mock, default it in `beforeEach` with `mocks.listInspirationAttempts.mockResolvedValue({ students: 0, shown: 0, rows: [] });`, and add:

```ts
  it('sends a student attempts without submission ids', async () => {
    mocks.resolveCaller.mockResolvedValue(student);
    mocks.listInspirationAttempts.mockResolvedValue({
      students: 4,
      shown: 1,
      rows: [{ submission_id: 'should-not-leak', original_item_id: 'o1', image_url: 'https://x/o.jpg', thumbnail_url: null, author_first_name: 'A', author_last_name: 'B', author_name: 'A B', author_is_alumni: false, author_academic_year: null, submitted_at: '2026-09-10T10:00:00Z', status: null, tutor_rating: null, tutor_marks: null, reviewed_at: null, practised_from: false }],
    });
    const res = await GET(get(), ctx);
    const body = await res.json();
    expect(mocks.listInspirationAttempts).toHaveBeenCalledWith(ID, 's1', false, 24);
    expect(body.attempts.students).toBe(4);
    expect(body.attempts.cards[0].submissionId).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-attempts.test.ts apps/nexus/src/components/inspiration "apps/nexus/src/app/api/inspiration/items/[id]/route.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Write `inspiration-attempts.ts`**

```ts
/**
 * "Drawn from this": the attempts under one Inspiration drawing, as each viewer
 * may see them. The database function already refuses what a student may not
 * see; this module also drops the submission id and the review for a student,
 * so neither can leak through a later change to the function.
 */
import type { InspirationAttemptRow } from '@neram/database/queries/nexus';
import type { ReviewSummary } from './drawing-source';
import { formatInspirationCredit } from './inspiration-credit';
import { examYearOf } from './student-stage';

export interface AttemptCard {
  key: string;
  submissionId: string | null;
  itemId: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  credit: string;
  submittedAt: string;
  practisedFrom: boolean;
  review: ReviewSummary | null;
}

export interface AttemptsView {
  students: number;
  shown: number;
  cards: AttemptCard[];
}

function staffReview(r: InspirationAttemptRow): ReviewSummary {
  if (r.status === 'redo') return { state: 'redo', rating: null, marks: null };
  if (r.reviewed_at) return { state: 'reviewed', rating: r.tutor_rating ?? null, marks: r.tutor_marks ?? null };
  const waiting = r.status === 'submitted' || r.status === 'under_review';
  return { state: waiting ? 'waiting' : 'none', rating: null, marks: null };
}

export function presentAttempts(
  result: { students: number; shown: number; rows: InspirationAttemptRow[] },
  staff: boolean,
): AttemptsView {
  return {
    students: result.students,
    shown: result.shown,
    cards: result.rows.map((r, i) => ({
      key: (staff ? r.submission_id : null) ?? r.original_item_id ?? `attempt-${i}`,
      submissionId: staff ? r.submission_id : null,
      itemId: r.original_item_id,
      imageUrl: r.image_url,
      thumbnailUrl: r.thumbnail_url,
      credit: formatInspirationCredit({
        kind: 'submission_original',
        firstName: r.author_first_name,
        lastName: r.author_last_name,
        fullName: r.author_name,
        isAlumni: r.author_is_alumni,
        examYear: examYearOf(r.author_academic_year),
        optedOut: false,
      }),
      submittedAt: r.submitted_at,
      practisedFrom: r.practised_from,
      review: staff ? staffReview(r) : null,
    })),
  };
}

export function attemptCountLine(students: number, shown: number, staff: boolean): string | null {
  if (students <= 0) return null;
  const drew = students === 1 ? '1 student drew this.' : `${students} students drew this.`;
  if (staff) return drew;
  return shown === 0 ? `${drew} None scored 4 stars and above yet.` : `${drew} ${shown} scored 4 stars and above.`;
}
```

- [ ] **Step 4: Write `InspirationAttempts.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { Box, Typography } from '@neram/ui';
import ReviewStateBadge, { tileBadgeSx } from '@/components/drawings/ReviewStateBadge';
import { reviewStateWords } from '@/lib/drawing-source';
import { attemptCountLine, type AttemptCard, type AttemptsView } from '@/lib/inspiration-attempts';
import { inspirationBase, type InspirationMode } from './inspiration-nav';

const tileSx = {
  position: 'relative',
  display: 'block',
  aspectRatio: '1',
  borderRadius: 1.5,
  overflow: 'hidden',
  bgcolor: 'action.hover',
  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

/** "Drawn from this": every attempt for staff, the ones rated 4 stars and above for students. */
export default function InspirationAttempts({ mode, itemId, view }: { mode: InspirationMode; itemId: string; view: AttemptsView }) {
  const staff = mode === 'staff';
  const line = attemptCountLine(view.students, view.shown, staff);
  if (!line && view.cards.length === 0) return null;

  const hrefFor = (c: AttemptCard): string | null => {
    if (staff && c.submissionId) return `/teacher/drawing-reviews/${c.submissionId}?from=inspiration&item=${itemId}`;
    return c.itemId ? `${inspirationBase(mode)}/${c.itemId}` : null;
  };
  const labelFor = (c: AttemptCard): string => {
    const parts = [c.credit];
    if (c.practisedFrom) parts.push('practised from this drawing');
    const words = c.review ? reviewStateWords(c.review, { maxMarks: null, viewer: 'teacher' }) : null;
    if (words) parts.push(words);
    return parts.join(', ');
  };

  return (
    <Box component="section" aria-labelledby="inspiration-drawn-from-this" sx={{ mt: 5 }}>
      <Typography id="inspiration-drawn-from-this" variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        Drawn from this
      </Typography>
      {line && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
          {line}
        </Typography>
      )}
      {view.cards.length > 0 && (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
          {view.cards.map((c) => {
            const href = hrefFor(c);
            const inner = (
              <>
                <Box component="img" src={c.thumbnailUrl || c.imageUrl} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {c.review && <ReviewStateBadge review={c.review} maxMarks={null} />}
                {c.practisedFrom && (
                  <Box aria-hidden sx={{ ...tileBadgeSx, left: 6, bottom: 6 }}>Practised</Box>
                )}
              </>
            );
            return (
              <Box component="li" key={c.key} sx={{ minWidth: 0 }}>
                {href ? (
                  <Box component={Link} href={href} aria-label={labelFor(c)} sx={tileSx}>{inner}</Box>
                ) : (
                  <Box role="img" aria-label={labelFor(c)} sx={tileSx}>{inner}</Box>
                )}
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.5 }}>
                  {c.credit}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Wire the items route and the detail view**

In `apps/nexus/src/app/api/inspiration/items/[id]/route.ts` GET:
1. Add `listInspirationAttempts` to the queries import and `import { presentAttempts } from '@/lib/inspiration-attempts';`.
2. Change the `Promise.all` to three entries:
```ts
    const [{ item, pair }, similar, attempts] = await Promise.all([
      getInspirationItem(id, caller.user.id, caller.staff ? 'all' : 'visible'),
      getSimilarInspiration(id, caller.user.id, 12),
      // Never fails the page: a missing attempts list is an empty section.
      listInspirationAttempts(id, caller.user.id, caller.staff, 24).catch(() => ({ students: 0, shown: 0, rows: [] })),
    ]);
```
3. Add `attempts: presentAttempts(attempts, caller.staff),` to the JSON body, and update the doc comment to `GET: one drawing, the other image of the same submission, attempts drawn from it, and more like it.`

In `apps/nexus/src/components/inspiration/InspirationItemView.tsx`:
1. Imports: `Snackbar` from `@neram/ui`; `BrushOutlinedIcon from '@mui/icons-material/BrushOutlined'`; `AddSketchSheet from '@/components/sketchbook/AddSketchSheet'`; `InspirationAttempts from './InspirationAttempts'`; `type { AttemptsView } from '@/lib/inspiration-attempts'`.
2. `ItemResponse` gains `attempts: AttemptsView;`.
3. State: `const [practising, setPractising] = useState(false);` and `const [added, setAdded] = useState(false);`.
4. Just before the Save button, for students only:
```tsx
                {mode === 'student' && (
                  <Button
                    variant="contained"
                    startIcon={<BrushOutlinedIcon />}
                    onClick={() => setPractising(true)}
                    sx={{ minHeight: 48, alignSelf: 'flex-start' }}
                  >
                    Practise this
                  </Button>
                )}
```
and change the Save button's variant to `item.saved ? 'contained' : 'outlined'` only for staff; for students use `variant="outlined"` always (one primary action per screen): `variant={mode === 'student' ? 'outlined' : item.saved ? 'contained' : 'outlined'}`.
5. Before the "More like this" section, add:
```tsx
        {data && <InspirationAttempts mode={mode} itemId={itemId} view={data.attempts} />}
```
6. After the `ImageViewerDialog`, add:
```tsx
      {mode === 'student' && item && (
        <AddSketchSheet
          open={practising}
          onClose={() => setPractising(false)}
          onAdded={() => {
            setPractising(false);
            setAdded(true);
            void mutate();
          }}
          practise={{ itemId: item.id, imageUrl: (reference ?? item).imageUrl, title: item.title }}
        />
      )}
      <Snackbar
        open={added}
        autoHideDuration={5000}
        onClose={() => setAdded(false)}
        message="Added to your Sketchbook"
        action={
          <Button component={Link} href="/student/sketchbook" color="inherit" sx={{ minHeight: 44 }}>
            Open
          </Button>
        }
      />
```

- [ ] **Step 6: Verify**

Run: `pnpm test:run apps/nexus/src/lib/inspiration-attempts.test.ts apps/nexus/src/components/inspiration "apps/nexus/src/app/api/inspiration"`
Expected: PASS.
Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/lib/inspiration-attempts.ts apps/nexus/src/lib/inspiration-attempts.test.ts apps/nexus/src/components/inspiration "apps/nexus/src/app/api/inspiration/items/[id]"
git commit -m "feat(nexus): practise an Inspiration drawing into the sketchbook, and see what was drawn from it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Retire the Drawing Reviews queue

**Files:**
- Modify: `apps/nexus/src/lib/nav-config.tsx` (lines 192, 203, 356) and `nav-config.test.ts`
- Modify: `apps/nexus/src/lib/feature-flags.ts` (line 161) and `feature-flags.test.ts`
- Create: `apps/nexus/src/lib/owed-drawings.ts` and `owed-drawings.test.ts`
- Modify: `apps/nexus/src/app/api/nav-badges/route.ts` (lines 47-84, 139-143), `apps/nexus/src/components/NavBadgeProvider.tsx` (line 29)
- Replace: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx`, `apps/nexus/src/app/(teacher)/teacher/evaluate/page.tsx`, `apps/nexus/src/app/(student)/student/drawings/page.tsx`
- Modify: `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/profile/page.tsx` (line 113)
- Create: `apps/nexus/src/hooks/useDraftSweep.ts` and `useDraftSweep.test.ts`
- Modify: `apps/nexus/src/app/(teacher)/teacher/sketchbook/page.tsx`, `apps/nexus/src/app/(teacher)/teacher/assignments/[id]/page.tsx`, `apps/nexus/src/app/api/drawing/evaluations/sweep/route.ts` (doc comment)

**Interfaces:**
- Consumes: `heldSubmissionIds(supabase, ids)` from `@/lib/drawing-hold`, `staffStudentIds` from `@/lib/sketchbook-access`.
- Produces:
  - `countOwedDrawings(supabase: any, studentIds: string[]): Promise<{ assignment: number; test: number }>`
  - nav badges `assignment_drawings` (on `/teacher/assignments`) and `test_drawings` (on `/teacher/exams`); `drawing_reviews` is gone
  - `SWEEP_EVERY_MS`, `shouldSweep(now: number, last: string | null): boolean`, `useDraftSweep(): void`

- [ ] **Step 1: Write the failing tests**

Append to `apps/nexus/src/lib/nav-config.test.ts`:

```ts
describe('nav-config: Drawing Reviews is retired', () => {
  it('gives teachers no Drawing Reviews item, and Assignments in its bottom-bar slot', () => {
    const teaching = PANELS.find((p) => p.id === 'teaching')!;
    expect(teaching.sidebarItems.map((i) => i.path)).not.toContain('/teacher/drawing-reviews');
    expect(teaching.bottomNavPaths).not.toContain('/teacher/drawing-reviews');
    expect(teaching.bottomNavPaths).toContain('/teacher/assignments');
  });

  it('gives students no Drawings item in either zone', () => {
    for (const zone of ZONES) {
      const all = zone.navGroups.flatMap((g) => g.items.map((i) => i.path));
      expect(all, `${zone.id} zone`).not.toContain('/student/drawings');
    }
  });
});
```

Append to `apps/nexus/src/lib/feature-flags.test.ts`:

```ts
describe('Drawing Reviews retired', () => {
  it('has no switch, so the one review screen can never be turned off', () => {
    expect(FEATURES.find((f) => f.id === 'staff.drawing-reviews')).toBeUndefined();
    expect(featureForPath('/teacher/drawing-reviews/abc')).toBeUndefined();
  });
});
```

Create `apps/nexus/src/lib/owed-drawings.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/drawing-hold', () => ({ heldSubmissionIds: async () => new Set(['held']) }));

import { countOwedDrawings } from './owed-drawings';

function fakeSupabase(rows: unknown[]) {
  const calls: Array<[string, unknown[]]> = [];
  const chain: any = new Proxy({}, {
    get: (_t, p: string) => (p === 'then' ? (res: (v: unknown) => void) => res({ data: rows, error: null }) : (...a: unknown[]) => { calls.push([p, a]); return chain; }),
  });
  return { client: { from: () => chain }, calls };
}

describe('countOwedDrawings', () => {
  it('counts waiting assignment and test drawings, never practice, never held reviews', async () => {
    const { client, calls } = fakeSupabase([
      { id: 'a', source_type: 'assignment', assignment_id: 'as1' },
      { id: 'held', source_type: 'assignment', assignment_id: 'as1' },
      { id: 't', source_type: 'exam', assignment_id: null },
      { id: 'q', source_type: 'question_bank', assignment_id: null },
    ]);
    expect(await countOwedDrawings(client, ['s1'])).toEqual({ assignment: 1, test: 1 });
    expect(calls).toContainEqual(['eq', ['status', 'submitted']]);
  });

  it('answers zero for a teacher with no students', async () => {
    const { client } = fakeSupabase([]);
    expect(await countOwedDrawings(client, [])).toEqual({ assignment: 0, test: 0 });
  });
});
```

Create `apps/nexus/src/hooks/useDraftSweep.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => null, tokenReady: false }) }));

import { SWEEP_EVERY_MS, shouldSweep } from './useDraftSweep';

describe('shouldSweep', () => {
  it('sweeps when it never has, or when the last one was long enough ago', () => {
    expect(shouldSweep(1_000_000, null)).toBe(true);
    expect(shouldSweep(1_000_000, 'garbage')).toBe(true);
    expect(shouldSweep(1_000_000 + SWEEP_EVERY_MS, '1000000')).toBe(true);
  });
  it('waits when the last sweep was recent', () => {
    expect(shouldSweep(1_000_000 + 5_000, '1000000')).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/nav-config.test.ts apps/nexus/src/lib/feature-flags.test.ts apps/nexus/src/lib/owed-drawings.test.ts apps/nexus/src/hooks/useDraftSweep.test.ts`
Expected: FAIL.

- [ ] **Step 3: Nav and flags**

In `nav-config.tsx`: delete the `Drawing Reviews` sidebar item (line 192); in the teaching panel's `bottomNavPaths` replace `'/teacher/drawing-reviews'` with `'/teacher/assignments'`; delete the student `{ label: 'Drawings', path: '/student/drawings', ... }` item (line 356). If `BrushOutlinedIcon` is now unused, remove its import.

In `feature-flags.ts`: delete the `staff.drawing-reviews` line (161). The review screen at `/teacher/drawing-reviews/[id]` is ungated from now on.

- [ ] **Step 4: Owed drawings badge**

Create `apps/nexus/src/lib/owed-drawings.ts`:

```ts
/**
 * Drawing work a teacher owes, for the nav badges.
 *
 * Assignment drawings count on Assignments, test drawings on Exams. Practice
 * (sketches, question bank, free practice) is optional to mark and never
 * counts: a badge a teacher is not obliged to clear is noise. A held review
 * keeps status 'submitted' so the student sees nothing, and it is finished
 * work, so it comes off too.
 */
import { heldSubmissionIds } from '@/lib/drawing-hold';

export async function countOwedDrawings(
  supabase: any,
  studentIds: string[],
): Promise<{ assignment: number; test: number }> {
  if (studentIds.length === 0) return { assignment: 0, test: 0 };
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select('id, source_type, assignment_id')
    .eq('status', 'submitted')
    .in('student_id', studentIds);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; source_type: string | null; assignment_id: string | null }>;
  const owed = rows.filter((r) => r.source_type === 'exam' || !!r.assignment_id);
  const held = owed.length ? await heldSubmissionIds(supabase, owed.map((r) => r.id)) : new Set<string>();
  let assignment = 0;
  let test = 0;
  for (const r of owed) {
    if (held.has(r.id)) continue;
    if (r.source_type === 'exam') test += 1;
    else assignment += 1;
  }
  return { assignment, test };
}
```

In `apps/nexus/src/app/api/nav-badges/route.ts`:
1. Import `countOwedDrawings` from `@/lib/owed-drawings`; remove the now-unused `heldSubmissionIds` import.
2. Rename `drawings` to `owed` in the destructured `Promise.all` result, and replace the whole drawings IIFE (the comment "Drawings waiting on THIS teacher" through its closing `})(),`) with:
```ts
        // Owed drawing work in the classrooms this teacher teaches: assignment
        // drawings (Assignments badge) and test drawings (Exams badge). Practice
        // never counts; see lib/owed-drawings.
        (async () => {
          try {
            const caller = await getRequestUser(request.headers.get('Authorization'));
            const students = await staffStudentIds(caller, null);
            return await countOwedDrawings(supabase, students);
          } catch {
            return { assignment: 0, test: 0 };
          }
        })(),
```
3. Replace `badges.drawing_reviews = typeof drawings === 'number' ? drawings : 0;` with:
```ts
      badges.assignment_drawings = owed.assignment;
      badges.test_drawings = owed.test;
```

In `NavBadgeProvider.tsx`, replace `'/teacher/drawing-reviews': 'drawing_reviews',` with:
```ts
  '/teacher/assignments': 'assignment_drawings',
  '/teacher/exams': 'test_drawings',
```

- [ ] **Step 5: Redirects and Back**

Replace `apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

/**
 * The Drawing Reviews queue, retired in September 2026.
 *
 * Every drawing now lives in a student's Sketchbook on its date and opens in the
 * one review screen at /teacher/drawing-reviews/[id], which stays. Owed work has
 * its own homes: assignment drawings on the assignment, test drawings on the
 * exam results sheet. Kept as a redirect because the queue was in the nav and
 * may be bookmarked.
 */
export default function DrawingReviewsRedirect() {
  redirect('/teacher/sketchbook');
}
```

In `apps/nexus/src/app/(teacher)/teacher/evaluate/page.tsx` change the redirect target to `'/teacher/sketchbook'` and add one sentence to its comment: "Drawing Reviews was retired in turn (September 2026), so this goes to Sketchbooks."

Replace `apps/nexus/src/app/(student)/student/drawings/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

/**
 * The student Drawings hub, replaced by Inspiration (September 2026). Its
 * question and submission pages under /student/drawings/ stay, because
 * notifications and older links point at them.
 */
export default function StudentDrawingsRedirect() {
  redirect('/student/inspiration');
}
```

In `drawing-reviews/profile/page.tsx` line 113 change `href="/teacher/drawing-reviews"` to `href="/teacher/sketchbook"`.

- [ ] **Step 6: The draft sweep moves**

Create `apps/nexus/src/hooks/useDraftSweep.ts`:

```ts
'use client';

/**
 * Draft whatever is still waiting without an AI draft, at most once every ten
 * minutes per browser tab.
 *
 * The Drawing Reviews queue used to fire this each time it opened. With the
 * queue retired, the Sketchbooks page and an assignment's page call it instead.
 * Fired and forgotten: a failure only leaves those sheets for the next sweep or
 * a hand review.
 */

import { useEffect } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const KEY = 'nexus:drawing-sweep-at';
export const SWEEP_EVERY_MS = 10 * 60 * 1000;

export function shouldSweep(now: number, last: string | null): boolean {
  const at = last == null ? NaN : Number(last);
  return !Number.isFinite(at) || now - at >= SWEEP_EVERY_MS;
}

export function useDraftSweep(): void {
  const { getToken, tokenReady } = useNexusAuthContext();
  useEffect(() => {
    if (!tokenReady) return;
    let last: string | null = null;
    try { last = sessionStorage.getItem(KEY); } catch { /* storage blocked */ }
    if (!shouldSweep(Date.now(), last)) return;
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await fetch('/api/drawing/evaluations/sweep', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {
        // Ignored on purpose, see above.
      }
    })();
  }, [tokenReady, getToken]);
}
```

Call `useDraftSweep();` as the first line inside `TeacherSketchbookPage` (`apps/nexus/src/app/(teacher)/teacher/sketchbook/page.tsx`) and inside the default export of `apps/nexus/src/app/(teacher)/teacher/assignments/[id]/page.tsx` (both are client components), importing it from `@/hooks/useDraftSweep`. In `sweep/route.ts`, replace the sentence "The Drawing Reviews queue calls it once when it opens." with "The Sketchbooks page and an assignment's page call it (hooks/useDraftSweep)." and "the next teacher who opens the queue clears a few more" with "the next teacher who opens either page clears a few more".

- [ ] **Step 7: Verify**

Run: `pnpm test:run apps/nexus/src/lib apps/nexus/src/hooks`
Expected: PASS.
Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json` and `pnpm --filter @neram/nexus lint`
Expected: 0 errors. Search `apps/nexus/src` for `'/teacher/drawing-reviews'` used as a destination (not as a prefix of `/teacher/drawing-reviews/${...}`): only `TopBar.tsx:88`, `PanelProvider.tsx:49` and `full-bleed-routes.ts` may remain, all prefix checks for the review screen.

- [ ] **Step 8: Commit**

```bash
git add apps/nexus/src/lib/nav-config.tsx apps/nexus/src/lib/nav-config.test.ts apps/nexus/src/lib/feature-flags.ts apps/nexus/src/lib/feature-flags.test.ts apps/nexus/src/lib/owed-drawings.ts apps/nexus/src/lib/owed-drawings.test.ts apps/nexus/src/app/api/nav-badges/route.ts apps/nexus/src/components/NavBadgeProvider.tsx "apps/nexus/src/app/(teacher)/teacher/drawing-reviews/page.tsx" "apps/nexus/src/app/(teacher)/teacher/drawing-reviews/profile/page.tsx" "apps/nexus/src/app/(teacher)/teacher/evaluate/page.tsx" "apps/nexus/src/app/(student)/student/drawings/page.tsx" apps/nexus/src/hooks/useDraftSweep.ts apps/nexus/src/hooks/useDraftSweep.test.ts "apps/nexus/src/app/(teacher)/teacher/sketchbook/page.tsx" "apps/nexus/src/app/(teacher)/teacher/assignments/[id]/page.tsx" apps/nexus/src/app/api/drawing/evaluations/sweep/route.ts
git commit -m "feat(nexus): retire the Drawing Reviews queue; owed drawings badge Assignments and Exams

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Test drawings get a home on the exam results sheet

**Files:**
- Create: `apps/nexus/src/app/api/exams/[examId]/drawings/route.ts` and `route.test.ts`
- Create: `apps/nexus/src/components/scheduled-exams/ExamDrawingsToMark.tsx` and `ExamDrawingsToMark.test.tsx`
- Modify: `apps/nexus/src/components/scheduled-exams/ExamResultsSheet.tsx` (props; first child of `DialogContent` at line 352)
- Modify: `apps/nexus/src/app/(teacher)/teacher/timetable/[classId]/exam/page.tsx` (sheet props at line 297; `?results=1`)

**Interfaces:**
- Consumes: `listExamDrawings(examId)` from `@neram/database/queries/nexus`, `requireExamStaff(authHeader, examId)` from `@/lib/exam-access`, `StudentAvatar` (`userId`, `src`, `name`, `size`), `useAuthSWR`, `readSearch`/`patchQuery`.
- Produces:
  - `GET /api/exams/[examId]/drawings` → `{ drawings: Array<{ submission_id: string; student_id: string; student_name: string; avatar_url: string | null; question_id: string; image_url: string; awarded: number | null; max_marks: number; status: string | null }> }`, unmarked first then by name
  - `examDrawingHref(submissionId: string, examId: string, classId: string | null): string`
  - `ExamDrawingsToMark` default export `{ examId: string; classId: string | null; open: boolean }`
  - `ExamResultsSheet` prop `classId?: string | null`

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/app/api/exams/[examId]/drawings/route.test.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), people: [] as unknown[] }));

vi.mock('@/lib/exam-access', () => ({ requireExamStaff: (...a: unknown[]) => m.access(...a) }));
vi.mock('@neram/database/queries/nexus', () => ({ listExamDrawings: (...a: unknown[]) => m.list(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: m.people, error: null }) }) }) }),
}));

import { GET } from './route';

const req = () => new NextRequest('http://localhost/api/exams/e1/drawings', { headers: { Authorization: 'Bearer t' } });
const ctx = { params: { examId: 'e1' } };

describe('GET /api/exams/[examId]/drawings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses anyone the exam access check refuses', async () => {
    m.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Staff only' }, { status: 403 }) });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(403);
    expect(m.list).not.toHaveBeenCalled();
  });

  it('lists unmarked drawings first, each with its student', async () => {
    m.access.mockResolvedValue({ ok: true, caller: {}, exam: { id: 'e1' } });
    m.list.mockResolvedValue([
      { submission_id: 'd1', student_id: 's1', question_id: 'q', image_url: 'https://x/1.jpg', awarded: 8, max_marks: 10, status: 'completed' },
      { submission_id: 'd2', student_id: 's2', question_id: 'q', image_url: 'https://x/2.jpg', awarded: null, max_marks: 10, status: 'submitted' },
    ]);
    m.people = [{ id: 's1', name: 'Asha', avatar_url: null }, { id: 's2', name: 'Bala', avatar_url: null }];
    const res = await GET(req(), ctx);
    const body = await res.json();
    expect(body.drawings.map((d: { submission_id: string }) => d.submission_id)).toEqual(['d2', 'd1']);
    expect(body.drawings[0].student_name).toBe('Bala');
  });
});
```

Create `apps/nexus/src/components/scheduled-exams/ExamDrawingsToMark.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const swr = vi.fn();
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('@/components/students/StudentAvatar', () => ({ default: ({ name }: { name?: string }) => <span aria-label={`Avatar for ${name}`} /> }));

import ExamDrawingsToMark, { examDrawingHref } from './ExamDrawingsToMark';

const row = (id: string, awarded: number | null) => ({
  submission_id: id, student_id: `s-${id}`, student_name: `Student ${id}`, avatar_url: null, question_id: 'q',
  image_url: `https://x/${id}.jpg`, awarded, max_marks: 10, status: awarded == null ? 'submitted' : 'completed',
});

describe('ExamDrawingsToMark', () => {
  it('counts what is left and links each drawing to the review screen', () => {
    swr.mockReturnValue({ data: { drawings: [row('a', null), row('b', 7)] }, isLoading: false });
    render(<ExamDrawingsToMark examId="e1" classId="c1" open />);
    expect(screen.getByText('Drawings to mark (1)')).toBeTruthy();
    expect(screen.getByText('Not marked')).toBeTruthy();
    expect(screen.getByText('7 of 10')).toBeTruthy();
    expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe(examDrawingHref('a', 'e1', 'c1'));
  });

  it('renders nothing for an exam with no drawings', () => {
    swr.mockReturnValue({ data: { drawings: [] }, isLoading: false });
    const { container } = render(<ExamDrawingsToMark examId="e1" classId={null} open />);
    expect(container.textContent).toBe('');
  });

  it('does not fetch while the sheet is closed', () => {
    swr.mockReturnValue({ data: undefined, isLoading: false });
    render(<ExamDrawingsToMark examId="e1" classId={null} open={false} />);
    expect(swr).toHaveBeenLastCalledWith(null);
  });
});

describe('examDrawingHref', () => {
  it('opens the review screen from the exam, with the class for Back', () => {
    expect(examDrawingHref('d1', 'e1', 'c1')).toBe('/teacher/drawing-reviews/d1?from=exam&exam=e1&class=c1');
    expect(examDrawingHref('d1', 'e1', null)).toBe('/teacher/drawing-reviews/d1?from=exam&exam=e1');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test:run "apps/nexus/src/app/api/exams/[examId]/drawings/route.test.ts" apps/nexus/src/components/scheduled-exams/ExamDrawingsToMark.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the route**

Create `apps/nexus/src/app/api/exams/[examId]/drawings/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { listExamDrawings } from '@neram/database/queries/nexus';
import { requireExamStaff } from '@/lib/exam-access';

/**
 * GET /api/exams/[examId]/drawings   (staff)
 *
 * Every drawing on this exam, unmarked first, with the student's name, so the
 * results sheet can list what is left to mark and link each one to the review
 * screen. Test drawings used to be reachable only from the Drawing Reviews
 * queue, which is retired.
 */
export async function GET(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const rows = await listExamDrawings(params.examId);
    const ids = [...new Set(rows.map((r) => r.student_id))];
    const { data: people } = ids.length
      ? await (getSupabaseAdminClient() as any).from('users').select('id, name, avatar_url').in('id', ids)
      : { data: [] };
    const byId = new Map(
      ((people ?? []) as Array<{ id: string; name: string | null; avatar_url: string | null }>).map((p) => [p.id, p]),
    );

    const drawings = rows
      .map((r) => ({
        ...r,
        student_name: byId.get(r.student_id)?.name || 'Student',
        avatar_url: byId.get(r.student_id)?.avatar_url ?? null,
      }))
      .sort((a, b) => Number(a.awarded != null) - Number(b.awarded != null) || a.student_name.localeCompare(b.student_name));

    return NextResponse.json({ drawings }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the drawings';
    console.error('[Exam drawings] GET failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Write the list component**

Create `apps/nexus/src/components/scheduled-exams/ExamDrawingsToMark.tsx`:

```tsx
'use client';

/**
 * Drawings to mark, on the exam results sheet.
 *
 * An exam's drawings are marked by a teacher before its results can be final.
 * Each row opens the one review screen with a marks box out of the marks this
 * test gives the question, and Back returns to this exam.
 */

import Link from 'next/link';
import { Box, Paper, Skeleton, Typography } from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import StudentAvatar from '@/components/students/StudentAvatar';
import { useAuthSWR } from '@/lib/nexus-swr';

interface ExamDrawingRow {
  submission_id: string;
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  image_url: string;
  awarded: number | null;
  max_marks: number;
  status: string | null;
}

export function examDrawingHref(submissionId: string, examId: string, classId: string | null): string {
  const qs = new URLSearchParams({ from: 'exam', exam: examId });
  if (classId) qs.set('class', classId);
  return `/teacher/drawing-reviews/${submissionId}?${qs.toString()}`;
}

export default function ExamDrawingsToMark({ examId, classId, open }: { examId: string; classId: string | null; open: boolean }) {
  const { data, isLoading } = useAuthSWR<{ drawings: ExamDrawingRow[] }>(open ? `/api/exams/${examId}/drawings` : null);
  if (isLoading) return <Skeleton variant="rounded" height={72} sx={{ borderRadius: 2, mb: 2 }} />;
  const rows = data?.drawings ?? [];
  if (rows.length === 0) return null;
  const unmarked = rows.filter((r) => r.awarded == null).length;

  return (
    <Paper variant="outlined" component="section" aria-labelledby="exam-drawings-to-mark" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
      <Typography id="exam-drawings-to-mark" variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
        {unmarked > 0 ? `Drawings to mark (${unmarked})` : 'Drawings, all marked'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {unmarked > 0
          ? 'Results stay Provisional until every drawing has marks.'
          : 'Every drawing has marks, so these results can be final.'}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {rows.map((r) => (
          <Box component="li" key={r.submission_id}>
            <Box
              component={Link}
              href={examDrawingHref(r.submission_id, examId, classId)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 56, px: 1, borderRadius: 1.5,
                color: 'text.primary', textDecoration: 'none',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Box component="img" src={r.image_url} alt="" loading="lazy" sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} />
              <StudentAvatar userId={r.student_id} src={r.avatar_url} name={r.student_name} size={32} />
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{r.student_name}</Typography>
              {r.awarded == null ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', flexShrink: 0 }}>
                  <EditOutlinedIcon fontSize="small" aria-hidden />
                  <Typography variant="body2">Not marked</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <CheckCircleRoundedIcon fontSize="small" color="success" aria-hidden />
                  <Typography variant="body2">{r.awarded} of {r.max_marks}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
```

- [ ] **Step 5: Wire the sheet and the exam page**

In `ExamResultsSheet.tsx`: add `classId = null` to the destructured props with type `classId?: string | null;`, import `ExamDrawingsToMark from './ExamDrawingsToMark'`, and render `<ExamDrawingsToMark examId={examId} classId={classId} open={open} />` as the first child of `<DialogContent dividers>`. Add one line to the component doc comment: "Drawings to mark sits at the top: a results screen is where a teacher finds out a drawing is still unmarked."

In `apps/nexus/src/app/(teacher)/teacher/timetable/[classId]/exam/page.tsx`:
1. Import `readSearch` and `patchQuery` from `@/lib/list-url-state`.
2. Pass `classId={String(params.classId)}` to `<ExamResultsSheet ... />`.
3. After the `publishOpen` state, add:
```ts
  // Back from marking a drawing lands here with ?results=1, which reopens the
  // results sheet the teacher left. The flag is removed so a refresh does not.
  useEffect(() => {
    if (new URLSearchParams(readSearch()).get('results') === '1') {
      setPublishOpen(true);
      patchQuery({ results: null });
    }
  }, []);
```

- [ ] **Step 6: Verify**

Run: `pnpm test:run "apps/nexus/src/app/api/exams" apps/nexus/src/components/scheduled-exams`
Expected: PASS (new and existing, including `ExamResultsSheet.test.tsx`; if it now calls `useAuthSWR` without a mock, add `vi.mock('./ExamDrawingsToMark', () => ({ default: () => null }))` to that test).
Run: `npx tsc --noEmit -p apps/nexus/tsconfig.json`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/nexus/src/app/api/exams/[examId]/drawings" apps/nexus/src/components/scheduled-exams "apps/nexus/src/app/(teacher)/teacher/timetable/[classId]/exam/page.tsx"
git commit -m "feat(nexus): drawings to mark on the exam results sheet, marked out of the question's marks

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: End to end on a phone, and the retired queue's old specs

**Files:**
- Create: `tests/e2e/sketchbook-hub-nexus-mobile.spec.ts`
- Modify: `tests/e2e/gallery-feed-nexus.spec.ts` (lines 353-470), `tests/e2e/alumni-gallery-nexus.spec.ts` (line 59), `tests/e2e/drawing-reviews-redesign-nexus.spec.ts` (line 74), `tests/e2e/assignment-back-nav-nexus.spec.ts` (lines 92-104), `tests/e2e/drawing-module-nexus.spec.ts` (lines 270-363)

**Interfaces:**
- Consumes: everything above; `APP_URLS`, `STUDENT_ACCOUNT`, `TEACHER_ACCOUNT`, `injectAuthForPage` from `tests/utils/credentials`; `assertNoHorizontalOverflow` from `tests/utils/mobile-helpers`; the upload + entries flow shown in `tests/e2e/sketchbook-nexus-mobile.spec.ts`.
- Needs the Task 1 migrations on the database the Nexus dev server points at (staging). The controller applies them before this task.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/sketchbook-hub-nexus-mobile.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Sketchbook as the one home for a student's drawings, and the one review screen.
 *
 * API half (serial): a student adds a sketch; the teacher sees it in the
 * student's month as practice nobody reviewed, and in the flip inbox; the
 * teacher reviews it with 4 stars and the student is told; the student's month
 * now shows the review; the inbox no longer holds it; a redo on a sketch is
 * refused; the student cannot delete a reviewed sketch. Cleanup deletes it.
 *
 * Phone half: a teacher opens a tile in a student's sketchbook and lands on the
 * review screen in practice mode (Next and Send review, no Redo), Back returns
 * to that sketchbook, nothing scrolls sideways; the retired queue redirects.
 */

const NEXUS = APP_URLS.nexus;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const month = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);

async function tokens(request: import('@playwright/test').APIRequestContext) {
  const s = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: STUDENT_ACCOUNT.email, role: 'student' } });
  const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
  if (s.status() !== 200 || t.status() !== 200) return null;
  return { student: (await s.json()).testToken as string, teacher: (await t.json()).testToken as string };
}

async function addSketch(request: import('@playwright/test').APIRequestContext, studentToken: string) {
  const up = await request.post(`${NEXUS}/api/drawing/upload`, {
    headers: { Authorization: `Bearer ${studentToken}` },
    multipart: { bucket: 'drawing-uploads', file: { name: 'e2e-hub.png', mimeType: 'image/png', buffer: PNG } },
  });
  expect(up.status()).toBe(200);
  const { url } = await up.json();
  const res = await request.post(`${NEXUS}/api/sketchbook/entries`, {
    headers: { Authorization: `Bearer ${studentToken}` },
    data: { original_image_url: url, caption: 'E2E hub sketch' },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).sketch as { id: string; student_id: string };
}

test.describe('Sketchbook hub API', () => {
  test.describe.configure({ mode: 'serial' });
  let tk: { student: string; teacher: string } | null = null;
  let sketch: { id: string; student_id: string } | null = null;

  test('setup', async ({ request }) => {
    tk = await tokens(request);
    test.skip(!tk, 'Nexus dev server or test-login not available');
    sketch = await addSketch(request, tk!.student);
  });

  test('teacher sees the sketch as unreviewed practice in the month and the inbox', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const monthRes = await request.get(`${NEXUS}/api/sketchbook/students/${sketch!.student_id}?month=${month()}`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    expect(monthRes.status()).toBe(200);
    const entry = (await monthRes.json()).sketches.find((s: { id: string }) => s.id === sketch!.id);
    expect(entry.kind).toBe('practice');
    expect(entry.review.state).toBe('none');
  });

  test('teacher reviews it and the student is told', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const res = await request.patch(`${NEXUS}/api/drawing/submissions/${sketch!.id}/review`, {
      headers: { Authorization: `Bearer ${tk!.teacher}` },
      data: { tutor_rating: 4, tutor_feedback: 'Confident lines. Try a lighter first pass.', action: 'complete', is_gallery_visible: false },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(true);
    expect(body.next_submission_id).toBeNull();
  });

  test('the student month shows the review, and the inbox no longer holds it', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const me = await request.get(`${NEXUS}/api/sketchbook/me?month=${month()}`, { headers: { Authorization: `Bearer ${tk!.student}` } });
    const entry = (await me.json()).sketches.find((s: { id: string }) => s.id === sketch!.id);
    expect(entry.review).toEqual({ state: 'reviewed', rating: 4, marks: null });
    const inbox = await request.get(`${NEXUS}/api/sketchbook/inbox`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    if (inbox.status() === 200) {
      expect((await inbox.json()).sketches.map((s: { id: string }) => s.id)).not.toContain(sketch!.id);
    }
  });

  test('a sketch has no redo, and a reviewed sketch stays', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const redo = await request.patch(`${NEXUS}/api/drawing/submissions/${sketch!.id}/review`, {
      headers: { Authorization: `Bearer ${tk!.teacher}` },
      data: { action: 'redo' },
    });
    expect(redo.status()).toBe(400);
    const del = await request.delete(`${NEXUS}/api/sketchbook/entries/${sketch!.id}`, { headers: { Authorization: `Bearer ${tk!.student}` } });
    expect(del.status()).toBe(409);
  });

  test('cleanup', async ({ request }) => {
    test.skip(!sketch, 'no sketch');
    const res = await request.delete(`${NEXUS}/api/drawing/submissions/${sketch!.id}`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    expect(res.status()).toBe(200);
  });
});

test.describe('Sketchbook hub on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('a sketchbook tile opens the review screen in practice mode, and Back returns', async ({ page, request }) => {
    test.setTimeout(90_000);
    const tk = await tokens(request);
    test.skip(!tk, 'Nexus dev server or test-login not available');
    const sketch = await addSketch(request, tk!.student);
    try {
      await injectAuthForPage(page, 'teacher');
      await page.goto(`${NEXUS}/teacher/sketchbook/${sketch.student_id}?month=${month()}`);
      const tile = page.locator(`a[href*="/teacher/drawing-reviews/${sketch.id}"]`);
      await expect(tile).toBeVisible({ timeout: 60_000 });
      await tile.click();
      await expect(page).toHaveURL(new RegExp(`/teacher/drawing-reviews/${sketch.id}\\?from=sketchbook`), { timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Send review' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Redo' })).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
      await page.getByRole('link', { name: 'Sketchbooks' }).first().waitFor();
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/teacher/sketchbook/${sketch.student_id}`), { timeout: 30_000 });
    } finally {
      await request.delete(`${NEXUS}/api/drawing/submissions/${sketch.id}`, { headers: { Authorization: `Bearer ${tk!.teacher}` } });
    }
  });

  test('the retired Drawing Reviews queue sends teachers to Sketchbooks', async ({ page }) => {
    test.setTimeout(90_000);
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${NEXUS}/teacher/drawing-reviews`);
    await expect(page).toHaveURL(/\/teacher\/sketchbook/, { timeout: 60_000 });
  });
});
```

- [ ] **Step 2: Update the retired queue's specs**

Read each range first, then:
- `tests/e2e/gallery-feed-nexus.spec.ts` lines 353-470: the teacher "Gallery tab" cases open `/teacher/drawing-reviews` and click a Gallery tab that no longer exists. Delete those cases (keep every student-side case), and leave a one-line comment where they were: `// The teacher Gallery tab left with the Drawing Reviews queue (retired September 2026). Inspiration replaces it.`
- `tests/e2e/alumni-gallery-nexus.spec.ts` line 59: if the case navigates to `/teacher/drawing-reviews` to reach the gallery, change it to `/teacher/inspiration` and assert the Inspiration page heading instead; if it only asserts the queue, delete the case with the same one-line comment.
- `tests/e2e/drawing-reviews-redesign-nexus.spec.ts` line 74: the case checks the classroom chip is hidden on the queue page. Point it at a review screen URL instead (`/teacher/drawing-reviews/<seeded id>` as the file already seeds elsewhere), or delete it if the file has no seeded id, with the same comment.
- `tests/e2e/assignment-back-nav-nexus.spec.ts` lines 92-104: the queue page is only used to seed browser history. Seed history with `/teacher/sketchbook` instead; the assertion about returning to the assignment stays.
- `tests/e2e/drawing-module-nexus.spec.ts` lines 270-363: replace the `drawing_reviews` badge key with `assignment_drawings`, and change any expectation that the review-queue API powers a page into an API-only check (the `review-queue` API route still exists).

- [ ] **Step 3: Run the new spec and the touched specs**

Run (Nexus dev server on 3012 pointed at staging, migrations applied): `pnpm test:e2e tests/e2e/sketchbook-hub-nexus-mobile.spec.ts tests/e2e/gallery-feed-nexus.spec.ts tests/e2e/alumni-gallery-nexus.spec.ts tests/e2e/drawing-reviews-redesign-nexus.spec.ts tests/e2e/assignment-back-nav-nexus.spec.ts tests/e2e/drawing-module-nexus.spec.ts --project=nexus-chrome --no-deps`
Expected: the new spec passes (no skips except with a named reason); the edited specs pass or skip with their existing named reasons. Report the exact pass/skip/fail counts.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/sketchbook-hub-nexus-mobile.spec.ts tests/e2e/gallery-feed-nexus.spec.ts tests/e2e/alumni-gallery-nexus.spec.ts tests/e2e/drawing-reviews-redesign-nexus.spec.ts tests/e2e/assignment-back-nav-nexus.spec.ts tests/e2e/drawing-module-nexus.spec.ts
git commit -m "test(nexus): sketchbook hub on a phone, and the retired queue's specs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## After the tasks (controller)

1. Full `pnpm test:run`, `npx tsc --noEmit -p apps/nexus/tsconfig.json`, `pnpm --filter @neram/nexus lint`.
2. ui-ux-pro-max review of the built screens at 375px and 1280px: a student's Sketchbook (mixed sources, a released review, a waiting assignment), the student drawing page, a teacher's student sketchbook, the review screen in practice mode and assignment mode, the flip-through card, an Inspiration detail page as a student (Practise this, Drawn from this) and as staff, and the exam results sheet with drawings to mark.
3. Final whole-branch review.

## Production deploy notes (not part of any task; only when the founder says deploy)

- Apply `20260921090000_nexus_sketchbook_hub.sql` then `20260921090100_notification_event_type_practice_reviewed.sql` to prod BEFORE the Nexus deploy (both additive), and restamp `schema_migrations` to the filename versions.
- The prod `feature_flags` row holds `staff.drawing-reviews: true`; it becomes an unknown id and is ignored. Nothing to change.
- `student.sketchbook` is ON in prod, so students see every drawing in their Sketchbook the moment Nexus deploys. Existing duplicates (a sketch uploaded beside the same assignment drawing, 3 in prod on 2026-09-17) will show twice; they are the students' own uploads and are left as they are.
- The deploy touches `packages/database`, so use the Nexus-only path: a `[skip ci]` merge commit, push, then `gh workflow run deploy.yml --ref main -f environment=production -f apps=nexus`.
