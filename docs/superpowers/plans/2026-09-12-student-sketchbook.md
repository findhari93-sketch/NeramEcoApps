# Student Sketchbook (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Nexus student a personal Sketchbook (upload any drawing, see a weekly practice rhythm), and give teachers a flip-through inbox with one-tap reactions and a "Feature to class" action that posts the sketch to the classroom's Teams group and channel.

**Architecture:** A sketch is a `drawing_submissions` row with `source_type = 'sketchbook'` and `status = 'completed'`, so reactions, comments, gallery visibility and the AI evaluator come free. Four small tables carry what is new: practice days (materialised per student per IST date), flips (teacher "seen"), features (per classroom, reversible, holding Teams message ids) and goal history (so raising the weekly goal never erases a past run). A pure rhythm engine turns practice dates plus goal history into this week's dots, the run and the best run. Every student message goes through `sendNudge`; the Teams card is posted with the teacher's delegated token using the primitives in `teams-class-announcements.ts`.

**Tech Stack:** Next.js 14 App Router, MUI via `@neram/ui`, SWR via `useAuthSWR`, Supabase (service role in routes), Microsoft Graph (delegated), Vitest (colocated), Playwright (`nexus-mobile` project).

**Spec:** `docs/superpowers/specs/2026-09-11-student-sketchbook-design.md`

## Global Constraints

- Never use em dashes, double dashes or `&mdash;` in any user-visible string. Commas, colons, periods, parentheses only.
- Mobile first: 375px layout first. Touch targets 48px with 8px gaps. Visible focus rings. Text contrast 4.5:1. `prefers-reduced-motion` respected. SVG icons from `@mui/icons-material`, never emoji. Skeletons for async regions. No horizontal scroll at 375, 768, 1024, 1440.
- Theme, colour, type and spacing come from `@neram/ui` only. Import MUI components from `@neram/ui` (it re-exports the curated set in `packages/ui/src/components/index.tsx`); if a component used below is not in that list, add it to that re-export list rather than importing `@mui/material` directly in Nexus.
- Every route: `getRequestUser` (or `verifyMsToken` where a delegated Graph token is needed), `errorResponse` from `@/lib/api-errors`, `Cache-Control: no-store`, failure shape `{ error: string }`.
- Student messages go only through `sendNudge` (`apps/nexus/src/lib/nudge-delivery.ts`). Never insert into `user_notifications` or call Graph from a new route.
- Nexus tests assert on plain DOM values (no jest-dom matchers). Run unit tests from the repo root with `pnpm test:run <path>`; bare `pnpm test` is watch mode and never exits.
- Vocabulary in copy: Sketchbook, sketch, practice day, rhythm, run, flip through, seen, featured. Never streak, submission, grade, publish.
- Commits are local. Never push and never deploy; the user does that.
- Flags: `student.sketchbook` ships OFF, `staff.sketchbook` ships ON. Ids are persisted, never rename them.

---

## File map

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260913090000_nexus_sketchbook.sql` | Source type, columns, four tables, RLS |
| `supabase/migrations/20260913090100_notification_event_type_sketchbook.sql` | Four enum values, own file |
| `packages/database/src/types/index.ts` | `'sketchbook'` in `DrawingSubmissionSource`, `thumbnail_url`, new row types |
| `packages/database/src/queries/nexus/sketchbook.ts` | All Supabase access for the feature |
| `apps/nexus/src/lib/sketchbook-rhythm.ts` | Pure rhythm engine |
| `apps/nexus/src/lib/sketchbook-access.ts` | Who may see whose sketchbook; real Graph token check |
| `apps/nexus/src/lib/sketchbook-messages.ts` | Copy for nudges and the Teams card, pure |
| `apps/nexus/src/lib/teams-class-announcements.ts` | `buildFeaturedSketchHtml` (added) |
| `apps/nexus/src/app/api/sketchbook/**` | Routes |
| `apps/nexus/src/app/api/nav-badges/route.ts` | `sketchbook_inbox` badge; exclude sketchbook rows from `drawing_reviews` |
| `apps/nexus/src/lib/feature-flags.ts`, `apps/nexus/src/lib/nav-config.tsx`, `apps/nexus/src/components/NavBadgeProvider.tsx`, `apps/nexus/src/components/NotificationBell.tsx` | Wiring |
| `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx` | `'sketchbook'` source, thumbnail upload, note label props |
| `apps/nexus/src/components/sketchbook/*` | `RhythmDots`, `RhythmCard`, `SketchGrid`, `SketchbookView`, `SketchPageView`, `AddSketchSheet`, `SketchbookHomeCard`, `FlipThrough`, `FeatureSheet`, `ClassRhythmList`, `WeeklyGoalSheet`, `SketchbookSection` |
| `apps/nexus/src/app/(student)/student/sketchbook/page.tsx`, `.../[id]/page.tsx` | Student pages |
| `apps/nexus/src/app/(teacher)/teacher/sketchbook/page.tsx`, `.../[studentId]/page.tsx`, `.../[studentId]/[sketchId]/page.tsx` | Teacher pages |
| `apps/nexus/src/app/(student)/student/dashboard/page.tsx`, `apps/nexus/src/app/(teacher)/teacher/students/[id]/page.tsx` | One card, one section |
| `tests/e2e/sketchbook-nexus-mobile.spec.ts` | Phone E2E |

Spec deviation recorded here: the "Do not feature my sketches" switch lives in the Sketchbook home overflow menu, not on `/student/profile`, so the feature has no dependency on the profile page.

---

### Task 1: Migrations

**Files:**
- Create: `supabase/migrations/20260913090000_nexus_sketchbook.sql`
- Create: `supabase/migrations/20260913090100_notification_event_type_sketchbook.sql`

**Interfaces:**
- Produces: tables `nexus_sketchbook_practice_days`, `nexus_sketchbook_flips`, `nexus_sketchbook_features`, `nexus_sketchbook_goal_history`; columns `drawing_submissions.thumbnail_url`, `drawing_submissions.prompt_id`, `nexus_classrooms.sketchbook_weekly_goal`, `users.sketchbook_feature_opt_out`; enum values `sketch_reaction`, `sketch_featured`, `sketch_rhythm_nudge`, `sketch_milestone`.

- [ ] **Step 1: Write the core migration**

```sql
-- ============================================
-- STUDENT SKETCHBOOK: practice rhythm, appreciation, class showcase
--
-- A sketch is a drawing_submissions row with source_type 'sketchbook', so the
-- existing reaction, comment, gallery and AI-evaluation machinery applies to it
-- without a second table. What is genuinely new lives in four small tables:
--   practice days   one row per student per IST calendar day with a sketch
--   flips           a teacher opened (seen) or passed over (skipped) a sketch
--   features        a teacher posted a sketch to a classroom, reversible
--   goal history    the weekly goal in force from a given Monday, so raising
--                   the goal never erases a run earned under the old one
--
-- Spec: docs/superpowers/specs/2026-09-11-student-sketchbook-design.md
-- Additive and idempotent.
-- ============================================

-- 1. 'sketchbook' joins the source_type CHECK (same dance as the exam migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drawing_submissions_source_type_check') THEN
    ALTER TABLE drawing_submissions DROP CONSTRAINT drawing_submissions_source_type_check;
  END IF;
END $$;

ALTER TABLE drawing_submissions
  ADD CONSTRAINT drawing_submissions_source_type_check
  CHECK (source_type IN ('question_bank', 'homework', 'free_practice', 'assignment', 'exam', 'sketchbook'));

-- 2. A 400px thumbnail beside the original, so grids never load full photos.
--    prompt_id is reserved for the phase 3 prompt bank; no FK until it exists.
ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS prompt_id UUID;

CREATE INDEX IF NOT EXISTS idx_ds_sketchbook_student
  ON drawing_submissions(student_id, submitted_at DESC)
  WHERE source_type = 'sketchbook';

-- 3. Weekly goal per classroom, plus the history that makes it fair.
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS sketchbook_weekly_goal INTEGER NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nexus_classrooms_sketchbook_weekly_goal_check') THEN
    ALTER TABLE nexus_classrooms
      ADD CONSTRAINT nexus_classrooms_sketchbook_weekly_goal_check
      CHECK (sketchbook_weekly_goal BETWEEN 1 AND 7);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS nexus_sketchbook_goal_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id   UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  goal           INTEGER NOT NULL CHECK (goal BETWEEN 1 AND 7),
  effective_from DATE NOT NULL,
  set_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sketchbook_goal_history_classroom
  ON nexus_sketchbook_goal_history(classroom_id, effective_from DESC);

-- 4. A student may ask never to be featured.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sketchbook_feature_opt_out BOOLEAN NOT NULL DEFAULT false;

-- 5. Practice days. Maintained by the entries routes, never by trigger, so a
--    delete can repair the count with one query and the rhythm read stays
--    proportional to days rather than sketches.
CREATE TABLE IF NOT EXISTS nexus_sketchbook_practice_days (
  student_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practice_date       DATE NOT NULL,
  sketch_count        INTEGER NOT NULL DEFAULT 1,
  first_submission_id UUID REFERENCES drawing_submissions(id) ON DELETE SET NULL,
  PRIMARY KEY (student_id, practice_date)
);

-- 6. Flips: the online version of a teacher opening the physical sketchbook.
CREATE TABLE IF NOT EXISTS nexus_sketchbook_flips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('seen', 'skipped')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, submission_id)
);
CREATE INDEX IF NOT EXISTS idx_sketchbook_flips_submission
  ON nexus_sketchbook_flips(submission_id);

-- 7. Features: per classroom, reversible, remembering what was posted where so
--    un-featuring can soft-delete the Teams messages.
CREATE TABLE IF NOT EXISTS nexus_sketchbook_features (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id               UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  classroom_id                UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  featured_by                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption                     TEXT,
  teams_channel_id            TEXT,
  teams_channel_message_id    TEXT,
  teams_group_chat_message_id TEXT,
  card_hash                   TEXT,
  featured_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  unfeatured_at               TIMESTAMPTZ,
  UNIQUE (submission_id, classroom_id)
);
CREATE INDEX IF NOT EXISTS idx_sketchbook_features_live
  ON nexus_sketchbook_features(classroom_id, featured_at DESC)
  WHERE unfeatured_at IS NULL;

-- 8. Service role only, like the rest of the Nexus teacher surface. MSAL means
--    auth.uid() is always null here, so a policy would be dead code.
ALTER TABLE nexus_sketchbook_goal_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_sketchbook_practice_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_sketchbook_flips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_sketchbook_features      ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Write the enum migration (own file)**

```sql
-- ============================================
-- NOTIFICATION EVENT TYPES: sketchbook
--
--   sketch_reaction      a teacher reacted to a sketch
--   sketch_featured      a teacher featured a sketch to the class
--   sketch_rhythm_nudge  the weekly "two days short" reminder (phase 2 cron)
--   sketch_milestone     7, 30 or 100 sketches (phase 2)
--
-- Isolated in its own migration because ALTER TYPE ADD VALUE cannot share a
-- transaction with code that uses the new value. Additive and idempotent.
-- ============================================
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_reaction';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_featured';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_rhythm_nudge';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'sketch_milestone';

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Apply to staging and regenerate types**

Apply both files to the staging project (the MCP tool `mcp__supabase-staging__apply_migration`, one call per file, or `pnpm supabase db push` against staging). Then from the repo root:

```bash
pnpm supabase:gen:types
```

Expected: `packages/database/src/types/database.generated.ts` now contains the four `nexus_sketchbook_*` tables and the new columns. Do not apply to production; the deploy pipeline does that.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260913090000_nexus_sketchbook.sql supabase/migrations/20260913090100_notification_event_type_sketchbook.sql packages/database/src/types/database.generated.ts
git commit -m "feat(db): sketchbook tables, source type, weekly goal, notification events"
```

---

### Task 2: Hand-written types

**Files:**
- Modify: `packages/database/src/types/index.ts` (the `DrawingSubmissionSource` union near line 9165, the `DrawingSubmission` interface near line 9374, and new interfaces appended after `GalleryReactionType` near line 9566)

**Interfaces:**
- Produces: `DrawingSubmissionSource` includes `'sketchbook'`; `DrawingSubmission.thumbnail_url: string | null`; `SketchbookReaction`, `NexusSketchbookPracticeDay`, `NexusSketchbookFlip`, `NexusSketchbookFeature`, `NexusSketchbookGoalChange`.

- [ ] **Step 1: Extend the source union and the submission interface**

In the `DrawingSubmissionSource` union add a final member:

```ts
export type DrawingSubmissionSource =
  | 'question_bank'
  | 'homework'
  | 'free_practice'
  | 'assignment'
  | 'exam'
  /** A personal sketchbook entry. Never reviewed, never graded; see the sketchbook spec. */
  | 'sketchbook';
```

In `DrawingSubmission`, directly after `original_image_url: string;` add:

```ts
  /** 400px JPEG uploaded beside the original. Grids load this, never the original. */
  thumbnail_url: string | null;
```

- [ ] **Step 2: Add the sketchbook row types after `GalleryReactionType`**

```ts
/** The three reactions a teacher can give a sketch. A subset of GalleryReactionType. */
export type SketchbookReaction = Extract<GalleryReactionType, 'heart' | 'fire' | 'wow'>;

export interface NexusSketchbookPracticeDay {
  student_id: string;
  /** YYYY-MM-DD in Asia/Kolkata. */
  practice_date: string;
  sketch_count: number;
  first_submission_id: string | null;
}

export interface NexusSketchbookFlip {
  id: string;
  teacher_id: string;
  submission_id: string;
  action: 'seen' | 'skipped';
  created_at: string;
}

export interface NexusSketchbookFeature {
  id: string;
  submission_id: string;
  classroom_id: string;
  featured_by: string;
  caption: string | null;
  teams_channel_id: string | null;
  teams_channel_message_id: string | null;
  teams_group_chat_message_id: string | null;
  card_hash: string | null;
  featured_at: string;
  unfeatured_at: string | null;
}

export interface NexusSketchbookGoalChange {
  id: string;
  classroom_id: string;
  goal: number;
  /** YYYY-MM-DD, always a Monday. */
  effective_from: string;
  set_by: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Type-check the package**

```bash
pnpm --filter @neram/database type-check
```

Expected: no errors. If `DrawingSubmission` is constructed as an object literal anywhere (grep `original_image_url:` in `packages/database/src` and `apps/nexus/src`), add `thumbnail_url: null` to that literal.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/types/index.ts
git commit -m "feat(db): sketchbook types"
```

---

### Task 3: Rhythm engine (pure)

**Files:**
- Create: `apps/nexus/src/lib/sketchbook-rhythm.ts`
- Test: `apps/nexus/src/lib/sketchbook-rhythm.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_WEEKLY_GOAL = 3`
  - `istDate(iso: string | Date): string` (YYYY-MM-DD in Asia/Kolkata)
  - `weekStart(date: string): string` (Monday, YYYY-MM-DD)
  - `addDays(date: string, n: number): string`
  - `daysBetween(a: string, b: string): number`
  - `interface GoalChange { effectiveFrom: string; goal: number }`
  - `goalForWeek(weekStartDate: string, history: GoalChange[], fallback?: number): number`
  - `interface WeekRhythm { start: string; days: boolean[]; count: number; goal: number; met: boolean }`
  - `interface Rhythm { week: WeekRhythm; run: number; bestRun: number; totalDays: number; lastPracticeDate: string | null; quietDays: number | null }`
  - `computeRhythm(practiceDates: string[], today: string, history: GoalChange[], fallbackGoal?: number): Rhythm`
  - `thenAndNow<T extends { submitted_at: string }>(sketches: T[]): { first: T; latest: T } | null`
  - `milestoneReached(totalSketches: number): 7 | 30 | 100 | null`
  - `rhythmLine(r: Rhythm): string` (the one-line copy)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  istDate, weekStart, addDays, goalForWeek, computeRhythm, thenAndNow, milestoneReached, rhythmLine,
} from './sketchbook-rhythm';

// 2026-09-09 is a Wednesday.
const TODAY = '2026-09-09';
const MON = '2026-09-07';
const NO_HISTORY: never[] = [];

describe('istDate', () => {
  it('rolls a late-evening UTC timestamp into the next IST day', () => {
    expect(istDate('2026-09-08T19:30:00.000Z')).toBe('2026-09-09');
  });
  it('keeps an afternoon timestamp on the same day', () => {
    expect(istDate('2026-09-09T06:00:00.000Z')).toBe('2026-09-09');
  });
});

describe('weekStart', () => {
  it('returns the Monday for a Wednesday', () => expect(weekStart(TODAY)).toBe(MON));
  it('returns the same day for a Monday', () => expect(weekStart(MON)).toBe(MON));
  it('returns the previous Monday for a Sunday', () => expect(weekStart('2026-09-13')).toBe(MON));
});

describe('goalForWeek', () => {
  it('falls back to 3 with no history', () => expect(goalForWeek(MON, NO_HISTORY)).toBe(3));
  it('uses the latest change at or before the week start', () => {
    const history = [
      { effectiveFrom: '2026-08-03', goal: 3 },
      { effectiveFrom: '2026-09-07', goal: 4 },
    ];
    expect(goalForWeek('2026-08-31', history)).toBe(3);
    expect(goalForWeek('2026-09-07', history)).toBe(4);
    expect(goalForWeek('2026-09-14', history)).toBe(4);
  });
});

describe('computeRhythm', () => {
  it('describes an empty sketchbook without a run or a quiet count', () => {
    const r = computeRhythm([], TODAY, NO_HISTORY);
    expect(r.week.days).toEqual([false, false, false, false, false, false, false]);
    expect(r.week.count).toBe(0);
    expect(r.run).toBe(0);
    expect(r.bestRun).toBe(0);
    expect(r.totalDays).toBe(0);
    expect(r.lastPracticeDate).toBeNull();
    expect(r.quietDays).toBeNull();
  });

  it('marks this week\'s dots and counts several sketches on one day once', () => {
    const r = computeRhythm(['2026-09-07', '2026-09-07', '2026-09-09'], TODAY, NO_HISTORY);
    expect(r.week.days).toEqual([true, false, true, false, false, false, false]);
    expect(r.week.count).toBe(2);
    expect(r.week.met).toBe(false);
    expect(r.totalDays).toBe(2);
    expect(r.quietDays).toBe(0);
  });

  it('counts a run of past weeks that met the goal and adds this week once it is met', () => {
    const dates = [
      // week of 24 Aug: 3 days
      '2026-08-24', '2026-08-26', '2026-08-28',
      // week of 31 Aug: 3 days
      '2026-08-31', '2026-09-02', '2026-09-04',
      // this week so far: 2 days
      '2026-09-07', '2026-09-08',
    ];
    const r = computeRhythm(dates, TODAY, NO_HISTORY);
    expect(r.run).toBe(2);
    expect(r.bestRun).toBe(2);
    const met = computeRhythm([...dates, '2026-09-09'], TODAY, NO_HISTORY);
    expect(met.week.met).toBe(true);
    expect(met.run).toBe(3);
    expect(met.bestRun).toBe(3);
  });

  it('ends the run at the first past week that missed the goal, but keeps the best run', () => {
    const dates = [
      '2026-08-10', '2026-08-12', '2026-08-14',   // met
      '2026-08-17', '2026-08-19', '2026-08-21',   // met
      '2026-08-24',                               // missed
      '2026-08-31', '2026-09-02', '2026-09-04',   // met
    ];
    const r = computeRhythm(dates, TODAY, NO_HISTORY);
    expect(r.run).toBe(1);
    expect(r.bestRun).toBe(2);
  });

  it('judges each past week by the goal in force at its start', () => {
    const dates = ['2026-08-31', '2026-09-02', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09'];
    const history = [{ effectiveFrom: '2026-09-07', goal: 4 }];
    const r = computeRhythm(dates, TODAY, history);
    expect(r.week.goal).toBe(4);
    expect(r.week.met).toBe(false);
    expect(r.run).toBe(1); // last week still counts under its goal of 3
  });

  it('reports quiet days since the last practice', () => {
    const r = computeRhythm(['2026-09-01'], TODAY, NO_HISTORY);
    expect(r.lastPracticeDate).toBe('2026-09-01');
    expect(r.quietDays).toBe(8);
  });
});

describe('thenAndNow', () => {
  const s = (d: string) => ({ submitted_at: `${d}T10:00:00.000Z` });
  it('needs eight sketches spanning thirty days', () => {
    expect(thenAndNow([s('2026-08-01'), s('2026-09-05')])).toBeNull();
    const eight = ['01', '02', '03', '04', '05', '06', '07', '08'].map((d) => s(`2026-09-${d}`));
    expect(thenAndNow(eight)).toBeNull();
  });
  it('returns the earliest and the latest', () => {
    const list = [
      s('2026-07-01'), s('2026-07-05'), s('2026-07-09'), s('2026-07-15'),
      s('2026-08-01'), s('2026-08-10'), s('2026-08-20'), s('2026-09-05'),
    ];
    const r = thenAndNow([...list].reverse());
    expect(r?.first.submitted_at).toBe('2026-07-01T10:00:00.000Z');
    expect(r?.latest.submitted_at).toBe('2026-09-05T10:00:00.000Z');
  });
});

describe('milestoneReached', () => {
  it('fires only on the exact counts', () => {
    expect(milestoneReached(6)).toBeNull();
    expect(milestoneReached(7)).toBe(7);
    expect(milestoneReached(30)).toBe(30);
    expect(milestoneReached(100)).toBe(100);
    expect(milestoneReached(31)).toBeNull();
  });
});

describe('rhythmLine', () => {
  it('invites a new student rather than scoring zero', () => {
    expect(rhythmLine(computeRhythm([], TODAY, NO_HISTORY))).toBe('Start your rhythm. 3 practice days a week is the goal.');
  });
  it('counts the week and names the run', () => {
    const dates = ['2026-08-31', '2026-09-02', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09'];
    expect(rhythmLine(computeRhythm(dates, TODAY, NO_HISTORY))).toBe('3 of 3 days this week. Good rhythm, 2 weeks running.');
    expect(rhythmLine(computeRhythm(['2026-09-07'], TODAY, NO_HISTORY))).toBe('1 of 3 days this week.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm test:run apps/nexus/src/lib/sketchbook-rhythm.test.ts
```

Expected: FAIL, "Cannot find module './sketchbook-rhythm'".

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Sketchbook rhythm engine. PURE: no Date.now(), no database, no timezone
 * guesses. Every date in and out is a YYYY-MM-DD string in Asia/Kolkata.
 *
 * Why a weekly goal and not a daily chain: a chain punishes hardest right after
 * the best run (school exams, travel, one tired night) and most students quit
 * after the first break. A weekly goal turns "draw every alternate day" into
 * "3 of 7 days", which is what the teacher actually wants, and a missed day
 * never resets anything the student can see.
 *
 * Why goal history: the teacher starts a class at 3 and raises it to 4 or 5
 * later. A week is judged by the goal in force at its Monday, so raising the
 * goal never erases a run earned under the old one.
 */

export const DEFAULT_WEEKLY_GOAL = 3;

export interface GoalChange {
  /** YYYY-MM-DD, a Monday. */
  effectiveFrom: string;
  goal: number;
}

export interface WeekRhythm {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Mon..Sun. */
  days: boolean[];
  count: number;
  goal: number;
  met: boolean;
}

export interface Rhythm {
  week: WeekRhythm;
  /** Consecutive weeks meeting the goal, ending last week, plus this week once met. */
  run: number;
  bestRun: number;
  totalDays: number;
  lastPracticeDate: string | null;
  /** Days since the last practice day. Null when there is none yet. */
  quietDays: number | null;
}

const DAY_MS = 86_400_000;

export function istDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  // en-CA renders as YYYY-MM-DD; the timeZone option does the IST shift.
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / DAY_MS);
}

export function weekStart(date: string): string {
  const d = toUtc(date);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return fromUtc(d);
}

export function goalForWeek(
  weekStartDate: string,
  history: GoalChange[],
  fallback: number = DEFAULT_WEEKLY_GOAL,
): number {
  let goal = fallback;
  let best = '';
  for (const h of history) {
    if (h.effectiveFrom <= weekStartDate && h.effectiveFrom >= best) {
      best = h.effectiveFrom;
      goal = h.goal;
    }
  }
  return goal;
}

function weekOf(start: string, set: Set<string>, history: GoalChange[], fallback: number): WeekRhythm {
  const days = Array.from({ length: 7 }, (_, i) => set.has(addDays(start, i)));
  const count = days.filter(Boolean).length;
  const goal = goalForWeek(start, history, fallback);
  return { start, days, count, goal, met: count >= goal };
}

export function computeRhythm(
  practiceDates: string[],
  today: string,
  history: GoalChange[],
  fallbackGoal: number = DEFAULT_WEEKLY_GOAL,
): Rhythm {
  const set = new Set(practiceDates);
  const thisStart = weekStart(today);
  const week = weekOf(thisStart, set, history, fallbackGoal);

  if (set.size === 0) {
    return { week, run: 0, bestRun: 0, totalDays: 0, lastPracticeDate: null, quietDays: null };
  }

  const sorted = [...set].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstStart = weekStart(first);

  // Walk every week from the first practice week up to last week, in order,
  // to find the best run; then the run that is still alive.
  let bestRun = 0;
  let current = 0;
  for (let s = firstStart; s < thisStart; s = addDays(s, 7)) {
    if (weekOf(s, set, history, fallbackGoal).met) {
      current += 1;
      if (current > bestRun) bestRun = current;
    } else {
      current = 0;
    }
  }
  let run = current; // consecutive met weeks ending last week
  if (week.met) {
    run += 1;
    if (run > bestRun) bestRun = run;
  }

  return {
    week,
    run,
    bestRun,
    totalDays: set.size,
    lastPracticeDate: last,
    quietDays: Math.max(0, daysBetween(last, today)),
  };
}

export function thenAndNow<T extends { submitted_at: string }>(
  sketches: T[],
): { first: T; latest: T } | null {
  if (sketches.length < 8) return null;
  const sorted = [...sketches].sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  if (daysBetween(istDate(first.submitted_at), istDate(latest.submitted_at)) < 30) return null;
  return { first, latest };
}

export function milestoneReached(totalSketches: number): 7 | 30 | 100 | null {
  if (totalSketches === 7 || totalSketches === 30 || totalSketches === 100) return totalSketches;
  return null;
}

/** The one line under the dots. Never "0 of 3": an empty sketchbook gets an invitation. */
export function rhythmLine(r: Rhythm): string {
  if (r.totalDays === 0) {
    return `Start your rhythm. ${r.week.goal} practice days a week is the goal.`;
  }
  const base = `${r.week.count} of ${r.week.goal} days this week.`;
  if (r.week.met && r.run > 1) {
    return `${base} Good rhythm, ${r.run} weeks running.`;
  }
  if (r.week.met) return `${base} Goal met.`;
  return base;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm test:run apps/nexus/src/lib/sketchbook-rhythm.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/sketchbook-rhythm.ts apps/nexus/src/lib/sketchbook-rhythm.test.ts
git commit -m "feat(nexus): sketchbook rhythm engine"
```

---

### Task 4: Database queries

**Files:**
- Create: `packages/database/src/queries/nexus/sketchbook.ts`
- Modify: `packages/database/src/queries/nexus/index.ts` (add `export * from './sketchbook';` after the `./drawing-gallery` line)

**Interfaces:**
- Consumes: `getSupabaseAdminClient`, `TypedSupabaseClient` from `../../client`; `SketchbookReaction`, `NexusSketchbookFeature` from `../../types`.
- Produces (all take an optional trailing `client?: TypedSupabaseClient`):
  - `interface SketchbookSketchRow { id; student_id; original_image_url; thumbnail_url; self_note; reaction; submitted_at; is_gallery_visible }`
  - `interface SketchbookInboxRow extends SketchbookSketchRow { student: { id; name; avatar_url; ms_oid } }`
  - `interface SketchbookFeatureFact { classroom_id; classroom_name; featured_at }`
  - `monthRangeIst(month: string): { from: string; to: string }` (pure, exported for tests)
  - `listSketchbookMonth(studentId, month)`, `countSketches(studentId)`, `firstAndLatestSketch(studentId)`, `getSketchbookSketch(id)`
  - `listPracticeDates(studentId)`, `upsertPracticeDay(studentId, practiceDate, submissionId)`, `repairPracticeDay(studentId, practiceDate, istDateOf)`
  - `getSketchbookGoalHistory(classroomId)`, `setSketchbookWeeklyGoal(classroomId, goal, setBy, effectiveFrom)`
  - `getStudentPrimaryClassroom(studentId)`, `listUserClassroomIds(userId, role)`, `usersShareClassroom(staffId, studentId)`
  - `listUnflipped(teacherId, studentIds, limit)`, `recordFlip(teacherId, submissionId, action)`, `firstSeenBy(submissionIds)`
  - `listLiveFeatures(submissionIds)`, `insertFeature(row)`, `getLiveFeature(submissionId, classroomId)`, `markUnfeatured(featureId)`, `hasAnyLiveFeature(submissionId)`
  - `classPracticeDates(studentIds, sinceDate)`, `setSketchbookReaction(submissionId, reaction)`, `setFeatureOptOut(userId, optOut)`, `getFeatureOptOut(userId)`

- [ ] **Step 1: Write the failing test for the pure helper**

Create `packages/database/src/queries/nexus/sketchbook.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { monthRangeIst } from './sketchbook';

describe('monthRangeIst', () => {
  it('bounds a month in IST, not UTC', () => {
    expect(monthRangeIst('2026-09')).toEqual({
      from: '2026-09-01T00:00:00+05:30',
      to: '2026-10-01T00:00:00+05:30',
    });
  });
  it('rolls December into the next year', () => {
    expect(monthRangeIst('2026-12').to).toBe('2027-01-01T00:00:00+05:30');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm test:run packages/database/src/queries/nexus/sketchbook.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the queries**

```ts
// @ts-nocheck: sketchbook tables land in the generated types after the migration is applied; regenerate with pnpm supabase:gen:types
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import type { SketchbookReaction, NexusSketchbookFeature } from '../../types';

/**
 * Sketchbook data access. Every function here is service-role; the routes
 * decide who may call what. Nothing in this file knows about weeks or goals,
 * that is apps/nexus/src/lib/sketchbook-rhythm.ts.
 */

export interface SketchbookSketchRow {
  id: string;
  student_id: string;
  original_image_url: string;
  thumbnail_url: string | null;
  self_note: string | null;
  reaction: SketchbookReaction | null;
  submitted_at: string;
  is_gallery_visible: boolean;
}

export interface SketchbookInboxRow extends SketchbookSketchRow {
  student: { id: string; name: string | null; avatar_url: string | null; ms_oid: string | null };
}

export interface SketchbookFeatureFact {
  classroom_id: string;
  classroom_name: string;
  featured_at: string;
}

const SKETCH_COLUMNS =
  'id, student_id, original_image_url, thumbnail_url, self_note, reaction, submitted_at, is_gallery_visible';

/** IST bounds for a YYYY-MM month, as ISO strings PostgREST compares correctly. */
export function monthRangeIst(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${y}-${pad(m)}-01T00:00:00+05:30`,
    to: `${nextY}-${pad(nextM)}-01T00:00:00+05:30`,
  };
}

export async function listSketchbookMonth(
  studentId: string,
  month: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow[]> {
  const supabase = client || getSupabaseAdminClient();
  const { from, to } = monthRangeIst(month);
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('student_id', studentId)
    .eq('source_type', 'sketchbook')
    .gte('submitted_at', from)
    .lt('submitted_at', to)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function countSketches(studentId: string, client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('drawing_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('source_type', 'sketchbook');
  if (error) throw error;
  return count ?? 0;
}

export async function firstAndLatestSketch(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ first: SketchbookSketchRow; latest: SketchbookSketchRow } | null> {
  const supabase = client || getSupabaseAdminClient();
  const base = () =>
    supabase.from('drawing_submissions').select(SKETCH_COLUMNS).eq('student_id', studentId).eq('source_type', 'sketchbook');
  const [{ data: first }, { data: latest }] = await Promise.all([
    base().order('submitted_at', { ascending: true }).limit(1).maybeSingle(),
    base().order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!first || !latest) return null;
  return { first, latest };
}

export async function getSketchbookSketch(
  id: string,
  client?: TypedSupabaseClient,
): Promise<SketchbookSketchRow | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('drawing_submissions')
    .select(SKETCH_COLUMNS)
    .eq('id', id)
    .eq('source_type', 'sketchbook')
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Practice days ────────────────────────────────────────────────────────────

export async function listPracticeDates(studentId: string, client?: TypedSupabaseClient): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_sketchbook_practice_days')
    .select('practice_date')
    .eq('student_id', studentId)
    .order('practice_date', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => r.practice_date);
}

export async function upsertPracticeDay(
  studentId: string,
  practiceDate: string,
  submissionId: string,
  client?: TypedSupabaseClient,
): Promise<{ isNewDay: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from('nexus_sketchbook_practice_days')
    .select('sketch_count')
    .eq('student_id', studentId)
    .eq('practice_date', practiceDate)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase
      .from('nexus_sketchbook_practice_days')
      .insert({ student_id: studentId, practice_date: practiceDate, sketch_count: 1, first_submission_id: submissionId });
    if (error) throw error;
    return { isNewDay: true };
  }
  const { error } = await supabase
    .from('nexus_sketchbook_practice_days')
    .update({ sketch_count: existing.sketch_count + 1 })
    .eq('student_id', studentId)
    .eq('practice_date', practiceDate);
  if (error) throw error;
  return { isNewDay: false };
}

/**
 * Recount one practice day from the sketches that still exist. `istDateOf`
 * is injected so this file never decides what "a day" is.
 */
export async function repairPracticeDay(
  studentId: string,
  practiceDate: string,
  istDateOf: (iso: string) => string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from('drawing_submissions')
    .select('id, submitted_at')
    .eq('student_id', studentId)
    .eq('source_type', 'sketchbook')
    .order('submitted_at', { ascending: true });
  if (error) throw error;
  const sameDay = (rows || []).filter((r) => istDateOf(r.submitted_at) === practiceDate);
  if (sameDay.length === 0) {
    await supabase.from('nexus_sketchbook_practice_days').delete().eq('student_id', studentId).eq('practice_date', practiceDate);
    return;
  }
  await supabase
    .from('nexus_sketchbook_practice_days')
    .upsert(
      { student_id: studentId, practice_date: practiceDate, sketch_count: sameDay.length, first_submission_id: sameDay[0].id },
      { onConflict: 'student_id,practice_date' },
    );
}

// ── Goal ─────────────────────────────────────────────────────────────────────

export async function getSketchbookGoalHistory(
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<{ effectiveFrom: string; goal: number }[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_sketchbook_goal_history')
    .select('effective_from, goal')
    .eq('classroom_id', classroomId)
    .order('effective_from', { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => ({ effectiveFrom: r.effective_from, goal: r.goal }));
}

export async function setSketchbookWeeklyGoal(
  classroomId: string,
  goal: number,
  setBy: string,
  effectiveFrom: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error: a } = await supabase.from('nexus_classrooms').update({ sketchbook_weekly_goal: goal }).eq('id', classroomId);
  if (a) throw a;
  const { error: b } = await supabase
    .from('nexus_sketchbook_goal_history')
    .insert({ classroom_id: classroomId, goal, effective_from: effectiveFrom, set_by: setBy });
  if (b) throw b;
}

// ── Classrooms and membership ────────────────────────────────────────────────

/** The classroom of the student's newest active enrolment: the same "newest wins" rule as stage facts. */
export async function getStudentPrimaryClassroom(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ id: string; name: string; sketchbook_weekly_goal: number; batch_id: string | null } | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('batch_id, enrolled_at, classroom:nexus_classrooms!nexus_enrollments_classroom_id_fkey(id, name, sketchbook_weekly_goal, is_active)')
    .eq('user_id', studentId)
    .eq('role', 'student')
    .eq('is_active', true)
    .order('enrolled_at', { ascending: false });
  if (error) throw error;
  const live = (data || []).find((r) => r.classroom?.is_active);
  if (!live) return null;
  return {
    id: live.classroom.id,
    name: live.classroom.name,
    sketchbook_weekly_goal: live.classroom.sketchbook_weekly_goal ?? 3,
    batch_id: live.batch_id ?? null,
  };
}

export async function listUserClassroomIds(
  userId: string,
  role: 'student' | 'teacher',
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_enrollments')
    .select('classroom_id')
    .eq('user_id', userId)
    .eq('role', role)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map((r) => r.classroom_id);
}

export async function usersShareClassroom(
  staffId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<boolean> {
  const [mine, theirs] = await Promise.all([
    listUserClassroomIds(staffId, 'teacher', client),
    listUserClassroomIds(studentId, 'student', client),
  ]);
  const set = new Set(mine);
  return theirs.some((id) => set.has(id));
}

// ── Flips ────────────────────────────────────────────────────────────────────

export async function listUnflipped(
  teacherId: string,
  studentIds: string[],
  limit: number,
  client?: TypedSupabaseClient,
): Promise<{ rows: SketchbookInboxRow[]; remaining: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (studentIds.length === 0) return { rows: [], remaining: 0 };
  const { data: flips } = await supabase
    .from('nexus_sketchbook_flips')
    .select('submission_id')
    .eq('teacher_id', teacherId);
  const flipped = (flips || []).map((f) => f.submission_id);

  let query = supabase
    .from('drawing_submissions')
    .select(`${SKETCH_COLUMNS}, student:users!drawing_submissions_student_id_fkey(id, name, avatar_url, ms_oid)`, { count: 'exact' })
    .eq('source_type', 'sketchbook')
    .in('student_id', studentIds)
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (flipped.length > 0) query = query.not('id', 'in', `(${flipped.join(',')})`);
  const { data, count, error } = await query;
  if (error) throw error;
  const rows = data || [];
  return { rows, remaining: Math.max(0, (count ?? rows.length) - rows.length) };
}

export async function recordFlip(
  teacherId: string,
  submissionId: string,
  action: 'seen' | 'skipped',
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from('nexus_sketchbook_flips')
    .select('id, action')
    .eq('teacher_id', teacherId)
    .eq('submission_id', submissionId)
    .maybeSingle();
  // 'seen' is the stronger fact; never downgrade it to 'skipped'.
  if (existing) {
    if (existing.action === 'skipped' && action === 'seen') {
      await supabase.from('nexus_sketchbook_flips').update({ action: 'seen' }).eq('id', existing.id);
    }
    return;
  }
  const { error } = await supabase
    .from('nexus_sketchbook_flips')
    .insert({ teacher_id: teacherId, submission_id: submissionId, action });
  if (error && error.code !== '23505') throw error;
}

export async function firstSeenBy(
  submissionIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, { name: string | null; at: string }>> {
  const supabase = client || getSupabaseAdminClient();
  if (submissionIds.length === 0) return {};
  const { data, error } = await supabase
    .from('nexus_sketchbook_flips')
    .select('submission_id, created_at, teacher:users!nexus_sketchbook_flips_teacher_id_fkey(name)')
    .in('submission_id', submissionIds)
    .eq('action', 'seen')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const out: Record<string, { name: string | null; at: string }> = {};
  for (const row of data || []) {
    if (!out[row.submission_id]) out[row.submission_id] = { name: row.teacher?.name ?? null, at: row.created_at };
  }
  return out;
}

// ── Features ─────────────────────────────────────────────────────────────────

export async function listLiveFeatures(
  submissionIds: string[],
  client?: TypedSupabaseClient,
): Promise<Record<string, SketchbookFeatureFact[]>> {
  const supabase = client || getSupabaseAdminClient();
  if (submissionIds.length === 0) return {};
  const { data, error } = await supabase
    .from('nexus_sketchbook_features')
    .select('submission_id, classroom_id, featured_at, classroom:nexus_classrooms!nexus_sketchbook_features_classroom_id_fkey(name)')
    .in('submission_id', submissionIds)
    .is('unfeatured_at', null);
  if (error) throw error;
  const out: Record<string, SketchbookFeatureFact[]> = {};
  for (const row of data || []) {
    (out[row.submission_id] ||= []).push({
      classroom_id: row.classroom_id,
      classroom_name: row.classroom?.name ?? '',
      featured_at: row.featured_at,
    });
  }
  return out;
}

export async function getLiveFeature(
  submissionId: string,
  classroomId: string,
  client?: TypedSupabaseClient,
): Promise<NexusSketchbookFeature | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nexus_sketchbook_features')
    .select('*')
    .eq('submission_id', submissionId)
    .eq('classroom_id', classroomId)
    .is('unfeatured_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertFeature(
  row: Omit<NexusSketchbookFeature, 'id' | 'featured_at' | 'unfeatured_at'>,
  client?: TypedSupabaseClient,
): Promise<NexusSketchbookFeature> {
  const supabase = client || getSupabaseAdminClient();
  // A previously un-featured pairing is revived rather than duplicated (UNIQUE).
  const { data, error } = await supabase
    .from('nexus_sketchbook_features')
    .upsert({ ...row, featured_at: new Date().toISOString(), unfeatured_at: null }, { onConflict: 'submission_id,classroom_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function markUnfeatured(featureId: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from('nexus_sketchbook_features')
    .update({ unfeatured_at: new Date().toISOString() })
    .eq('id', featureId);
  if (error) throw error;
}

export async function hasAnyLiveFeature(submissionId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { count } = await supabase
    .from('nexus_sketchbook_features')
    .select('id', { count: 'exact', head: true })
    .eq('submission_id', submissionId)
    .is('unfeatured_at', null);
  return (count ?? 0) > 0;
}

// ── Class view, reactions, preferences ───────────────────────────────────────

export async function classPracticeDates(
  studentIds: string[],
  sinceDate: string,
  client?: TypedSupabaseClient,
): Promise<Record<string, string[]>> {
  const supabase = client || getSupabaseAdminClient();
  if (studentIds.length === 0) return {};
  const { data, error } = await supabase
    .from('nexus_sketchbook_practice_days')
    .select('student_id, practice_date')
    .in('student_id', studentIds)
    .gte('practice_date', sinceDate)
    .order('practice_date', { ascending: true });
  if (error) throw error;
  const out: Record<string, string[]> = {};
  for (const id of studentIds) out[id] = [];
  for (const row of data || []) out[row.student_id].push(row.practice_date);
  return out;
}

export async function setSketchbookReaction(
  submissionId: string,
  reaction: SketchbookReaction | null,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('drawing_submissions').update({ reaction }).eq('id', submissionId);
  if (error) throw error;
}

export async function setFeatureOptOut(userId: string, optOut: boolean, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from('users').update({ sketchbook_feature_opt_out: optOut }).eq('id', userId);
  if (error) throw error;
}

export async function getFeatureOptOut(userId: string, client?: TypedSupabaseClient): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from('users').select('sketchbook_feature_opt_out').eq('id', userId).maybeSingle();
  return !!data?.sketchbook_feature_opt_out;
}
```

- [ ] **Step 4: Export from the barrel and run the test**

Add to `packages/database/src/queries/nexus/index.ts` after `export * from './drawing-gallery';`:

```ts
export * from './sketchbook';
```

```bash
pnpm test:run packages/database/src/queries/nexus/sketchbook.test.ts
pnpm --filter @neram/database type-check
```

Expected: PASS (2 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/queries/nexus/sketchbook.ts packages/database/src/queries/nexus/sketchbook.test.ts packages/database/src/queries/nexus/index.ts
git commit -m "feat(db): sketchbook queries"
```

---

### Task 5: Access rules and message copy (pure where possible)

**Files:**
- Create: `apps/nexus/src/lib/sketchbook-access.ts`
- Create: `apps/nexus/src/lib/sketchbook-messages.ts`
- Test: `apps/nexus/src/lib/sketchbook-messages.test.ts`, `apps/nexus/src/lib/sketchbook-access.test.ts`

**Interfaces:**
- Consumes: `RequestUser`, `isInternalStaff`, `isStaff` from `@/lib/study-materials`; `ApiError` from `@/lib/api-errors`; `extractBearerToken` from `@/lib/ms-verify`; `usersShareClassroom`, `listUserClassroomIds` from `@neram/database/queries/nexus`; `getSupabaseAdminClient` from `@neram/database`.
- Produces:
  - `assertStaffSeesStudent(caller: RequestUser, studentId: string): Promise<void>` (403 otherwise)
  - `staffClassroomIds(caller: RequestUser): Promise<string[]>` (internal staff: every active classroom; teacher: their own)
  - `realGraphToken(authHeader: string | null): string` (400 `ApiError` for `test_`, `imp_`, `par_` or missing)
  - `isRealGraphToken(token: string | null): boolean` (pure)
  - `reactionMessage(teacherFirstName, reaction): { subject, plain }`, `featuredMessage(teacherFirstName, classroomName): { subject, plain }`, `REACTION_LABEL: Record<SketchbookReaction, string>`, `firstName(name)`

- [ ] **Step 1: Write the failing tests**

`apps/nexus/src/lib/sketchbook-messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reactionMessage, featuredMessage, firstName, REACTION_LABEL } from './sketchbook-messages';

describe('sketchbook messages', () => {
  it('labels the three reactions', () => {
    expect(REACTION_LABEL).toEqual({ heart: 'Nice', fire: 'Great', wow: 'Wow' });
  });
  it('takes the first name only', () => {
    expect(firstName('Hari Babu')).toBe('Hari');
    expect(firstName(null)).toBe('Your teacher');
  });
  it('writes the reaction message without em dashes', () => {
    const m = reactionMessage('Hari', 'fire');
    expect(m.subject).toBe('Hari reacted to your sketch');
    expect(m.plain).toBe('Hari said Great to a sketch in your sketchbook. Keep the rhythm going.');
    expect(m.plain).not.toContain('—');
  });
  it('writes the featured message', () => {
    const m = featuredMessage('Hari', 'JEE B.Arch Session 1');
    expect(m.subject).toBe('Your sketch was featured in JEE B.Arch Session 1');
    expect(m.plain).toBe('Hari featured one of your sketches for the whole class to see. Open your sketchbook to find it.');
  });
});
```

`apps/nexus/src/lib/sketchbook-access.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isRealGraphToken } from './sketchbook-access';

describe('isRealGraphToken', () => {
  it('rejects Nexus-internal token families and empties', () => {
    expect(isRealGraphToken(null)).toBe(false);
    expect(isRealGraphToken('')).toBe(false);
    expect(isRealGraphToken('test_abc')).toBe(false);
    expect(isRealGraphToken('imp_abc')).toBe(false);
    expect(isRealGraphToken('par_abc')).toBe(false);
  });
  it('accepts anything else', () => {
    expect(isRealGraphToken('eyJ0eXAiOiJKV1Qi')).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm test:run apps/nexus/src/lib/sketchbook-messages.test.ts apps/nexus/src/lib/sketchbook-access.test.ts
```

Expected: FAIL, modules not found.

- [ ] **Step 3: Write `sketchbook-messages.ts`**

```ts
import type { SketchbookReaction } from '@neram/database/types';

/** Copy for every sketchbook message. Pure so it can be tested and reused by the Teams card. */

export const REACTION_LABEL: Record<SketchbookReaction, string> = {
  heart: 'Nice',
  fire: 'Great',
  wow: 'Wow',
};

export function firstName(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Your teacher';
  return trimmed.split(/\s+/)[0];
}

export function reactionMessage(teacherFirstName: string, reaction: SketchbookReaction): { subject: string; plain: string } {
  return {
    subject: `${teacherFirstName} reacted to your sketch`,
    plain: `${teacherFirstName} said ${REACTION_LABEL[reaction]} to a sketch in your sketchbook. Keep the rhythm going.`,
  };
}

export function featuredMessage(teacherFirstName: string, classroomName: string): { subject: string; plain: string } {
  return {
    subject: `Your sketch was featured in ${classroomName}`,
    plain: `${teacherFirstName} featured one of your sketches for the whole class to see. Open your sketchbook to find it.`,
  };
}
```

- [ ] **Step 4: Write `sketchbook-access.ts`**

```ts
import { getSupabaseAdminClient } from '@neram/database';
import { listUserClassroomIds, usersShareClassroom } from '@neram/database/queries/nexus';
import { ApiError } from '@/lib/api-errors';
import { extractBearerToken } from '@/lib/ms-verify';
import { isInternalStaff, isStaff, type RequestUser } from '@/lib/study-materials';

/**
 * Who may open whose sketchbook.
 *
 * Internal staff (admin, manager) see every student. A teacher sees a student
 * when they share an active classroom. Membership is the access rule, exactly
 * as everywhere else in Nexus; there is no per-feature grant.
 */
export async function assertStaffSeesStudent(caller: RequestUser, studentId: string): Promise<void> {
  if (!isStaff(caller)) throw new ApiError('Not authorized', 403);
  if (isInternalStaff(caller)) return;
  const ok = await usersShareClassroom(caller.id, studentId);
  if (!ok) throw new ApiError('You do not teach this student.', 403);
}

/** The classrooms whose sketchbooks this staff member flips through. */
export async function staffClassroomIds(caller: RequestUser): Promise<string[]> {
  if (!isStaff(caller)) throw new ApiError('Not authorized', 403);
  if (isInternalStaff(caller)) {
    const { data } = await getSupabaseAdminClient().from('nexus_classrooms').select('id').eq('is_active', true);
    return (data || []).map((c: { id: string }) => c.id);
  }
  return listUserClassroomIds(caller.id, 'teacher');
}

/** Nexus's own test, impersonation and parent tokens are not Microsoft's. */
export function isRealGraphToken(token: string | null): boolean {
  return !!token && !/^(test_|imp_|par_)/.test(token);
}

/** The delegated Graph bearer, or a 400 that says why Teams posting is off. */
export function realGraphToken(authHeader: string | null): string {
  const token = extractBearerToken(authHeader);
  if (!isRealGraphToken(token)) {
    throw new ApiError('Posting to Teams needs a Microsoft sign-in.', 400);
  }
  return token as string;
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm test:run apps/nexus/src/lib/sketchbook-messages.test.ts apps/nexus/src/lib/sketchbook-access.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/sketchbook-access.ts apps/nexus/src/lib/sketchbook-access.test.ts apps/nexus/src/lib/sketchbook-messages.ts apps/nexus/src/lib/sketchbook-messages.test.ts
git commit -m "feat(nexus): sketchbook access rules and message copy"
```

---

### Task 6: Student routes: add, delete, read my sketchbook

**Files:**
- Create: `apps/nexus/src/lib/sketchbook-payload.ts` (shared assembly used by `me` and `students/[id]`)
- Create: `apps/nexus/src/app/api/sketchbook/entries/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/entries/[id]/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/me/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/preferences/route.ts`

**Interfaces:**
- Consumes: Task 3 engine, Task 4 queries, `getRequestUser`, `errorResponse`, `recordGamificationEvent` (from `@neram/database/queries/nexus`), `createDrawingSubmission` (from `@neram/database/queries/nexus`).
- Produces:
  - `buildSketchbookPayload(studentId, month, opts: { summaryOnly: boolean; today: string }): Promise<SketchbookPayload>` where
    ```ts
    interface SketchbookPayload {
      rhythm: Rhythm;
      goal: number;
      classroom: { id: string; name: string } | null;
      totalSketches: number;
      thenAndNow: { first: SketchbookSketchRow; latest: SketchbookSketchRow } | null;
      month: string;
      sketches: Array<SketchbookSketchRow & { seenBy: { name: string | null; at: string } | null; featured: SketchbookFeatureFact[] }>;
      practiceDaysThisMonth: number;
      featureOptOut: boolean;
    }
    ```
  - `POST /api/sketchbook/entries` body `{ original_image_url, thumbnail_url?, caption? }` → `{ sketch, rhythm, isNewDay }`
  - `DELETE /api/sketchbook/entries/[id]` → 204, 409 when featured
  - `GET /api/sketchbook/me?month=YYYY-MM&summary=1` → `SketchbookPayload`
  - `PATCH /api/sketchbook/preferences` body `{ feature_opt_out: boolean }` → `{ feature_opt_out }`

- [ ] **Step 1: Write the payload builder**

`apps/nexus/src/lib/sketchbook-payload.ts`:

```ts
import {
  countSketches, firstAndLatestSketch, firstSeenBy, getFeatureOptOut, getSketchbookGoalHistory,
  getStudentPrimaryClassroom, listLiveFeatures, listPracticeDates, listSketchbookMonth,
  type SketchbookFeatureFact, type SketchbookSketchRow,
} from '@neram/database/queries/nexus';
import { computeRhythm, daysBetween, istDate, type Rhythm } from '@/lib/sketchbook-rhythm';

export interface SketchbookPayload {
  rhythm: Rhythm;
  goal: number;
  classroom: { id: string; name: string } | null;
  totalSketches: number;
  thenAndNow: { first: SketchbookSketchRow; latest: SketchbookSketchRow } | null;
  month: string;
  sketches: Array<SketchbookSketchRow & { seenBy: { name: string | null; at: string } | null; featured: SketchbookFeatureFact[] }>;
  practiceDaysThisMonth: number;
  featureOptOut: boolean;
}

/** One assembly for the student's own view and the teacher's peek, so they never drift. */
export async function buildSketchbookPayload(
  studentId: string,
  month: string,
  opts: { summaryOnly: boolean; today: string },
): Promise<SketchbookPayload> {
  const [classroom, practiceDates, total, optOut] = await Promise.all([
    getStudentPrimaryClassroom(studentId),
    listPracticeDates(studentId),
    countSketches(studentId),
    getFeatureOptOut(studentId),
  ]);
  const history = classroom ? await getSketchbookGoalHistory(classroom.id) : [];
  const goal = classroom?.sketchbook_weekly_goal ?? 3;
  const rhythm = computeRhythm(practiceDates, opts.today, history, goal);

  const base: SketchbookPayload = {
    rhythm,
    goal: rhythm.week.goal,
    classroom: classroom ? { id: classroom.id, name: classroom.name } : null,
    totalSketches: total,
    thenAndNow: null,
    month,
    sketches: [],
    practiceDaysThisMonth: practiceDates.filter((d) => d.startsWith(month)).length,
    featureOptOut: optOut,
  };
  if (opts.summaryOnly) return base;

  const [rows, edges] = await Promise.all([listSketchbookMonth(studentId, month), firstAndLatestSketch(studentId)]);
  const ids = rows.map((r) => r.id);
  const [seen, features] = await Promise.all([firstSeenBy(ids), listLiveFeatures(ids)]);

  base.sketches = rows.map((r) => ({ ...r, seenBy: seen[r.id] ?? null, featured: features[r.id] ?? [] }));
  // Same rule as thenAndNow() in the engine (8+ sketches, 30+ days apart), but
  // from the two edge rows instead of the whole list, which we never load here.
  if (edges && total >= 8 && daysBetween(istDate(edges.first.submitted_at), istDate(edges.latest.submitted_at)) >= 30) {
    base.thenAndNow = edges;
  }
  return base;
}
```

The import line at the top of this file must read `import { computeRhythm, daysBetween, istDate, type Rhythm } from '@/lib/sketchbook-rhythm';` (drop `thenAndNow`, which is only used by screens that hold a full list).

- [ ] **Step 2: Write `POST /api/sketchbook/entries`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  createDrawingSubmission, getSketchbookGoalHistory, getStudentPrimaryClassroom, listPracticeDates,
  recordGamificationEvent, upsertPracticeDay,
} from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { computeRhythm, istDate } from '@/lib/sketchbook-rhythm';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CAPTION_MAX = 80;

/**
 * POST /api/sketchbook/entries   (student)
 * body { original_image_url, thumbnail_url?, caption? }
 *
 * The image is already in the drawing-uploads bucket (POST /api/drawing/upload).
 * A sketch is a drawing_submissions row with source_type 'sketchbook' and status
 * 'completed': nothing is pending, nobody grades it. Several sketches on one
 * IST day are one practice day and one points award.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);

    const body = await request.json().catch(() => ({}));
    const originalUrl = typeof body?.original_image_url === 'string' ? body.original_image_url : '';
    if (!/^https:\/\//.test(originalUrl)) throw new ApiError('Missing original_image_url', 400);
    const thumbnailUrl = typeof body?.thumbnail_url === 'string' && /^https:\/\//.test(body.thumbnail_url) ? body.thumbnail_url : null;
    const caption = typeof body?.caption === 'string' ? body.caption.trim().slice(0, CAPTION_MAX) : '';

    const supabase = getSupabaseAdminClient();
    const submission = await createDrawingSubmission({
      student_id: caller.id,
      source_type: 'sketchbook',
      original_image_url: originalUrl,
      self_note: caption || null,
    });
    // createDrawingSubmission predates these two columns; set them in one follow-up write.
    await supabase
      .from('drawing_submissions')
      .update({ status: 'completed', thumbnail_url: thumbnailUrl, thread_id: submission.id })
      .eq('id', submission.id);

    const today = istDate(submission.submitted_at || new Date());
    const { isNewDay } = await upsertPracticeDay(caller.id, today, submission.id);

    const classroom = await getStudentPrimaryClassroom(caller.id);
    if (isNewDay && classroom) {
      // One award per practice day, keyed so a second sketch the same day is a no-op.
      recordGamificationEvent({
        student_id: caller.id,
        classroom_id: classroom.id,
        batch_id: classroom.batch_id,
        event_type: 'drawing_submitted',
        points: 2,
        source_id: `sketch_day_${today}`,
        activity_type: 'drawing_submitted',
        activity_title: 'Added a sketch to their sketchbook',
        metadata: { submission_id: submission.id, practice_date: today },
      }).catch(() => {});
    }

    const [dates, history] = await Promise.all([
      listPracticeDates(caller.id),
      classroom ? getSketchbookGoalHistory(classroom.id) : Promise.resolve([]),
    ]);
    const rhythm = computeRhythm(dates, today, history, classroom?.sketchbook_weekly_goal ?? 3);

    return NextResponse.json(
      { sketch: { ...submission, status: 'completed', thumbnail_url: thumbnailUrl }, rhythm, isNewDay },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not add the sketch');
  }
}
```

- [ ] **Step 3: Write `DELETE /api/sketchbook/entries/[id]`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getSketchbookSketch, hasAnyLiveFeature, repairPracticeDay } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { istDate } from '@/lib/sketchbook-rhythm';

/**
 * DELETE /api/sketchbook/entries/[id]   (the student who drew it)
 *
 * A featured sketch has been shown to a class; the teacher un-features it
 * first. The practice day is recounted from what remains.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    if (sketch.student_id !== caller.id) throw new ApiError('Not your sketch', 403);
    if (await hasAnyLiveFeature(sketch.id)) {
      throw new ApiError('This sketch is featured in a class. Ask your teacher to un-feature it first.', 409);
    }

    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from('drawing_submissions').delete().eq('id', sketch.id);
    if (error) throw error;
    await repairPracticeDay(caller.id, istDate(sketch.submitted_at), istDate);

    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not delete the sketch');
  }
}
```

- [ ] **Step 4: Write `GET /api/sketchbook/me`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { istDate } from '@/lib/sketchbook-rhythm';
import { buildSketchbookPayload } from '@/lib/sketchbook-payload';

/** GET /api/sketchbook/me?month=YYYY-MM&summary=1   (student) */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
    const today = istDate(new Date());
    const month = request.nextUrl.searchParams.get('month') || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError('month must be YYYY-MM', 400);
    const summaryOnly = request.nextUrl.searchParams.get('summary') === '1';
    const payload = await buildSketchbookPayload(caller.id, month, { summaryOnly, today });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load your sketchbook');
  }
}
```

- [ ] **Step 5: Write `PATCH /api/sketchbook/preferences`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { setFeatureOptOut } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';

/** PATCH /api/sketchbook/preferences  body { feature_opt_out: boolean }   (student) */
export async function PATCH(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    if (caller.user_type !== 'student') throw new ApiError('Only students keep a sketchbook.', 403);
    const body = await request.json().catch(() => ({}));
    if (typeof body?.feature_opt_out !== 'boolean') throw new ApiError('feature_opt_out must be a boolean', 400);
    await setFeatureOptOut(caller.id, body.feature_opt_out);
    return NextResponse.json({ feature_opt_out: body.feature_opt_out }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not save the preference');
  }
}
```

- [ ] **Step 6: Type-check and smoke the routes**

```bash
pnpm --filter @neram/nexus type-check
```

Expected: no errors. Then with `pnpm dev:nexus` running and a student test token (`POST /api/auth/test-login` with `{ email, role: 'student' }` in dev), exercise:

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3012/api/sketchbook/me?summary=1"
```

Expected: JSON with `rhythm.week.days` of seven booleans and `goal: 3`.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/lib/sketchbook-payload.ts apps/nexus/src/app/api/sketchbook
git commit -m "feat(nexus): sketchbook student routes"
```

---

### Task 7: Staff routes: peek, inbox, flip, react, class rhythm, goal

**Files:**
- Create: `apps/nexus/src/app/api/sketchbook/students/[id]/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/inbox/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/entries/[id]/flip/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/entries/[id]/react/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/class-rhythm/route.ts`
- Create: `apps/nexus/src/app/api/sketchbook/settings/route.ts`

**Interfaces:**
- Consumes: Tasks 3 to 6; `sendNudge` from `@/lib/nudge-delivery`; `loadClassroomRoster` from `@neram/database/queries/nexus`; `addDrawingSubmissionComment`.
- Produces:
  - `GET /api/sketchbook/students/[id]?month=` → `SketchbookPayload`
  - `GET /api/sketchbook/inbox?classroom=` → `{ sketches: SketchbookInboxRow[]; remaining: number }`
  - `POST /api/sketchbook/entries/[id]/flip` body `{ action: 'seen' | 'skipped' }` → `{ ok: true }`
  - `POST /api/sketchbook/entries/[id]/react` body `{ reaction: 'heart' | 'fire' | 'wow' | null, comment?: string }` → `{ reaction }`
  - `GET /api/sketchbook/class-rhythm?classroom=` → `{ goal: number; students: Array<{ userId, name, avatarUrl, msOid, dormant, week: boolean[], count, run, lastPracticeDate, quietDays }> }`
  - `PATCH /api/sketchbook/settings?classroom=` body `{ weekly_goal }` → `{ goal }`

- [ ] **Step 1: `GET /api/sketchbook/students/[id]`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { istDate } from '@/lib/sketchbook-rhythm';
import { buildSketchbookPayload } from '@/lib/sketchbook-payload';

/** GET /api/sketchbook/students/[id]?month=YYYY-MM   (staff who teach this student) */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    await assertStaffSeesStudent(caller, params.id);
    const today = istDate(new Date());
    const month = request.nextUrl.searchParams.get('month') || today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError('month must be YYYY-MM', 400);
    const payload = await buildSketchbookPayload(params.id, month, { summaryOnly: false, today });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the sketchbook');
  }
}
```

- [ ] **Step 2: `GET /api/sketchbook/inbox`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { listUnflipped, loadClassroomRoster } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';

const PAGE = 20;

/**
 * GET /api/sketchbook/inbox?classroom=<id>   (staff)
 *
 * Sketches this teacher has not flipped through yet, newest first, from the
 * students in the classrooms they teach (or the one classroom asked for).
 * Dormant students are included: they keep uploading, and a teacher who opens
 * the inbox should see what arrived, not a filtered version of it.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const mine = await staffClassroomIds(caller);
    const asked = request.nextUrl.searchParams.get('classroom');
    if (asked && !mine.includes(asked)) throw new ApiError('You do not teach this classroom.', 403);
    const classroomIds = asked ? [asked] : mine;

    const rosters = await Promise.all(classroomIds.map((id) => loadClassroomRoster(id, { includeDormant: true })));
    const studentIds = [...new Set(rosters.flatMap((r) => r.members.map((m) => m.user_id)))];

    const { rows, remaining } = await listUnflipped(caller.id, studentIds, PAGE);
    return NextResponse.json({ sketches: rows, remaining }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the inbox');
  }
}
```

- [ ] **Step 3: `POST /api/sketchbook/entries/[id]/flip`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSketchbookSketch, recordFlip } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';

/** POST /api/sketchbook/entries/[id]/flip  body { action: 'seen' | 'skipped' }   (staff) */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const action = body?.action === 'skipped' ? 'skipped' : body?.action === 'seen' ? 'seen' : null;
    if (!action) throw new ApiError('action must be seen or skipped', 400);
    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);
    await recordFlip(caller.id, sketch.id, action);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not record the flip');
  }
}
```

- [ ] **Step 4: `POST /api/sketchbook/entries/[id]/react`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { addDrawingSubmissionComment, getSketchbookSketch, recordFlip, setSketchbookReaction } from '@neram/database/queries/nexus';
import type { SketchbookReaction } from '@neram/database/types';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent } from '@/lib/sketchbook-access';
import { firstName, reactionMessage } from '@/lib/sketchbook-messages';
import { sendNudge } from '@/lib/nudge-delivery';

const REACTIONS: SketchbookReaction[] = ['heart', 'fire', 'wow'];
const COMMENT_MAX = 300;

/**
 * POST /api/sketchbook/entries/[id]/react
 * body { reaction: 'heart' | 'fire' | 'wow' | null, comment?: string }   (staff)
 *
 * One reaction per sketch (the column is single-valued, like assignment
 * grading). Null clears it. A comment rides the existing comment thread. The
 * student is told through sendNudge; respectDormancy is false because the
 * student asked for this by uploading.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const reaction = body?.reaction === null ? null : (REACTIONS.includes(body?.reaction) ? (body.reaction as SketchbookReaction) : undefined);
    if (reaction === undefined) throw new ApiError('reaction must be heart, fire, wow or null', 400);
    const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, COMMENT_MAX) : '';

    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);

    await setSketchbookReaction(sketch.id, reaction);
    await recordFlip(caller.id, sketch.id, 'seen');
    if (comment) {
      await addDrawingSubmissionComment({ submission_id: sketch.id, author_id: caller.id, author_role: 'teacher', comment_text: comment });
    }

    const changed = reaction !== null && reaction !== sketch.reaction;
    if (changed || comment) {
      const who = firstName(caller.name);
      const msg = reaction ? reactionMessage(who, reaction) : { subject: `${who} commented on your sketch`, plain: comment };
      await sendNudge({
        studentIds: [sketch.student_id],
        subject: msg.subject,
        plain: comment && reaction ? `${msg.plain} ${who} wrote: ${comment}` : msg.plain,
        eventType: 'sketch_reaction',
        metadata: { submission_id: sketch.id, reaction, source: 'sketchbook' },
        respectDormancy: false,
      });
    }
    return NextResponse.json({ reaction }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not save the reaction');
  }
}
```

- [ ] **Step 5: `GET /api/sketchbook/class-rhythm`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { classPracticeDates, getSketchbookGoalHistory, loadClassroomRoster } from '@neram/database/queries/nexus';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import { addDays, computeRhythm, istDate, weekStart } from '@/lib/sketchbook-rhythm';

/**
 * GET /api/sketchbook/class-rhythm?classroom=<id>   (staff)
 *
 * Every tracked student in the classroom with this week's dots and their run.
 * Dormant students are included and flagged so the list can grey them; the
 * screen sorts quiet-first because the quiet ones are who a teacher is
 * looking for.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) throw new ApiError('Missing classroom', 400);
    const mine = await staffClassroomIds(caller);
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);

    const today = istDate(new Date());
    const since = addDays(weekStart(today), -7 * 8);
    const [roster, history, { data: classroom }] = await Promise.all([
      loadClassroomRoster(classroomId, { includeDormant: true }),
      getSketchbookGoalHistory(classroomId),
      getSupabaseAdminClient().from('nexus_classrooms').select('sketchbook_weekly_goal').eq('id', classroomId).maybeSingle(),
    ]);
    const goal = (classroom as { sketchbook_weekly_goal?: number } | null)?.sketchbook_weekly_goal ?? 3;
    const dates = await classPracticeDates(roster.members.map((m) => m.user_id), since);

    const students = roster.members.map((m) => {
      const r = computeRhythm(dates[m.user_id] || [], today, history, goal);
      return {
        userId: m.user_id,
        name: m.user.name,
        avatarUrl: m.user.avatar_url,
        msOid: m.user.ms_oid,
        dormant: m.participation_status === 'dormant',
        week: r.week.days,
        count: r.week.count,
        run: r.run,
        lastPracticeDate: r.lastPracticeDate,
        quietDays: r.quietDays,
      };
    });
    return NextResponse.json({ goal, students }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not load the class rhythm');
  }
}
```

Note: `quietDays` here counts only the last eight weeks of practice days; a student quiet for longer reads as "never", which the list renders as "No sketches in 8 weeks".

- [ ] **Step 6: `PATCH /api/sketchbook/settings`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { setSketchbookWeeklyGoal } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import { istDate, weekStart } from '@/lib/sketchbook-rhythm';

/**
 * PATCH /api/sketchbook/settings?classroom=<id>  body { weekly_goal: 1..7 }   (staff)
 * Applies from this week's Monday; earlier weeks keep the goal they were judged by.
 */
export async function PATCH(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) throw new ApiError('Missing classroom', 400);
    const mine = await staffClassroomIds(caller);
    if (!mine.includes(classroomId)) throw new ApiError('You do not teach this classroom.', 403);
    const body = await request.json().catch(() => ({}));
    const goal = Number(body?.weekly_goal);
    if (!Number.isInteger(goal) || goal < 1 || goal > 7) throw new ApiError('weekly_goal must be a whole number from 1 to 7', 400);
    await setSketchbookWeeklyGoal(classroomId, goal, caller.id, weekStart(istDate(new Date())));
    return NextResponse.json({ goal }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not change the weekly goal');
  }
}
```

- [ ] **Step 7: Type-check and commit**

```bash
pnpm --filter @neram/nexus type-check
git add apps/nexus/src/app/api/sketchbook
git commit -m "feat(nexus): sketchbook staff routes"
```

---

### Task 8: Feature to class (Teams card, feature and un-feature routes)

**Files:**
- Modify: `apps/nexus/src/lib/teams-class-announcements.ts` (add `buildFeaturedSketchHtml` next to `buildWrapUpHtml`, around line 198)
- Test: `apps/nexus/src/lib/teams-class-announcements.sketch.test.ts`
- Create: `apps/nexus/src/app/api/sketchbook/entries/[id]/feature/route.ts`

**Interfaces:**
- Consumes: `escapeMessageHtml`, `cardHash`, `postChannelMessageDetailed(token, teamId, channelId, html, mentions?)`, `postChatMessageDetailed(token, chatId, html, mentions?)`, `isPostError`, `resolveMeetingChannelId(token, teamId)`, `removeTeamsAnnouncements(token, supabase, classroomId, refs)`, `buildMentions(people)`; `realGraphToken`, `assertStaffSeesStudent` (Task 5); `sendNudge`; `assertCapability(caller, 'moderate.gallery')`.
- Produces:
  - `buildFeaturedSketchHtml(input: { studentName: string; caption: string | null; imageUrl: string; nexusUrl: string }): string`
  - `POST /api/sketchbook/entries/[id]/feature` body `{ classroom_id, caption? }` → `{ feature, teams: { channel: boolean; chat: boolean; errors: string[] } }`
  - `DELETE /api/sketchbook/entries/[id]/feature?classroom=` → `{ ok: true, failures: string[] }`

- [ ] **Step 1: Write the failing card test**

```ts
import { describe, it, expect } from 'vitest';
import { buildFeaturedSketchHtml } from './teams-class-announcements';

describe('buildFeaturedSketchHtml', () => {
  it('escapes the caption and embeds the image and the Nexus link', () => {
    const html = buildFeaturedSketchHtml({
      studentName: 'Asha <3',
      caption: 'My street in 10 minutes & a chair',
      imageUrl: 'https://x.supabase.co/storage/v1/object/public/drawing-uploads/u/1.jpg',
      nexusUrl: 'https://nexus.neramclasses.com/teacher/sketchbook/u/1',
    });
    expect(html).toContain('Featured sketch');
    expect(html).toContain('Asha &lt;3');
    expect(html).toContain('My street in 10 minutes &amp; a chair');
    expect(html).toContain('<img src="https://x.supabase.co/storage/v1/object/public/drawing-uploads/u/1.jpg"');
    expect(html).toContain('href="https://nexus.neramclasses.com/teacher/sketchbook/u/1"');
    expect(html).not.toContain('—');
  });
  it('drops a non-https image rather than embedding it', () => {
    const html = buildFeaturedSketchHtml({ studentName: 'A', caption: null, imageUrl: 'javascript:alert(1)', nexusUrl: 'https://n/x' });
    expect(html).not.toContain('<img');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm test:run apps/nexus/src/lib/teams-class-announcements.sketch.test.ts
```

Expected: FAIL, `buildFeaturedSketchHtml` is not exported.

- [ ] **Step 3: Add the builder after `buildWrapUpHtml`**

```ts
/**
 * The "Featured sketch" card a teacher posts to the class. The image is the
 * public drawing-uploads URL; anything that is not https is dropped rather than
 * embedded (the spike in the sketchbook plan decides whether Teams renders an
 * external image or needs hostedContents; this builder is the same either way).
 */
export function buildFeaturedSketchHtml(input: {
  studentName: string;
  caption: string | null;
  imageUrl: string;
  nexusUrl: string;
}): string {
  const name = escapeMessageHtml(input.studentName);
  const caption = input.caption ? `<p><i>${escapeMessageHtml(input.caption)}</i></p>` : '';
  const img = /^https:\/\//.test(input.imageUrl)
    ? `<p><img src="${escapeMessageHtml(input.imageUrl)}" alt="Sketch by ${name}" width="480"></p>`
    : '';
  const link = /^https:\/\//.test(input.nexusUrl)
    ? `<p><a href="${escapeMessageHtml(input.nexusUrl)}">Open in Nexus</a></p>`
    : '';
  return (
    `<h3>Featured sketch</h3>` +
    `<p><b>${name}</b> drew this in their sketchbook.</p>` +
    img +
    caption +
    link
  );
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test:run apps/nexus/src/lib/teams-class-announcements.sketch.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write the feature route**

`apps/nexus/src/app/api/sketchbook/entries/[id]/feature/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getFeatureOptOut, getLiveFeature, getSketchbookSketch, hasAnyLiveFeature, insertFeature,
  listUserClassroomIds, markUnfeatured, recordFlip,
} from '@neram/database/queries/nexus';
import { assertCapability, getRequestUser } from '@/lib/study-materials';
import { ApiError, errorResponse } from '@/lib/api-errors';
import { assertStaffSeesStudent, realGraphToken, staffClassroomIds } from '@/lib/sketchbook-access';
import { featuredMessage, firstName } from '@/lib/sketchbook-messages';
import { sendNudge } from '@/lib/nudge-delivery';
import {
  buildFeaturedSketchHtml, buildMentions, cardHash, isPostError, postChannelMessageDetailed,
  postChatMessageDetailed, removeTeamsAnnouncements, resolveMeetingChannelId,
} from '@/lib/teams-class-announcements';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CAPTION_MAX = 120;

function nexusBase(): string {
  return process.env.NEXT_PUBLIC_NEXUS_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://nexus.neramclasses.com';
}

/**
 * POST /api/sketchbook/entries/[id]/feature   body { classroom_id, caption? }
 *
 * The only public claim this feature makes about a student, so it follows the
 * celebrate route's rules: the teacher's own delegated token (an app-only token
 * cannot post a chatMessage), the classroom re-checked against both the
 * teacher and the student, the student's opt-out honoured, and the card hash
 * stored so a retry never posts twice. Goes to BOTH the group chat and the
 * class channel (assignment channel, else the meeting channel), as decided with
 * the user on 2026-09-12.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'moderate.gallery');
    const token = realGraphToken(request.headers.get('Authorization'));

    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : '';
    if (!classroomId) throw new ApiError('Missing classroom_id', 400);
    const caption = typeof body?.caption === 'string' ? body.caption.trim().slice(0, CAPTION_MAX) : '';

    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);
    const [mine, theirs] = await Promise.all([staffClassroomIds(caller), listUserClassroomIds(sketch.student_id, 'student')]);
    if (!mine.includes(classroomId) || !theirs.includes(classroomId)) {
      throw new ApiError('That classroom does not hold both of you.', 403);
    }
    if (await getFeatureOptOut(sketch.student_id)) {
      throw new ApiError('This student has asked not to be featured.', 409);
    }
    if (await getLiveFeature(sketch.id, classroomId)) {
      throw new ApiError('Already featured in this classroom.', 409);
    }

    const supabase = getSupabaseAdminClient();
    const [{ data: classroom }, { data: student }] = await Promise.all([
      supabase.from('nexus_classrooms').select('id, name, ms_team_id, ms_channel_id, ms_group_chat_id, ms_assignment_channel_id').eq('id', classroomId).maybeSingle(),
      supabase.from('users').select('id, name, ms_oid').eq('id', sketch.student_id).maybeSingle(),
    ]);
    if (!classroom) throw new ApiError('Classroom not found', 404);
    const studentName = (student as { name?: string | null } | null)?.name || 'A student';

    const nexusUrl = `${nexusBase()}/teacher/sketchbook/${sketch.student_id}/${sketch.id}`;
    const body_html = buildFeaturedSketchHtml({ studentName, caption: caption || sketch.self_note, imageUrl: sketch.original_image_url, nexusUrl });
    const { html: mentionHtml, mentions } = buildMentions([{ oid: (student as { ms_oid?: string | null } | null)?.ms_oid, displayName: studentName }]);
    const html = `${body_html}<p>Drawn by ${mentionHtml}</p>`;

    // Teams first, then the row, so a Graph failure never records a feature that never posted.
    const teams = { channel: false, chat: false, errors: [] as string[] };
    let channelId: string | null = null;
    let channelMessageId: string | null = null;
    let chatMessageId: string | null = null;
    const c = classroom as { ms_team_id: string | null; ms_channel_id: string | null; ms_group_chat_id: string | null; ms_assignment_channel_id: string | null };
    if (c.ms_team_id) {
      channelId = c.ms_assignment_channel_id || c.ms_channel_id || (await resolveMeetingChannelId(token, c.ms_team_id));
      if (channelId) {
        const r = await postChannelMessageDetailed(token, c.ms_team_id, channelId, html, mentions);
        if (isPostError(r)) teams.errors.push(`channel: ${r.error}`); else { teams.channel = true; channelMessageId = r.id; }
      }
    }
    if (c.ms_group_chat_id) {
      const r = await postChatMessageDetailed(token, c.ms_group_chat_id, html, mentions);
      if (isPostError(r)) teams.errors.push(`chat: ${r.error}`); else { teams.chat = true; chatMessageId = r.id; }
    }
    if (!c.ms_team_id && !c.ms_group_chat_id) teams.errors.push('This classroom has no Teams channel or group chat.');

    const feature = await insertFeature({
      submission_id: sketch.id,
      classroom_id: classroomId,
      featured_by: caller.id,
      caption: caption || null,
      teams_channel_id: channelId,
      teams_channel_message_id: channelMessageId,
      teams_group_chat_message_id: chatMessageId,
      card_hash: cardHash(html),
    });
    await supabase.from('drawing_submissions').update({ is_gallery_visible: true }).eq('id', sketch.id);
    await recordFlip(caller.id, sketch.id, 'seen');

    const msg = featuredMessage(firstName(caller.name), (classroom as { name: string }).name);
    await sendNudge({
      studentIds: [sketch.student_id],
      subject: msg.subject,
      plain: msg.plain,
      eventType: 'sketch_featured',
      metadata: { submission_id: sketch.id, classroom_id: classroomId, source: 'sketchbook' },
      respectDormancy: false,
    });

    return NextResponse.json({ feature, teams }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not feature the sketch');
  }
}

/** DELETE /api/sketchbook/entries/[id]/feature?classroom=<id>   (staff, delegated token) */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'moderate.gallery');
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) throw new ApiError('Missing classroom', 400);
    const sketch = await getSketchbookSketch(params.id);
    if (!sketch) throw new ApiError('Sketch not found', 404);
    await assertStaffSeesStudent(caller, sketch.student_id);
    const live = await getLiveFeature(sketch.id, classroomId);
    if (!live) throw new ApiError('Not featured in this classroom.', 404);

    let failures: string[] = [];
    if (live.teams_channel_message_id || live.teams_group_chat_message_id) {
      const token = realGraphToken(request.headers.get('Authorization'));
      const result = await removeTeamsAnnouncements(token, getSupabaseAdminClient(), classroomId, {
        teams_channel_id: live.teams_channel_id,
        teams_channel_message_id: live.teams_channel_message_id,
        teams_group_chat_message_id: live.teams_group_chat_message_id,
      });
      failures = result.failures;
    }
    await markUnfeatured(live.id);
    if (!(await hasAnyLiveFeature(sketch.id))) {
      await getSupabaseAdminClient().from('drawing_submissions').update({ is_gallery_visible: false }).eq('id', sketch.id);
    }
    return NextResponse.json({ ok: true, failures }, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err, 'Could not un-feature the sketch');
  }
}
```

- [ ] **Step 6: Type-check and commit**

```bash
pnpm --filter @neram/nexus type-check
git add apps/nexus/src/lib/teams-class-announcements.ts apps/nexus/src/lib/teams-class-announcements.sketch.test.ts "apps/nexus/src/app/api/sketchbook/entries/[id]/feature/route.ts"
git commit -m "feat(nexus): feature a sketch to the class on Teams"
```

---

### Task 9: Flags, navigation, badges, bell links

**Files:**
- Modify: `apps/nexus/src/lib/feature-flags.ts` (student Practice block near line 90; staff Teaching block near line 138)
- Modify: `apps/nexus/src/lib/nav-config.tsx` (student Practice group near line 313; Teaching panel `sidebarItems` near line 152)
- Modify: `apps/nexus/src/components/NavBadgeProvider.tsx` (`PATH_TO_BADGE_KEY` near line 26)
- Modify: `apps/nexus/src/app/api/nav-badges/route.ts` (the `Promise.all` near line 44 and the assignments near line 97)
- Modify: `apps/nexus/src/components/NotificationBell.tsx` (the `switch` near line 58)
- Test: `apps/nexus/src/lib/nav-config.test.ts` (existing, must stay green)

**Interfaces:**
- Produces: flags `student.sketchbook` (OFF), `student.sketchbook-featured-shelf` (OFF, `paths: []`), `staff.sketchbook` (ON); nav items `/student/sketchbook` and `/teacher/sketchbook`; badge key `sketchbook_inbox`; bell links for `sketch_reaction` and `sketch_featured`.

- [ ] **Step 1: Register the flags**

In the student Practice block, after the `student.drawings` line:

```ts
  { id: 'student.sketchbook', label: 'Sketchbook', surface: 'student', group: 'Practice', paths: ['/student/sketchbook'], defaultEnabled: false },
  // Peer-visible: classmates see featured sketches on the Sketchbook home. A
  // behaviour switch, not a page, and enforced server side in /api/sketchbook/featured.
  { id: 'student.sketchbook-featured-shelf', label: 'Show featured sketches to classmates', surface: 'student', group: 'Practice', paths: [], defaultEnabled: false },
```

In the staff Teaching block, after the `staff.drawing-reviews` line:

```ts
  { id: 'staff.sketchbook', label: 'Sketchbooks', surface: 'staff', group: 'Teaching', paths: ['/teacher/sketchbook'], defaultEnabled: true },
```

- [ ] **Step 2: Add the nav items**

`nav-config.tsx` already imports `AutoStoriesOutlinedIcon`. In the student Classroom zone's Practice group, after the Drawings item:

```tsx
        { label: 'Sketchbook', path: '/student/sketchbook', icon: <AutoStoriesOutlinedIcon /> },
```

In the Teaching panel `sidebarItems`, after Drawing Reviews:

```tsx
      { label: 'Sketchbooks', path: '/teacher/sketchbook', icon: <AutoStoriesOutlinedIcon />, group: 'Student work' },
```

Do not add either path to a bottom bar. Run the guard:

```bash
pnpm test:run apps/nexus/src/lib/nav-config.test.ts
```

Expected: PASS (every item reachable on a phone through the More sheet).

- [ ] **Step 3: Badge wiring**

`NavBadgeProvider.tsx`, inside `PATH_TO_BADGE_KEY`:

```ts
  '/teacher/sketchbook': 'sketchbook_inbox',
```

`api/nav-badges/route.ts`: make two changes inside the staff branch.

First, the pending drawing reviews count must exclude sketchbook rows (they insert as `completed`, but a belt-and-braces filter keeps the badge honest if that ever changes):

```ts
        supabase
          .from('drawing_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'submitted')
          .neq('source_type', 'sketchbook'),
```

Second, add a fifth parallel count and assignment. Import at the top:

```ts
import { listUnflipped, loadClassroomRoster } from '@neram/database/queries/nexus';
import { getRequestUser } from '@/lib/study-materials';
import { staffClassroomIds } from '@/lib/sketchbook-access';
```

Add to the `Promise.all` array (it becomes five results; rename the destructure to `[issues, drawings, photoCount, freshReasons, sketchInbox]`):

```ts
        // Sketches this teacher has not flipped through, in the classrooms
        // they teach. Scoped to the viewer for the same reason the photo count
        // is: a number the person cannot drive to zero is not a badge.
        (async () => {
          try {
            const caller = await getRequestUser(request.headers.get('Authorization'));
            const ids = await staffClassroomIds(caller);
            const rosters = await Promise.all(ids.map((id) => loadClassroomRoster(id, { includeDormant: true })));
            const students = [...new Set(rosters.flatMap((r) => r.members.map((m) => m.user_id)))];
            const { rows, remaining } = await listUnflipped(caller.id, students, 50);
            return rows.length + remaining;
          } catch {
            return 0;
          }
        })(),
```

And after `badges.catchup = ...`:

```ts
      badges.sketchbook_inbox = sketchInbox;
```

- [ ] **Step 4: Bell links**

In `NotificationBell.tsx`, add before the `default` of the `switch`:

```ts
    // Both land on the sketch itself. A student taps through to see the
    // reaction next to the drawing; a staff viewer (impersonation) gets the
    // teacher route for the same sketch.
    case 'sketch_reaction':
    case 'sketch_featured': {
      const submissionId = notification.metadata?.submission_id as string | undefined;
      if (!submissionId) return '/student/sketchbook';
      return nexusRole === 'student' ? `/student/sketchbook/${submissionId}` : '/teacher/sketchbook';
    }
```

- [ ] **Step 5: Type-check, run the nav test, commit**

```bash
pnpm --filter @neram/nexus type-check
pnpm test:run apps/nexus/src/lib/nav-config.test.ts apps/nexus/src/components/BottomNav.test.tsx
git add apps/nexus/src/lib/feature-flags.ts apps/nexus/src/lib/nav-config.tsx apps/nexus/src/components/NavBadgeProvider.tsx apps/nexus/src/app/api/nav-badges/route.ts apps/nexus/src/components/NotificationBell.tsx
git commit -m "feat(nexus): sketchbook flags, nav, inbox badge, bell links"
```

---

### Task 10: Upload sheet: sketchbook source, thumbnail, note label

**Files:**
- Modify: `apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx` (props interface lines 18 to 48; `handleSubmit` lines 121 to 200; the note `TextField` near line 370)
- Test: `apps/nexus/src/components/drawings/DrawingSubmissionSheet.test.tsx` (existing; add two cases)

**Interfaces:**
- Produces (new optional props):
  - `sourceType` union gains `'sketchbook'`
  - `withThumbnail?: boolean` (uploads a second 400px JPEG and passes its URL to `submitBody`)
  - `submitBody?: (uploadedUrl: string, selfNote: string | null, thumbnailUrl: string | null) => unknown` (third argument added; existing callers ignore it)
  - `noteLabel?: string`, `notePlaceholder?: string`, `noteMaxLength?: number`, `title?: string`, `submitLabel?: string`

- [ ] **Step 1: Write the failing tests**

Append to the existing `DrawingSubmissionSheet.test.tsx` (keep its existing mocks; it already stubs `fetch` and `compressImage`):

```tsx
describe('sketchbook mode', () => {
  it('shows the sketchbook note label and submit label', () => {
    render(
      <DrawingSubmissionSheet
        open
        onClose={() => {}}
        sourceType="sketchbook"
        getToken={async () => 'tok'}
        onSubmitted={() => {}}
        noteLabel="One line about this sketch (optional)"
        submitLabel="Add to sketchbook"
      />,
    );
    expect(screen.getByLabelText('One line about this sketch (optional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to sketchbook' })).toBeTruthy();
  });

  it('uploads a thumbnail as well and hands its url to submitBody', async () => {
    const calls: string[] = [];
    (globalThis.fetch as any) = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url === '/api/drawing/upload') {
        const n = calls.filter((u) => u === '/api/drawing/upload').length;
        return { ok: true, json: async () => ({ url: `https://x/${n}.jpg` }) } as Response;
      }
      return { ok: true, json: async () => ({ body: init?.body }) } as Response;
    });
    const submitBody = vi.fn((url: string, note: string | null, thumb: string | null) => ({ url, note, thumb }));
    render(
      <DrawingSubmissionSheet
        open
        onClose={() => {}}
        sourceType="sketchbook"
        getToken={async () => 'tok'}
        onSubmitted={() => {}}
        withThumbnail
        submitUrl="/api/sketchbook/entries"
        submitBody={submitBody}
      />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole('button', { name: /submit|add/i });
    fireEvent.click(screen.getByRole('button', { name: /submit|add/i }));
    await waitFor(() => expect(submitBody).toHaveBeenCalled());
    expect(submitBody.mock.calls[0][0]).toBe('https://x/1.jpg');
    expect(submitBody.mock.calls[0][2]).toBe('https://x/2.jpg');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test:run apps/nexus/src/components/drawings/DrawingSubmissionSheet.test.tsx
```

Expected: FAIL on the new cases (unknown props, one upload only).

- [ ] **Step 3: Extend the props**

Replace the `sourceType` line and add the new props to `DrawingSubmissionSheetProps`:

```ts
  sourceType: 'question_bank' | 'free_practice' | 'assignment' | 'sketchbook';
  /**
   * Also upload a 400px JPEG and pass its URL as the third submitBody
   * argument. Grids that show many sketches load only the thumbnail.
   */
  withThumbnail?: boolean;
  /** Copy overrides. The drawing module keeps its defaults. */
  title?: string;
  noteLabel?: string;
  notePlaceholder?: string;
  noteMaxLength?: number;
  submitLabel?: string;
```

Change the `submitBody` type to:

```ts
  submitBody?: (uploadedUrl: string, selfNote: string | null, thumbnailUrl: string | null) => unknown;
```

Destructure the new props in the component signature with defaults:

```ts
  withThumbnail = false, title, noteLabel = 'Self-reflection note (optional)',
  notePlaceholder = 'e.g., I struggled with the shadow direction...', noteMaxLength, submitLabel,
```

- [ ] **Step 4: Upload the thumbnail in `handleSubmit`**

Extract the upload into a helper inside the component, above `handleSubmit`:

```ts
  const uploadOne = async (token: string, blob: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('bucket', 'drawing-uploads');
    const res = await fetch('/api/drawing/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      if (res.status === 413) throw new Error('That image is too large to upload. Please try a smaller photo.');
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Upload failed. Please check your connection and try again.');
    }
    const { url } = await res.json();
    return url as string;
  };
```

Then in `handleSubmit`, replace the block from `const formData = new FormData();` through `const { url } = await uploadRes.json();` with:

```ts
      const url = await uploadOne(token, toUpload);
      setProgress(withThumbnail ? 45 : 60);

      let thumbnailUrl: string | null = null;
      if (withThumbnail) {
        try {
          const thumb = await compressImage(toUpload, 400, 0.8, 'thumb.jpg', 0);
          thumbnailUrl = await uploadOne(token, thumb);
        } catch {
          // A missing thumbnail costs bandwidth in the grid, not the sketch. Never block on it.
          thumbnailUrl = null;
        }
        setProgress(60);
      }
```

and change the `submitBody(url, selfNote || null)` call to `submitBody(url, selfNote || null, thumbnailUrl)`.

- [ ] **Step 5: Apply the copy props**

Find the sheet's heading `Typography` (the one that renders the title text near the top of the drawer) and render `{title ?? <existing text>}`. Update the note field:

```tsx
        <TextField
          label={noteLabel}
          placeholder={notePlaceholder}
          multiline
          rows={2}
          fullWidth
          value={selfNote}
          onChange={(e) => setSelfNote(noteMaxLength ? e.target.value.slice(0, noteMaxLength) : e.target.value)}
          inputProps={noteMaxLength ? { maxLength: noteMaxLength } : undefined}
          helperText={noteMaxLength ? `${selfNote.length}/${noteMaxLength}` : undefined}
          sx={{ mb: 2 }}
        />
```

And the submit `Button` label: `{uploading ? 'Uploading...' : (submitLabel ?? <existing label>)}`.

- [ ] **Step 6: Run the sheet tests and commit**

```bash
pnpm test:run apps/nexus/src/components/drawings/DrawingSubmissionSheet.test.tsx
pnpm --filter @neram/nexus type-check
git add apps/nexus/src/components/drawings/DrawingSubmissionSheet.tsx apps/nexus/src/components/drawings/DrawingSubmissionSheet.test.tsx
git commit -m "feat(nexus): submission sheet supports sketchbook source and thumbnails"
```

---

### Task 11: Student components

**Files:**
- Create: `apps/nexus/src/components/sketchbook/RhythmDots.tsx`
- Create: `apps/nexus/src/components/sketchbook/RhythmCard.tsx`
- Create: `apps/nexus/src/components/sketchbook/SketchGrid.tsx`
- Create: `apps/nexus/src/components/sketchbook/ThenAndNowCard.tsx`
- Create: `apps/nexus/src/components/sketchbook/AddSketchSheet.tsx`
- Create: `apps/nexus/src/components/sketchbook/SketchbookView.tsx`
- Create: `apps/nexus/src/components/sketchbook/SketchPageView.tsx`
- Create: `apps/nexus/src/components/sketchbook/sketchbook-api.ts`
- Test: `apps/nexus/src/components/sketchbook/RhythmCard.test.tsx`, `apps/nexus/src/components/sketchbook/SketchGrid.test.tsx`

**Interfaces:**
- Consumes: `SketchbookPayload` (Task 6), `Rhythm` (Task 3), `DrawingSubmissionSheet` (Task 10), `CommentSection` (`@/components/drawings/CommentSection`), `EmptyState`, `Skeleton`, `PageHeader`, `useAuthSWR`, `useNexusAuthContext`, `REACTION_LABEL` (Task 5).
- Produces:
  - `RhythmDots({ days, todayIndex, size? })`
  - `RhythmCard({ rhythm, loading? })`
  - `SketchGrid({ sketches, hrefFor, loading?, onLoadOlder? })`
  - `ThenAndNowCard({ first, latest })`
  - `AddSketchSheet({ open, onClose, onAdded })` wrapping `DrawingSubmissionSheet`
  - `SketchbookView({ payload, loading, mode: 'own' | 'teacher', hrefFor, onAdd?, onOptOutChange?, onMonthChange })`
  - `SketchPageView({ sketch, mode, backHref, getToken, onDelete?, actions? })` where `sketch` is `SketchbookPayload['sketches'][number]`
  - `sketchbook-api.ts`: `addSketchBody`, `deleteSketch(getToken, id)`, `setOptOut(getToken, v)`, `reactToSketch(getToken, id, reaction, comment?)`, `flipSketch(getToken, id, action)`, `featureSketch(getToken, id, classroomId, caption)`, `unfeatureSketch(getToken, id, classroomId)`, `setWeeklyGoal(getToken, classroomId, goal)`

- [ ] **Step 1: Write the failing component tests**

`RhythmCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RhythmCard from './RhythmCard';
import type { Rhythm } from '@/lib/sketchbook-rhythm';

const base: Rhythm = {
  week: { start: '2026-09-07', days: [true, false, true, false, false, false, false], count: 2, goal: 3, met: false },
  run: 0, bestRun: 4, totalDays: 12, lastPracticeDate: '2026-09-09', quietDays: 0,
};

describe('RhythmCard', () => {
  it('names the week, the goal and the best run', () => {
    render(<RhythmCard rhythm={base} />);
    expect(screen.getByText('2 of 3 days this week.')).toBeTruthy();
    expect(screen.getByText('Best run 4 weeks. 12 practice days in all.')).toBeTruthy();
  });
  it('renders seven day cells with accessible names', () => {
    render(<RhythmCard rhythm={base} />);
    const cells = screen.getAllByRole('img');
    expect(cells.length).toBe(7);
    expect(cells[0].getAttribute('aria-label')).toBe('Monday, practised');
    expect(cells[1].getAttribute('aria-label')).toBe('Tuesday, no sketch');
  });
  it('invites a new student', () => {
    render(<RhythmCard rhythm={{ ...base, totalDays: 0, week: { ...base.week, days: Array(7).fill(false), count: 0 } }} />);
    expect(screen.getByText('Start your rhythm. 3 practice days a week is the goal.')).toBeTruthy();
  });
});
```

`SketchGrid.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SketchGrid from './SketchGrid';

const sketch = (id: string, day: string, thumb: string | null = null) => ({
  id, student_id: 's', original_image_url: `https://x/${id}.jpg`, thumbnail_url: thumb, self_note: null,
  reaction: null, submitted_at: `${day}T10:00:00.000Z`, is_gallery_visible: false, seenBy: null, featured: [],
});

describe('SketchGrid', () => {
  it('renders the thumbnail when present and falls back to the original', () => {
    render(<SketchGrid sketches={[sketch('a', '2026-09-09', 'https://x/a-thumb.jpg'), sketch('b', '2026-09-08')]} hrefFor={(s) => `/student/sketchbook/${s.id}`} />);
    const imgs = screen.getAllByRole('img');
    expect(imgs[0].getAttribute('src')).toBe('https://x/a-thumb.jpg');
    expect(imgs[1].getAttribute('src')).toBe('https://x/b.jpg');
    expect(imgs[0].getAttribute('loading')).toBe('lazy');
  });
  it('links every tile to its page', () => {
    render(<SketchGrid sketches={[sketch('a', '2026-09-09')]} hrefFor={(s) => `/student/sketchbook/${s.id}`} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/student/sketchbook/a');
  });
  it('shows the empty state copy when there is nothing', () => {
    render(<SketchGrid sketches={[]} hrefFor={() => '#'} />);
    expect(screen.getByText('Your sketchbook is empty')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm test:run apps/nexus/src/components/sketchbook
```

Expected: FAIL, modules not found.

- [ ] **Step 3: `sketchbook-api.ts`**

```ts
import type { SketchbookReaction } from '@neram/database/types';

type GetToken = () => Promise<string | null>;

async function call<T>(getToken: GetToken, url: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Session expired. Please refresh the page and try again.');
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Request failed');
  return body as T;
}

/** Body for DrawingSubmissionSheet.submitBody when adding to the sketchbook. */
export function addSketchBody(uploadedUrl: string, caption: string | null, thumbnailUrl: string | null) {
  return { original_image_url: uploadedUrl, thumbnail_url: thumbnailUrl, caption };
}

export const deleteSketch = (getToken: GetToken, id: string) =>
  call<void>(getToken, `/api/sketchbook/entries/${id}`, { method: 'DELETE' });

export const setOptOut = (getToken: GetToken, featureOptOut: boolean) =>
  call<{ feature_opt_out: boolean }>(getToken, '/api/sketchbook/preferences', { method: 'PATCH', body: JSON.stringify({ feature_opt_out: featureOptOut }) });

export const reactToSketch = (getToken: GetToken, id: string, reaction: SketchbookReaction | null, comment?: string) =>
  call<{ reaction: SketchbookReaction | null }>(getToken, `/api/sketchbook/entries/${id}/react`, { method: 'POST', body: JSON.stringify({ reaction, comment }) });

export const flipSketch = (getToken: GetToken, id: string, action: 'seen' | 'skipped') =>
  call<{ ok: true }>(getToken, `/api/sketchbook/entries/${id}/flip`, { method: 'POST', body: JSON.stringify({ action }) });

export const featureSketch = (getToken: GetToken, id: string, classroomId: string, caption: string) =>
  call<{ teams: { channel: boolean; chat: boolean; errors: string[] } }>(getToken, `/api/sketchbook/entries/${id}/feature`, { method: 'POST', body: JSON.stringify({ classroom_id: classroomId, caption }) });

export const unfeatureSketch = (getToken: GetToken, id: string, classroomId: string) =>
  call<{ ok: true; failures: string[] }>(getToken, `/api/sketchbook/entries/${id}/feature?classroom=${encodeURIComponent(classroomId)}`, { method: 'DELETE' });

export const setWeeklyGoal = (getToken: GetToken, classroomId: string, goal: number) =>
  call<{ goal: number }>(getToken, `/api/sketchbook/settings?classroom=${encodeURIComponent(classroomId)}`, { method: 'PATCH', body: JSON.stringify({ weekly_goal: goal }) });
```

- [ ] **Step 4: `RhythmDots.tsx` and `RhythmCard.tsx`**

`RhythmDots.tsx`:

```tsx
'use client';

import { Box, useTheme } from '@neram/ui';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface RhythmDotsProps {
  days: boolean[];
  /** 0..6, outlines today. Omit for a past week. */
  todayIndex?: number;
  size?: number;
}

/** Seven dots, Monday first. Read-only: a 48px row that is never a tap target. */
export default function RhythmDots({ days, todayIndex, size = 20 }: RhythmDotsProps) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minHeight: 48 }}>
      {days.map((on, i) => (
        <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          <Box
            role="img"
            aria-label={`${DAY_NAMES[i]}, ${on ? 'practised' : 'no sketch'}`}
            sx={{
              width: size,
              height: size,
              borderRadius: '50%',
              bgcolor: on ? theme.palette.primary.main : theme.palette.action.disabledBackground,
              border: i === todayIndex ? `2px solid ${theme.palette.primary.dark}` : '2px solid transparent',
              boxSizing: 'border-box',
            }}
          />
          <Box component="span" aria-hidden sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
            {DAY_LETTERS[i]}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
```

`RhythmCard.tsx`:

```tsx
'use client';

import { Paper, Skeleton, Typography } from '@neram/ui';
import RhythmDots from './RhythmDots';
import { rhythmLine, type Rhythm } from '@/lib/sketchbook-rhythm';

interface RhythmCardProps {
  rhythm: Rhythm | null;
  loading?: boolean;
  /** 0..6 for the current week's today. Computed by the caller from the IST date. */
  todayIndex?: number;
}

export default function RhythmCard({ rhythm, loading = false, todayIndex }: RhythmCardProps) {
  if (loading || !rhythm) {
    return <Skeleton variant="rounded" height={124} sx={{ borderRadius: 2, mb: 2 }} />;
  }
  const detail =
    rhythm.totalDays === 0
      ? 'Small sketches count. A ten-minute study is a practice day.'
      : `Best run ${rhythm.bestRun} ${rhythm.bestRun === 1 ? 'week' : 'weeks'}. ${rhythm.totalDays} practice days in all.`;
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Typography variant="overline" color="text.secondary">This week</Typography>
      <RhythmDots days={rhythm.week.days} todayIndex={todayIndex} />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>{rhythmLine(rhythm)}</Typography>
      <Typography variant="body2" color="text.secondary">{detail}</Typography>
    </Paper>
  );
}
```

- [ ] **Step 5: `SketchGrid.tsx` and `ThenAndNowCard.tsx`**

`SketchGrid.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Box, Button, EmptyState, Skeleton, Typography } from '@neram/ui';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export type GridSketch = SketchbookPayload['sketches'][number];

interface SketchGridProps {
  sketches: GridSketch[];
  hrefFor: (s: GridSketch) => string;
  loading?: boolean;
  /** Shown under the grid when there may be older months. */
  onLoadOlder?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

const SKELETON_COUNT = 9;

/**
 * Square thumbnails, three across on a phone. Loads thumbnail_url and never
 * the original; a sketch without one (thumbnail upload failed) falls back.
 */
export default function SketchGrid({
  sketches, hrefFor, loading = false, onLoadOlder,
  emptyTitle = 'Your sketchbook is empty',
  emptyDescription = 'Draw anything for ten minutes and add it here. Small sketches count.',
}: SketchGridProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1 }}>
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <Skeleton key={i} variant="rounded" sx={{ aspectRatio: '1', height: 'auto', width: '100%', borderRadius: 1.5 }} />
        ))}
      </Box>
    );
  }
  if (sketches.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={<AutoStoriesOutlinedIcon />} />;
  }
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 1 }}>
        {sketches.map((s) => (
          <Box
            key={s.id}
            component={Link}
            href={hrefFor(s)}
            aria-label={`Sketch from ${new Date(s.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`}
            sx={{
              position: 'relative', display: 'block', aspectRatio: '1', borderRadius: 1.5, overflow: 'hidden',
              bgcolor: 'action.hover', minWidth: 0,
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <Box
              component="img"
              src={s.thumbnail_url || s.original_image_url}
              alt=""
              loading="lazy"
              width={400}
              height={400}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {s.featured.length > 0 && (
              <Box sx={{ position: 'absolute', top: 6, left: 6, bgcolor: 'warning.main', color: 'warning.contrastText', borderRadius: 1, px: 0.5, display: 'flex', alignItems: 'center' }} aria-label="Featured in class">
                <StarOutlinedIcon sx={{ fontSize: 16 }} />
              </Box>
            )}
          </Box>
        ))}
      </Box>
      {onLoadOlder && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button variant="outlined" onClick={onLoadOlder} sx={{ minHeight: 48 }}>Load older</Button>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Tap a sketch to open it.
      </Typography>
    </>
  );
}
```

`ThenAndNowCard.tsx`:

```tsx
'use client';

import { Box, Paper, Typography } from '@neram/ui';
import type { SketchbookSketchRow } from '@neram/database/queries/nexus';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** First sketch beside the latest. Shown only when the engine says growth is visible (8+ sketches, 30+ days). */
export default function ThenAndNowCard({ first, latest }: { first: SketchbookSketchRow; latest: SketchbookSketchRow }) {
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Typography variant="overline" color="text.secondary">Then and now</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
        {[{ label: 'Then', s: first }, { label: 'Now', s: latest }].map(({ label, s }) => (
          <Box key={label}>
            <Box component="img" src={s.thumbnail_url || s.original_image_url} alt={`${label}, ${fmt(s.submitted_at)}`} loading="lazy" width={400} height={400}
              sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 1.5, display: 'block' }} />
            <Typography variant="caption" color="text.secondary">{label}, {fmt(s.submitted_at)}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
```

- [ ] **Step 6: `AddSketchSheet.tsx`**

```tsx
'use client';

import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { addSketchBody } from './sketchbook-api';

interface AddSketchSheetProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

/** The drawing module's sheet, in sketchbook clothes: one photo, one optional line, a thumbnail. */
export default function AddSketchSheet({ open, onClose, onAdded }: AddSketchSheetProps) {
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
      submitBody={addSketchBody}
      title="Add a sketch"
      noteLabel="One line about this sketch (optional)"
      notePlaceholder="What did you draw, or what did you try?"
      noteMaxLength={80}
      submitLabel="Add to sketchbook"
    />
  );
}
```

- [ ] **Step 7: `SketchbookView.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import {
  Box, Fab, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Switch, Typography, useMediaQuery, useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import RhythmCard from './RhythmCard';
import SketchGrid, { type GridSketch } from './SketchGrid';
import ThenAndNowCard from './ThenAndNowCard';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';
import { istDate, weekStart, daysBetween } from '@/lib/sketchbook-rhythm';

interface SketchbookViewProps {
  payload: SketchbookPayload | null;
  loading: boolean;
  mode: 'own' | 'teacher';
  hrefFor: (s: GridSketch) => string;
  month: string;
  onMonthChange: (month: string) => void;
  onAdd?: () => void;
  onOptOutChange?: (optOut: boolean) => Promise<void>;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The sketchbook home, shared by the student's own page and the teacher's peek. */
export default function SketchbookView({
  payload, loading, mode, hrefFor, month, onMonthChange, onAdd, onOptOutChange,
}: SketchbookViewProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [menuEl, setMenuEl] = useState<null | HTMLElement>(null);
  const [savingOptOut, setSavingOptOut] = useState(false);

  const todayIndex = useMemo(() => {
    const today = istDate(new Date());
    return daysBetween(weekStart(today), today);
  }, []);

  const thisMonth = istDate(new Date()).slice(0, 7);
  const canGoNewer = month < thisMonth;

  return (
    <Box>
      <RhythmCard rhythm={payload?.rhythm ?? null} loading={loading} todayIndex={todayIndex} />
      {payload?.thenAndNow && <ThenAndNowCard first={payload.thenAndNow.first} latest={payload.thenAndNow.latest} />}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, minHeight: 48 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton aria-label="Older month" onClick={() => onMonthChange(shiftMonth(month, -1))} sx={{ width: 48, height: 48 }}>
            <Box component="span" aria-hidden sx={{ fontSize: 20 }}>{'‹'}</Box>
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {monthLabel(month)}
            {payload && !loading && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {payload.sketches.length} {payload.sketches.length === 1 ? 'sketch' : 'sketches'}, {payload.practiceDaysThisMonth} practice {payload.practiceDaysThisMonth === 1 ? 'day' : 'days'}
              </Typography>
            )}
          </Typography>
          <IconButton aria-label="Newer month" disabled={!canGoNewer} onClick={() => onMonthChange(shiftMonth(month, 1))} sx={{ width: 48, height: 48 }}>
            <Box component="span" aria-hidden sx={{ fontSize: 20 }}>{'›'}</Box>
          </IconButton>
        </Box>
        {mode === 'own' && onOptOutChange && (
          <>
            <IconButton aria-label="Sketchbook options" onClick={(e) => setMenuEl(e.currentTarget)} sx={{ width: 48, height: 48 }}>
              <MoreVertIcon />
            </IconButton>
            <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)}>
              <MenuItem
                disabled={savingOptOut || !payload}
                onClick={async () => {
                  if (!payload) return;
                  setSavingOptOut(true);
                  try { await onOptOutChange(!payload.featureOptOut); } finally { setSavingOptOut(false); }
                }}
                sx={{ minHeight: 48 }}
              >
                <ListItemIcon><VisibilityOffOutlinedIcon /></ListItemIcon>
                <ListItemText primary="Do not feature my sketches" secondary="Teachers can still see them." />
                <Switch edge="end" checked={!!payload?.featureOptOut} inputProps={{ 'aria-label': 'Do not feature my sketches' }} />
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>

      <SketchGrid
        sketches={payload?.sketches ?? []}
        hrefFor={hrefFor}
        loading={loading}
        emptyTitle={mode === 'own' ? 'Your sketchbook is empty' : 'No sketches this month'}
        emptyDescription={mode === 'own' ? 'Draw anything for ten minutes and add it here. Small sketches count.' : 'Try an older month, or check back after the next class.'}
      />

      {mode === 'own' && onAdd && (
        <Fab
          color="primary"
          variant={isDesktop ? 'extended' : 'circular'}
          aria-label="Add a sketch"
          onClick={onAdd}
          sx={{ position: 'fixed', right: 16, bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 24 }, minWidth: 56, minHeight: 56 }}
        >
          <AddIcon sx={{ mr: isDesktop ? 1 : 0 }} />
          {isDesktop ? 'Add a sketch' : null}
        </Fab>
      )}
    </Box>
  );
}
```

- [ ] **Step 8: `SketchPageView.tsx`**

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Typography,
} from '@neram/ui';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CommentSection from '@/components/drawings/CommentSection';
import PageHeader from '@/components/PageHeader';
import { REACTION_LABEL } from '@/lib/sketchbook-messages';
import type { GridSketch } from './SketchGrid';

interface SketchPageViewProps {
  sketch: GridSketch;
  mode: 'own' | 'teacher';
  backHref: string;
  getToken: () => Promise<string | null>;
  onDelete?: () => Promise<void>;
  /** Teacher-side actions (react, feature), rendered under the image. */
  actions?: ReactNode;
  studentName?: string | null;
}

const fmtLong = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function SketchPageView({ sketch, mode, backHref, getToken, onDelete, actions, studentName }: SketchPageViewProps) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canDelete = mode === 'own' && !!onDelete && sketch.featured.length === 0;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title={studentName ? `${studentName}'s sketch` : 'Sketch'} subtitle={fmtLong(sketch.submitted_at)} backHref={backHref} />

      <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider', mb: 2 }}>
        <Box component="img" src={sketch.original_image_url} alt={sketch.self_note || 'Sketch'} sx={{ width: '100%', height: 'auto', display: 'block', maxHeight: '70vh', objectFit: 'contain', bgcolor: 'action.hover' }} />
      </Paper>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
        {sketch.featured.map((f) => (
          <Chip key={f.classroom_id} icon={<StarOutlinedIcon />} color="warning" label={`Featured in ${f.classroom_name}`} sx={{ height: 36 }} />
        ))}
        {sketch.reaction && <Chip label={`${REACTION_LABEL[sketch.reaction]} from your teacher`} color="primary" variant="outlined" sx={{ height: 36 }} />}
        {sketch.seenBy && <Chip label={`Seen by ${sketch.seenBy.name?.split(' ')[0] || 'your teacher'}`} variant="outlined" sx={{ height: 36 }} />}
      </Box>

      {sketch.self_note && <Typography variant="body1" sx={{ mb: 2 }}>{sketch.self_note}</Typography>}

      {actions}

      <CommentSection submissionId={sketch.id} getToken={getToken} canComment />

      {canDelete && (
        <>
          <Button startIcon={<DeleteOutlineIcon />} color="error" variant="text" onClick={() => setConfirm(true)} sx={{ mt: 3, minHeight: 48 }}>
            Delete this sketch
          </Button>
          <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="delete-sketch-title">
            <DialogTitle id="delete-sketch-title">Delete this sketch?</DialogTitle>
            <DialogContent>
              <Box component="img" src={sketch.thumbnail_url || sketch.original_image_url} alt="" sx={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 1.5, display: 'block', mb: 1 }} />
              <Typography variant="body2">It leaves your sketchbook and your practice day is recounted. This cannot be undone.</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirm(false)} sx={{ minHeight: 48 }}>Keep it</Button>
              <Button color="error" variant="contained" disabled={deleting} sx={{ minHeight: 48 }}
                onClick={async () => { setDeleting(true); try { await onDelete!(); } finally { setDeleting(false); setConfirm(false); } }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      {mode === 'own' && sketch.featured.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          A featured sketch stays in your sketchbook. Ask your teacher if you want it un-featured.
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 9: Run the component tests, type-check, commit**

```bash
pnpm test:run apps/nexus/src/components/sketchbook
pnpm --filter @neram/nexus type-check
git add apps/nexus/src/components/sketchbook
git commit -m "feat(nexus): sketchbook student components"
```

---

### Task 12: Student pages and the dashboard card

**Files:**
- Create: `apps/nexus/src/app/(student)/student/sketchbook/page.tsx`
- Create: `apps/nexus/src/app/(student)/student/sketchbook/[id]/page.tsx`
- Create: `apps/nexus/src/components/sketchbook/SketchbookHomeCard.tsx`
- Modify: `apps/nexus/src/app/(student)/student/dashboard/page.tsx` (imports near line 27; the slot right before the `{/* ── Progress Stats` comment near line 492)
- Test: `apps/nexus/src/components/sketchbook/SketchbookHomeCard.test.tsx`

**Interfaces:**
- Consumes: Task 11 components, `useAuthSWR`, `useNexusAuthContext`, `PageHeader`, `deleteSketch`, `setOptOut`.
- Produces: routes `/student/sketchbook`, `/student/sketchbook/[id]`; `SketchbookHomeCard()` (self-fetching, renders nothing when the flag is off).

- [ ] **Step 1: Write the failing card test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const swr = vi.fn();
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...args: unknown[]) => swr(...args) }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ isFeatureEnabled: (id: string) => id === 'student.sketchbook' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import SketchbookHomeCard from './SketchbookHomeCard';

describe('SketchbookHomeCard', () => {
  it('invites a student with no sketches', () => {
    swr.mockReturnValue({ data: { rhythm: { week: { days: Array(7).fill(false), count: 0, goal: 3, met: false, start: '2026-09-07' }, run: 0, bestRun: 0, totalDays: 0, lastPracticeDate: null, quietDays: null } }, isLoading: false });
    render(<SketchbookHomeCard />);
    expect(screen.getByText('Draw something today')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open sketchbook/i }).getAttribute('href')).toBe('/student/sketchbook');
  });
  it('shows the week when there is a rhythm', () => {
    swr.mockReturnValue({ data: { rhythm: { week: { days: [true, true, false, false, false, false, false], count: 2, goal: 3, met: false, start: '2026-09-07' }, run: 1, bestRun: 1, totalDays: 5, lastPracticeDate: '2026-09-08', quietDays: 1 } }, isLoading: false });
    render(<SketchbookHomeCard />);
    expect(screen.getByText('2 of 3 days this week.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm test:run apps/nexus/src/components/sketchbook/SketchbookHomeCard.test.tsx
```

Expected: FAIL, module not found.

- [ ] **Step 3: `SketchbookHomeCard.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { Box, Button, Paper, Skeleton, Typography } from '@neram/ui';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import RhythmDots from './RhythmDots';
import { rhythmLine, type Rhythm } from '@/lib/sketchbook-rhythm';

/**
 * The dashboard's door to the sketchbook. Self-fetching (summary only) so the
 * 900-line dashboard fetch stays untouched, and gone entirely when the flag is
 * off so nothing on the dashboard points at a page FeatureGate would refuse.
 */
export default function SketchbookHomeCard() {
  const { isFeatureEnabled } = useNexusAuthContext();
  const enabled = isFeatureEnabled('student.sketchbook');
  const { data, isLoading } = useAuthSWR<{ rhythm: Rhythm }>(enabled ? '/api/sketchbook/me?summary=1' : null);
  if (!enabled) return null;
  if (isLoading || !data) return <Skeleton variant="rounded" height={96} sx={{ borderRadius: 2, mb: 2 }} />;

  const r = data.rhythm;
  const fresh = r.totalDays === 0;
  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <AutoStoriesOutlinedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Sketchbook</Typography>
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 600 }}>
        {fresh ? 'Draw something today' : rhythmLine(r)}
      </Typography>
      {!fresh && <RhythmDots days={r.week.days} size={14} />}
      <Button component={Link} href="/student/sketchbook" variant={fresh ? 'contained' : 'text'} sx={{ mt: 1, minHeight: 48 }}>
        {fresh ? 'Open sketchbook' : 'Open sketchbook'}
      </Button>
    </Paper>
  );
}
```

- [ ] **Step 4: Mount the card on the dashboard**

In `dashboard/page.tsx` add the import next to the other component imports:

```tsx
import SketchbookHomeCard from '@/components/sketchbook/SketchbookHomeCard';
```

Directly above the `{/* ── Progress Stats: Horizontal scroll on mobile, Grid on desktop ── */}` comment, add:

```tsx
      {/* ── Sketchbook: today's practice, one tap away ── */}
      <SketchbookHomeCard />
```

- [ ] **Step 5: `/student/sketchbook/page.tsx`**

```tsx
'use client';

import { useCallback, useState } from 'react';
import { Box } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchbookView from '@/components/sketchbook/SketchbookView';
import AddSketchSheet from '@/components/sketchbook/AddSketchSheet';
import { setOptOut } from '@/components/sketchbook/sketchbook-api';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { istDate } from '@/lib/sketchbook-rhythm';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export default function StudentSketchbookPage() {
  const { getToken } = useNexusAuthContext();
  const [month, setMonth] = useState(() => istDate(new Date()).slice(0, 7));
  const [adding, setAdding] = useState(false);
  const { data, isLoading, mutate } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/me?month=${month}`);

  const onOptOutChange = useCallback(async (optOut: boolean) => {
    await setOptOut(getToken, optOut);
    await mutate();
  }, [getToken, mutate]);

  return (
    <Box sx={{ pb: 10 }}>
      <PageHeader title="Sketchbook" subtitle="Draw often. Small sketches count." backHref="/student/dashboard" />
      <SketchbookView
        payload={data ?? null}
        loading={isLoading}
        mode="own"
        month={month}
        onMonthChange={setMonth}
        hrefFor={(s) => `/student/sketchbook/${s.id}`}
        onAdd={() => setAdding(true)}
        onOptOutChange={onOptOutChange}
      />
      <AddSketchSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          setMonth(istDate(new Date()).slice(0, 7));
          void mutate();
        }}
      />
    </Box>
  );
}
```

- [ ] **Step 6: `/student/sketchbook/[id]/page.tsx`**

The sketch page reads the month payload that contains the sketch (its month comes from the id's `submitted_at`, which we do not know until fetched), so it uses a small dedicated lookup: `GET /api/sketchbook/me?month=<m>` after a first fetch of the sketch's own row. To keep one round trip, add a query param the `me` route already tolerates: `?sketch=<id>` returning the month that holds it. Implement that in `me/route.ts` by adding, before the month parse:

```ts
    const sketchId = request.nextUrl.searchParams.get('sketch');
    let monthParam = request.nextUrl.searchParams.get('month');
    if (sketchId) {
      const row = await getSketchbookSketch(sketchId);
      if (!row || row.student_id !== caller.id) throw new ApiError('Sketch not found', 404);
      monthParam = istDate(row.submitted_at).slice(0, 7);
    }
    const month = monthParam || today.slice(0, 7);
```

(and import `getSketchbookSketch` from `@neram/database/queries/nexus`). Then the page:

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { Box, Skeleton, EmptyState } from '@neram/ui';
import SketchPageView from '@/components/sketchbook/SketchPageView';
import { deleteSketch } from '@/components/sketchbook/sketchbook-api';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export default function StudentSketchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const { data, isLoading, error } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/me?sketch=${id}`);
  const sketch = data?.sketches.find((s) => s.id === id) ?? null;

  if (isLoading) return <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />;
  if (error || !sketch) {
    return <EmptyState title="Sketch not found" description="It may have been deleted." />;
  }
  return (
    <Box>
      <SketchPageView
        sketch={sketch}
        mode="own"
        backHref="/student/sketchbook"
        getToken={getToken}
        onDelete={async () => {
          await deleteSketch(getToken, sketch.id);
          router.push('/student/sketchbook');
        }}
      />
    </Box>
  );
}
```

- [ ] **Step 7: Type-check, run the card test, walk it in the browser**

```bash
pnpm test:run apps/nexus/src/components/sketchbook/SketchbookHomeCard.test.tsx
pnpm --filter @neram/nexus type-check
```

Then with `pnpm dev:nexus` running, switch `student.sketchbook` on at `/teacher/admin/features`, sign in as the E2E student (or use View-as-Student), open `/student/dashboard`: the card shows "Draw something today". Open `/student/sketchbook`, add a photo, confirm the toast, the tile and "1 of 3 days this week.". Check at 375px: no horizontal scroll, FAB clear of the bottom bar.

- [ ] **Step 8: Commit**

```bash
git add "apps/nexus/src/app/(student)/student/sketchbook" apps/nexus/src/components/sketchbook/SketchbookHomeCard.tsx apps/nexus/src/components/sketchbook/SketchbookHomeCard.test.tsx "apps/nexus/src/app/(student)/student/dashboard/page.tsx" apps/nexus/src/app/api/sketchbook/me/route.ts
git commit -m "feat(nexus): student sketchbook pages and dashboard card"
```

---

### Task 13: Teacher flip-through, reactions, feature sheet, class rhythm, weekly goal

**Files:**
- Create: `apps/nexus/src/components/sketchbook/TeacherSketchActions.tsx`
- Create: `apps/nexus/src/components/sketchbook/FeatureSheet.tsx`
- Create: `apps/nexus/src/components/sketchbook/FlipThrough.tsx`
- Create: `apps/nexus/src/components/sketchbook/ClassRhythmList.tsx`
- Create: `apps/nexus/src/components/sketchbook/WeeklyGoalSheet.tsx`
- Create: `apps/nexus/src/app/(teacher)/teacher/sketchbook/page.tsx`
- Test: `apps/nexus/src/components/sketchbook/FlipThrough.test.tsx`, `apps/nexus/src/components/sketchbook/ClassRhythmList.test.tsx`

**Interfaces:**
- Consumes: Task 11 (`RhythmDots`, `sketchbook-api.ts`), `SketchbookInboxRow` (Task 4), `useStudentStageFacts` + `StudentStageAvatar` (`@/components/students/*`), `PeopleSearchField`, `useNexusAuthContext` (`classrooms`, `activeClassroom`, `impersonation`, `getToken`), `useNavBadges().refreshBadges`.
- Produces:
  - `TeacherSketchActions({ sketchId, studentId, reaction, featured, selfNote, onChanged })` (reaction chips, Feature / Un-feature buttons, owns its `FeatureSheet`)
  - `FeatureSheet({ open, onClose, sketchId, defaultCaption, onFeatured })`
  - `FlipThrough({ classroomId })`
  - `ClassRhythmList({ classroomId })`
  - `WeeklyGoalSheet({ open, onClose, classroomId, goal, onSaved })`
  - route `/teacher/sketchbook`

- [ ] **Step 1: Write the failing tests**

`FlipThrough.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const swr = vi.fn();
const api = { flipSketch: vi.fn(async () => ({ ok: true })), reactToSketch: vi.fn(async () => ({ reaction: 'fire' })), featureSketch: vi.fn(), unfeatureSketch: vi.fn() };
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('./sketchbook-api', () => api);
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 't', classrooms: [{ id: 'c1', name: 'Class 1' }], activeClassroom: { id: 'c1', name: 'Class 1' }, impersonation: null }) }));
vi.mock('@/components/NavBadgeProvider', () => ({ useNavBadges: () => ({ refreshBadges: vi.fn(), getBadgeCount: () => 0 }) }));
vi.mock('@/components/students/StudentStageFactsProvider', () => ({ useStudentStageFacts: () => ({ factsFor: () => null, ready: true }) }));

import FlipThrough from './FlipThrough';

const row = (id: string) => ({
  id, student_id: 's1', original_image_url: `https://x/${id}.jpg`, thumbnail_url: null, self_note: 'a chair',
  reaction: null, submitted_at: '2026-09-09T10:00:00.000Z', is_gallery_visible: false,
  student: { id: 's1', name: 'Asha Rao', avatar_url: null, ms_oid: null },
});

describe('FlipThrough', () => {
  beforeEach(() => { api.flipSketch.mockClear(); api.reactToSketch.mockClear(); });

  it('shows the first sketch with the student name and three reaction buttons', () => {
    swr.mockReturnValue({ data: { sketches: [row('a'), row('b')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Great' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wow' })).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('records a skip and advances on Next', async () => {
    swr.mockReturnValue({ data: { sketches: [row('a'), row('b')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(api.flipSketch).toHaveBeenCalledWith(expect.any(Function), 'a', 'skipped'));
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });

  it('sends a reaction and shows it as sent', async () => {
    swr.mockReturnValue({ data: { sketches: [row('a')], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Great' }));
    await waitFor(() => expect(api.reactToSketch).toHaveBeenCalledWith(expect.any(Function), 'a', 'fire', undefined));
    expect(screen.getByText('Sent Great')).toBeTruthy();
  });

  it('says when everything has been flipped', () => {
    swr.mockReturnValue({ data: { sketches: [], remaining: 0 }, isLoading: false, mutate: vi.fn() });
    render(<FlipThrough classroomId="c1" />);
    expect(screen.getByText('You have flipped through everything.')).toBeTruthy();
  });
});
```

`ClassRhythmList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const swr = vi.fn();
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 't' }) }));
vi.mock('@/components/students/StudentStageFactsProvider', () => ({ useStudentStageFacts: () => ({ factsFor: () => null, ready: true }) }));

import ClassRhythmList from './ClassRhythmList';

const student = (id: string, name: string, quietDays: number | null, count = 0) => ({
  userId: id, name, avatarUrl: null, msOid: null, dormant: false,
  week: [count > 0, count > 1, false, false, false, false, false], count, run: 0, lastPracticeDate: quietDays === null ? null : '2026-09-01', quietDays,
});

describe('ClassRhythmList', () => {
  it('sorts the quiet ones first and shows the goal row', () => {
    swr.mockReturnValue({ data: { goal: 3, students: [student('a', 'Asha', 0, 2), student('b', 'Bala', null), student('c', 'Charu', 9)] }, isLoading: false, mutate: vi.fn() });
    render(<ClassRhythmList classroomId="c1" />);
    const names = screen.getAllByTestId('rhythm-row-name').map((n) => n.textContent);
    expect(names).toEqual(['Bala', 'Charu', 'Asha']);
    expect(screen.getByText('Weekly goal: 3 days')).toBeTruthy();
    expect(screen.getByText('No sketches in 8 weeks')).toBeTruthy();
    expect(screen.getByText('Quiet 9 days')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
pnpm test:run apps/nexus/src/components/sketchbook/FlipThrough.test.tsx apps/nexus/src/components/sketchbook/ClassRhythmList.test.tsx
```

Expected: FAIL, modules not found.

- [ ] **Step 3: `FeatureSheet.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import {
  Box, Button, Drawer, FormControl, InputLabel, MenuItem, Select, TextField, Typography, Alert,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { featureSketch } from './sketchbook-api';

interface FeatureSheetProps {
  open: boolean;
  onClose: () => void;
  sketchId: string;
  defaultCaption: string;
  onFeatured: () => void;
}

/**
 * Bottom sheet: pick the classroom, edit the caption, confirm. The server
 * re-checks that both teacher and student are in the classroom, so the list
 * here is only the teacher's own classrooms and a wrong pick reads as a clear
 * error rather than a silent post.
 */
export default function FeatureSheet({ open, onClose, sketchId, defaultCaption, onFeatured }: FeatureSheetProps) {
  const { getToken, classrooms, activeClassroom, impersonation } = useNexusAuthContext();
  const [classroomId, setClassroomId] = useState(activeClassroom?.id ?? classrooms[0]?.id ?? '');
  const [caption, setCaption] = useState(defaultCaption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ channel: boolean; chat: boolean; errors: string[] } | null>(null);

  useEffect(() => { if (open) { setCaption(defaultCaption); setError(''); setResult(null); } }, [open, defaultCaption]);

  const blocked = impersonation ? 'Featuring posts to Teams from your own Microsoft account, so it is off while viewing as a student.' : '';

  return (
    <Drawer anchor="bottom" open={open} onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))', maxHeight: '85vh' } }}>
      <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 2 }} aria-hidden />
      <Typography variant="h6" sx={{ mb: 0.5 }}>Feature to class</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Posts to the class group chat and channel, and tells the student.
      </Typography>

      {blocked && <Alert severity="info" sx={{ mb: 2 }}>{blocked}</Alert>}

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="feature-classroom">Classroom</InputLabel>
        <Select labelId="feature-classroom" label="Classroom" value={classroomId} onChange={(e) => setClassroomId(String(e.target.value))} sx={{ minHeight: 48 }}>
          {classrooms.map((c) => <MenuItem key={c.id} value={c.id} sx={{ minHeight: 48 }}>{c.name}</MenuItem>)}
        </Select>
      </FormControl>

      <TextField label="Caption" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 120))} fullWidth multiline rows={2}
        helperText={`${caption.length}/120. Shown under the sketch in Teams.`} sx={{ mb: 2 }} />

      {result && (
        <Alert severity={result.errors.length ? 'warning' : 'success'} sx={{ mb: 2 }}>
          {result.channel || result.chat ? `Posted to ${[result.channel && 'the channel', result.chat && 'the group chat'].filter(Boolean).join(' and ')}.` : 'Featured in Nexus.'}
          {result.errors.length > 0 && ` Teams said: ${result.errors.join('; ')}`}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>{result ? 'Done' : 'Cancel'}</Button>
        {!result && (
          <Button variant="contained" disabled={busy || !classroomId || !!blocked} sx={{ minHeight: 48 }}
            onClick={async () => {
              setBusy(true); setError('');
              try {
                const r = await featureSketch(getToken, sketchId, classroomId, caption.trim());
                setResult(r.teams);
                onFeatured();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not feature the sketch');
              } finally { setBusy(false); }
            }}>
            {busy ? 'Posting...' : 'Feature to class'}
          </Button>
        )}
      </Box>
    </Drawer>
  );
}
```

- [ ] **Step 4: `TeacherSketchActions.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Box, Button, Chip, TextField, Typography } from '@neram/ui';
import StarOutlinedIcon from '@mui/icons-material/StarOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import type { SketchbookReaction } from '@neram/database/types';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { REACTION_LABEL } from '@/lib/sketchbook-messages';
import type { SketchbookFeatureFact } from '@neram/database/queries/nexus';
import { reactToSketch, unfeatureSketch } from './sketchbook-api';
import FeatureSheet from './FeatureSheet';

const ICONS: Record<SketchbookReaction, React.ReactNode> = {
  heart: <FavoriteBorderOutlinedIcon />,
  fire: <LocalFireDepartmentOutlinedIcon />,
  wow: <AutoAwesomeOutlinedIcon />,
};
const ORDER: SketchbookReaction[] = ['heart', 'fire', 'wow'];

interface TeacherSketchActionsProps {
  sketchId: string;
  reaction: SketchbookReaction | null;
  featured: SketchbookFeatureFact[];
  selfNote: string | null;
  /** Called after any change so the parent can refetch. */
  onChanged: (change: { reaction?: SketchbookReaction | null; featured?: boolean }) => void;
  /** Compact: no comment box (used inside the flip card). */
  compact?: boolean;
}

export default function TeacherSketchActions({ sketchId, reaction, featured, selfNote, onChanged, compact = false }: TeacherSketchActionsProps) {
  const { getToken } = useNexusAuthContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState<SketchbookReaction | null>(null);
  const [featureOpen, setFeatureOpen] = useState(false);
  const [error, setError] = useState('');
  const live = featured[0];

  const react = async (r: SketchbookReaction) => {
    setBusy(r); setError('');
    try {
      await reactToSketch(getToken, sketchId, r, comment.trim() || undefined);
      setSent(r); setComment('');
      onChanged({ reaction: r });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send'); } finally { setBusy(null); }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {ORDER.map((r) => (
          <Button key={r} variant={(sent ?? reaction) === r ? 'contained' : 'outlined'} startIcon={ICONS[r]} disabled={busy !== null}
            onClick={() => react(r)} aria-label={REACTION_LABEL[r]} sx={{ minHeight: 48, minWidth: 96 }}>
            {REACTION_LABEL[r]}
          </Button>
        ))}
        {live ? (
          <Button variant="text" color="warning" startIcon={<StarOutlinedIcon />} disabled={busy !== null} sx={{ minHeight: 48 }}
            onClick={async () => {
              setBusy('unfeature'); setError('');
              try { await unfeatureSketch(getToken, sketchId, live.classroom_id); onChanged({ featured: false }); }
              catch (e) { setError(e instanceof Error ? e.message : 'Could not un-feature'); } finally { setBusy(null); }
            }}>
            Un-feature
          </Button>
        ) : (
          <Button variant="text" startIcon={<StarBorderOutlinedIcon />} disabled={busy !== null} onClick={() => setFeatureOpen(true)} sx={{ minHeight: 48 }}>
            Feature
          </Button>
        )}
      </Box>
      {sent && <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>Sent {REACTION_LABEL[sent]}</Typography>}
      {live && <Chip size="small" icon={<StarOutlinedIcon />} color="warning" label={`Featured in ${live.classroom_name}`} sx={{ mt: 1 }} />}
      {!compact && (
        <TextField label="Add a line (optional, sent with your reaction)" value={comment} onChange={(e) => setComment(e.target.value.slice(0, 300))}
          fullWidth size="small" sx={{ mt: 1.5 }} inputProps={{ 'aria-label': 'Comment' }} />
      )}
      {error && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{error}</Typography>}
      <FeatureSheet open={featureOpen} onClose={() => setFeatureOpen(false)} sketchId={sketchId} defaultCaption={selfNote || ''}
        onFeatured={() => onChanged({ featured: true })} />
    </Box>
  );
}
```

- [ ] **Step 5: `FlipThrough.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Paper, Skeleton, Typography, EmptyState } from '@neram/ui';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import type { SketchbookInboxRow } from '@neram/database/queries/nexus';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import type { StageKey } from '@/lib/student-stage';
import { flipSketch } from './sketchbook-api';
import TeacherSketchActions from './TeacherSketchActions';

const SEEN_AFTER_MS = 1500;

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/**
 * One sketch per screen. Buttons are the contract; arrow keys and 1/2/3 are
 * conveniences. A card on screen for 1.5 s is "seen" (the physical peek);
 * Next without a reaction is "skipped". The server never downgrades seen.
 */
export default function FlipThrough({ classroomId }: { classroomId: string }) {
  const { getToken } = useNexusAuthContext();
  const { refreshBadges } = useNavBadges();
  const { factsFor } = useStudentStageFacts();
  const { data, isLoading, mutate } = useAuthSWR<{ sketches: SketchbookInboxRow[]; remaining: number }>(
    `/api/sketchbook/inbox?classroom=${encodeURIComponent(classroomId)}`,
  );
  const [index, setIndex] = useState(0);
  const [local, setLocal] = useState<Record<string, { reaction?: string | null; featured?: boolean }>>({});
  const seenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const list = data?.sketches ?? [];
  const current = list[index] ?? null;

  useEffect(() => {
    if (!current) return;
    if (seenTimer.current) clearTimeout(seenTimer.current);
    seenTimer.current = setTimeout(() => { void flipSketch(getToken, current.id, 'seen'); }, SEEN_AFTER_MS);
    return () => { if (seenTimer.current) clearTimeout(seenTimer.current); };
  }, [current, getToken]);

  const next = useCallback(async () => {
    if (!current) return;
    if (!local[current.id]?.reaction) await flipSketch(getToken, current.id, 'skipped').catch(() => {});
    if (index + 1 >= list.length) {
      setIndex(0);
      await mutate();
    } else {
      setIndex(index + 1);
    }
    refreshBadges();
  }, [current, getToken, index, list.length, local, mutate, refreshBadges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); void next(); }
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); setIndex(index - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, next]);

  if (isLoading || !data) {
    return <Skeleton variant="rounded" sx={{ height: 'min(70vh, 560px)', borderRadius: 2 }} />;
  }
  if (!current) {
    return (
      <EmptyState icon={<DoneAllOutlinedIcon />} title="You have flipped through everything."
        description="New sketches appear here as students add them." action={<Button onClick={() => mutate()} sx={{ minHeight: 48 }}>Check again</Button>} />
    );
  }

  const fact = factsFor(current.student.id);
  const stage = ((fact?.stage as StageKey) || 'unset') as StageKey;
  const state = local[current.id] || {};

  return (
    <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 'min(70vh, 640px)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
        <StudentStageAvatar stage={stage} dormant={!!fact?.dormant} name={current.student.name} msOid={current.student.ms_oid} fallbackSrc={current.student.avatar_url} size={40} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>{current.student.name || 'Student'}</Typography>
          <Typography variant="caption" color="text.secondary">{fmt(current.submitted_at)}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" aria-live="polite">{index + 1} of {list.length + (data.remaining || 0)}</Typography>
      </Box>

      <Box sx={{ flex: 1, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <Box component="img" src={current.original_image_url} alt={current.self_note || `Sketch by ${current.student.name || 'student'}`}
          sx={{ maxWidth: '100%', maxHeight: 'min(56vh, 520px)', objectFit: 'contain', display: 'block' }} />
      </Box>

      {current.self_note && <Typography variant="body2" sx={{ px: 1.5, pt: 1.5 }}>{current.self_note}</Typography>}

      <Box sx={{ p: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))', position: 'sticky', bottom: 0, bgcolor: 'background.paper' }}>
        <TeacherSketchActions
          compact
          sketchId={current.id}
          reaction={(state.reaction as never) ?? current.reaction}
          featured={state.featured ? [{ classroom_id: classroomId, classroom_name: 'this class', featured_at: new Date().toISOString() }] : []}
          selfNote={current.self_note}
          onChanged={(c) => setLocal((m) => ({ ...m, [current.id]: { ...m[current.id], ...c } }))}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Button variant="text" disabled={index === 0} onClick={() => setIndex(index - 1)} sx={{ minHeight: 48 }}>Previous</Button>
          <Button variant="contained" onClick={() => next()} sx={{ minHeight: 48, minWidth: 120 }}>Next</Button>
        </Box>
      </Box>
    </Paper>
  );
}
```

- [ ] **Step 6: `WeeklyGoalSheet.tsx` and `ClassRhythmList.tsx`**

`WeeklyGoalSheet.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Box, Button, Drawer, ToggleButton, ToggleButtonGroup, Typography, Alert } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { setWeeklyGoal } from './sketchbook-api';

interface WeeklyGoalSheetProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  goal: number;
  onSaved: (goal: number) => void;
}

export default function WeeklyGoalSheet({ open, onClose, classroomId, goal, onSaved }: WeeklyGoalSheetProps) {
  const { getToken } = useNexusAuthContext();
  const [value, setValue] = useState(goal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setValue(goal); setError(''); } }, [open, goal]);

  return (
    <Drawer anchor="bottom" open={open} onClose={busy ? undefined : onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' } }}>
      <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 2 }} aria-hidden />
      <Typography variant="h6">Weekly goal</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Practice days a week for this class. Applies from this week. Past weeks keep their goal.
      </Typography>
      <ToggleButtonGroup exclusive value={value} onChange={(_, v) => { if (v) setValue(v); }} aria-label="Practice days a week" fullWidth sx={{ mb: 2 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => <ToggleButton key={n} value={n} sx={{ minHeight: 48 }} aria-label={`${n} days`}>{n}</ToggleButton>)}
      </ToggleButtonGroup>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>Cancel</Button>
        <Button variant="contained" disabled={busy || value === goal} sx={{ minHeight: 48 }}
          onClick={async () => {
            setBusy(true); setError('');
            try { const r = await setWeeklyGoal(getToken, classroomId, value); onSaved(r.goal); onClose(); }
            catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
          }}>
          {busy ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Drawer>
  );
}
```

`ClassRhythmList.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Chip, Paper, Skeleton, Typography, EmptyState } from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useAuthSWR } from '@/lib/nexus-swr';
import PeopleSearchField from '@/components/PeopleSearchField';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import type { StageKey } from '@/lib/student-stage';
import RhythmDots from './RhythmDots';
import WeeklyGoalSheet from './WeeklyGoalSheet';

interface RhythmStudent {
  userId: string; name: string | null; avatarUrl: string | null; msOid: string | null; dormant: boolean;
  week: boolean[]; count: number; run: number; lastPracticeDate: string | null; quietDays: number | null;
}

function quietLabel(s: RhythmStudent): string | null {
  if (s.quietDays === null) return 'No sketches in 8 weeks';
  if (s.quietDays >= 3) return `Quiet ${s.quietDays} days`;
  return null;
}

/** Quiet-first: the students a teacher is looking for are the ones who stopped. */
function quietFirst(a: RhythmStudent, b: RhythmStudent): number {
  const qa = a.quietDays === null ? Infinity : a.quietDays;
  const qb = b.quietDays === null ? Infinity : b.quietDays;
  if (qa !== qb) return qb - qa;
  return (a.name || '').localeCompare(b.name || '');
}

export default function ClassRhythmList({ classroomId }: { classroomId: string }) {
  const { data, isLoading, mutate } = useAuthSWR<{ goal: number; students: RhythmStudent[] }>(
    `/api/sketchbook/class-rhythm?classroom=${encodeURIComponent(classroomId)}`,
  );
  const { factsFor } = useStudentStageFacts();
  const [query, setQuery] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);

  const rows = useMemo(() => {
    const all = [...(data?.students ?? [])].sort(quietFirst);
    const q = query.trim().toLowerCase();
    return q ? all.filter((s) => (s.name || '').toLowerCase().includes(q)) : all;
  }, [data, query]);

  if (isLoading || !data) return <Skeleton variant="rounded" height={320} sx={{ borderRadius: 2 }} />;

  return (
    <Box>
      <Paper elevation={0} sx={{ p: 1.5, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Weekly goal: {data.goal} {data.goal === 1 ? 'day' : 'days'}</Typography>
        <Button startIcon={<EditOutlinedIcon />} onClick={() => setGoalOpen(true)} sx={{ minHeight: 48 }}>Edit</Button>
      </Paper>
      <PeopleSearchField value={query} onChange={setQuery} label="Find a student" resultCount={rows.length} sx={{ mb: 2 }} />

      {rows.length === 0 ? (
        <EmptyState title="No students match" description="Try a different name." />
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {rows.map((s) => {
            const fact = factsFor(s.userId);
            const stage = ((fact?.stage as StageKey) || 'unset') as StageKey;
            const quiet = quietLabel(s);
            return (
              <Box component="li" key={s.userId}>
                <Box component={Link} href={`/teacher/sketchbook/${s.userId}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64, px: 1, py: 1, borderBottom: 1, borderColor: 'divider', textDecoration: 'none', color: 'inherit', opacity: s.dormant ? 0.6 : 1,
                    '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 } }}>
                  <StudentStageAvatar stage={stage} dormant={s.dormant} name={s.name} msOid={s.msOid} fallbackSrc={s.avatarUrl} size={40} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap data-testid="rhythm-row-name">{s.name || 'Student'}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <RhythmDots days={s.week} size={12} />
                      {s.run > 1 && <Chip size="small" label={`${s.run} weeks running`} />}
                    </Box>
                  </Box>
                  {quiet && <Chip size="small" color={s.quietDays === null ? 'default' : 'warning'} label={quiet} />}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      <WeeklyGoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} classroomId={classroomId} goal={data.goal} onSaved={() => mutate()} />
    </Box>
  );
}
```

Note: `RhythmDots` at size 12 inside a row keeps its 48px-tall container; drop the `minHeight` for small sizes by passing the size through: in `RhythmDots`, change `minHeight: 48` to `minHeight: size >= 20 ? 48 : undefined` and hide the letters when `size < 16` (`{size >= 16 && (<Box component="span" ...>)}`).

- [ ] **Step 7: `/teacher/sketchbook/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useNavBadges } from '@/components/NavBadgeProvider';
import FlipThrough from '@/components/sketchbook/FlipThrough';
import ClassRhythmList from '@/components/sketchbook/ClassRhythmList';

export default function TeacherSketchbookPage() {
  const { activeClassroom } = useNexusAuthContext();
  const { getBadgeCount } = useNavBadges();
  const [tab, setTab] = useState<'flip' | 'rhythm'>('flip');
  const pending = getBadgeCount('/teacher/sketchbook');

  if (!activeClassroom) {
    return (
      <Box>
        <PageHeader title="Sketchbooks" backHref="/teacher/dashboard" />
        <Typography color="text.secondary">Pick a classroom from the top bar to flip through its sketchbooks.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title="Sketchbooks" subtitle={activeClassroom.name} backHref="/teacher/dashboard" />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 48 }} aria-label="Sketchbook views">
        <Tab value="flip" label={pending ? `Flip through (${pending})` : 'Flip through'} sx={{ minHeight: 48 }} />
        <Tab value="rhythm" label="Class rhythm" sx={{ minHeight: 48 }} />
      </Tabs>
      {tab === 'flip' ? <FlipThrough classroomId={activeClassroom.id} /> : <ClassRhythmList classroomId={activeClassroom.id} />}
    </Box>
  );
}
```

- [ ] **Step 8: Run the tests, type-check, commit**

```bash
pnpm test:run apps/nexus/src/components/sketchbook
pnpm --filter @neram/nexus type-check
git add apps/nexus/src/components/sketchbook "apps/nexus/src/app/(teacher)/teacher/sketchbook/page.tsx"
git commit -m "feat(nexus): teacher flip-through, reactions, feature sheet, class rhythm"
```

---

### Task 14: Teacher peek pages and the profile section

**Files:**
- Modify: `apps/nexus/src/app/api/sketchbook/students/[id]/route.ts` (add the `?sketch=` lookup exactly as Task 12 Step 6 added it to `me`)
- Create: `apps/nexus/src/app/(teacher)/teacher/sketchbook/[studentId]/page.tsx`
- Create: `apps/nexus/src/app/(teacher)/teacher/sketchbook/[studentId]/[sketchId]/page.tsx`
- Create: `apps/nexus/src/components/sketchbook/SketchbookSection.tsx`
- Modify: `apps/nexus/src/app/(teacher)/teacher/students/[id]/page.tsx` (nav array near line 286; render after `<WorkSection ... />` near line 353)

**Interfaces:**
- Consumes: `SketchbookView`, `SketchPageView`, `TeacherSketchActions`, `ProfileSection` (`@/components/students/profile/ProfileSection`, props `{ id, title, headline?, badge?, defaultExpanded?, onFirstOpen?, children }`), `useStudentStageFacts`.
- Produces: routes `/teacher/sketchbook/[studentId]` and `/teacher/sketchbook/[studentId]/[sketchId]`; `SketchbookSection({ studentId })`.

- [ ] **Step 1: Add `?sketch=` to the students route**

In `students/[id]/route.ts`, replace the month lines with:

```ts
    const sketchId = request.nextUrl.searchParams.get('sketch');
    let monthParam = request.nextUrl.searchParams.get('month');
    if (sketchId) {
      const row = await getSketchbookSketch(sketchId);
      if (!row || row.student_id !== params.id) throw new ApiError('Sketch not found', 404);
      monthParam = istDate(row.submitted_at).slice(0, 7);
    }
    const month = monthParam || today.slice(0, 7);
```

and import `getSketchbookSketch` from `@neram/database/queries/nexus`.

- [ ] **Step 2: `/teacher/sketchbook/[studentId]/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Box } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import SketchbookView from '@/components/sketchbook/SketchbookView';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import { istDate } from '@/lib/sketchbook-rhythm';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export default function TeacherStudentSketchbookPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { factsFor } = useStudentStageFacts();
  const [month, setMonth] = useState(() => istDate(new Date()).slice(0, 7));
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
        onMonthChange={setMonth}
        hrefFor={(s) => `/teacher/sketchbook/${studentId}/${s.id}`}
      />
    </Box>
  );
}
```

- [ ] **Step 3: `/teacher/sketchbook/[studentId]/[sketchId]/page.tsx`**

```tsx
'use client';

import { useParams } from 'next/navigation';
import { Box, Skeleton, EmptyState } from '@neram/ui';
import SketchPageView from '@/components/sketchbook/SketchPageView';
import TeacherSketchActions from '@/components/sketchbook/TeacherSketchActions';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

export default function TeacherSketchPage() {
  const { studentId, sketchId } = useParams<{ studentId: string; sketchId: string }>();
  const { getToken } = useNexusAuthContext();
  const { factsFor } = useStudentStageFacts();
  const { data, isLoading, error, mutate } = useAuthSWR<SketchbookPayload>(`/api/sketchbook/students/${studentId}?sketch=${sketchId}`);
  const sketch = data?.sketches.find((s) => s.id === sketchId) ?? null;

  if (isLoading) return <Skeleton variant="rounded" height={420} sx={{ borderRadius: 2 }} />;
  if (error || !sketch) return <EmptyState title="Sketch not found" description="It may have been deleted." />;

  return (
    <Box>
      <SketchPageView
        sketch={sketch}
        mode="teacher"
        backHref={`/teacher/sketchbook/${studentId}`}
        getToken={getToken}
        studentName={factsFor(studentId)?.name || null}
        actions={
          <TeacherSketchActions sketchId={sketch.id} reaction={sketch.reaction} featured={sketch.featured} selfNote={sketch.self_note} onChanged={() => mutate()} />
        }
      />
    </Box>
  );
}
```

- [ ] **Step 4: `SketchbookSection.tsx` and mount it on the profile**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Button, Skeleton } from '@neram/ui';
import ProfileSection from '@/components/students/profile/ProfileSection';
import RhythmCard from './RhythmCard';
import SketchGrid from './SketchGrid';
import { useAuthSWR } from '@/lib/nexus-swr';
import { daysBetween, istDate, weekStart } from '@/lib/sketchbook-rhythm';
import type { SketchbookPayload } from '@/lib/sketchbook-payload';

/** The peek from a student's profile: this week, six recent tiles, one door. Fetches only once opened. */
export default function SketchbookSection({ studentId }: { studentId: string }) {
  const [opened, setOpened] = useState(false);
  const { data, isLoading } = useAuthSWR<SketchbookPayload>(opened ? `/api/sketchbook/students/${studentId}` : null);
  const today = istDate(new Date());
  const headline = data ? `${data.rhythm.week.count} of ${data.goal} this week` : null;

  return (
    <ProfileSection id="profile-sketchbook" title="Sketchbook" headline={headline} onFirstOpen={() => setOpened(true)}>
      {!data || isLoading ? (
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />
      ) : (
        <Box>
          <RhythmCard rhythm={data.rhythm} todayIndex={daysBetween(weekStart(today), today)} />
          <SketchGrid sketches={data.sketches.slice(0, 6)} hrefFor={(s) => `/teacher/sketchbook/${studentId}/${s.id}`}
            emptyTitle="No sketches yet" emptyDescription="Nothing has been added to this sketchbook this month." />
          <Button component={Link} href={`/teacher/sketchbook/${studentId}`} variant="outlined" sx={{ mt: 2, minHeight: 48 }}>
            Open sketchbook
          </Button>
        </Box>
      )}
    </ProfileSection>
  );
}
```

In `teacher/students/[id]/page.tsx`: import `SketchbookSection from '@/components/sketchbook/SketchbookSection'`; add `{ id: 'profile-sketchbook', label: 'Sketchbook' },` to `navItems` right after the `profile-work` entry; render `<SketchbookSection studentId={core.student.id} />` immediately after the `<WorkSection ... />` block (use whatever the page already names the student id, `core.student.id` per the header card props).

- [ ] **Step 5: Type-check, walk it, commit**

```bash
pnpm --filter @neram/nexus type-check
```

With the dev server: as the teacher, open `/teacher/sketchbook`, flip through, react, feature (expect the Teams post to fail with "needs a Microsoft sign-in" under a test token; that is the guard working), open Class rhythm, change the goal to 4 and back to 3, open a student's sketchbook from the list, then from `/teacher/students/[id]` expand Sketchbook.

```bash
git add "apps/nexus/src/app/(teacher)/teacher/sketchbook" apps/nexus/src/components/sketchbook/SketchbookSection.tsx "apps/nexus/src/app/(teacher)/teacher/students/[id]/page.tsx" "apps/nexus/src/app/api/sketchbook/students/[id]/route.ts"
git commit -m "feat(nexus): teacher sketchbook peek pages and profile section"
```

---

### Task 15: Phone E2E and the UX review

**Files:**
- Create: `tests/e2e/sketchbook-nexus-mobile.spec.ts`

**Interfaces:**
- Consumes: `APP_URLS`, `STUDENT_ACCOUNT`, `TEACHER_ACCOUNT`, `injectAuthForPage` from `tests/utils/credentials`; `assertNoHorizontalOverflow` from `tests/utils/mobile-helpers`.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Student Sketchbook on a phone.
 *
 * API half: a student adds a sketch and the rhythm answers "1 of 3"; a
 * teacher sees it in the inbox, flips it, reacts; the student's page carries
 * the reaction; a student cannot read the teacher inbox. UI half: the student
 * home renders at phone width without sideways scroll, with 48px targets, and
 * self-skips when the flag is off for this environment.
 */

const NEXUS = APP_URLS.nexus;
// 1x1 white PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

let studentToken = '';
let teacherToken = '';
let sketchId = '';

test.describe('Sketchbook API', () => {
  test.describe.configure({ mode: 'serial' });

  test('setup: tokens', async ({ request }) => {
    const s = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: STUDENT_ACCOUNT.email, role: 'student' } });
    test.skip(s.status() !== 200, 'Nexus dev server or test-login not available');
    studentToken = (await s.json()).testToken;
    const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
    teacherToken = (await t.json()).testToken;
  });

  test('student adds a sketch and gets a rhythm back', async ({ request }) => {
    const up = await request.post(`${NEXUS}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: { bucket: 'drawing-uploads', file: { name: 'e2e-sketch.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(up.status()).toBe(200);
    const { url } = await up.json();
    const res = await request.post(`${NEXUS}/api/sketchbook/entries`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { original_image_url: url, caption: 'E2E chair study' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    sketchId = body.sketch.id;
    expect(body.rhythm.week.count).toBeGreaterThanOrEqual(1);
    expect(body.rhythm.week.goal).toBeGreaterThanOrEqual(1);
  });

  test('student cannot open the teacher inbox', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/sketchbook/inbox`, { headers: { Authorization: `Bearer ${studentToken}` }, failOnStatusCode: false });
    expect(res.status()).toBe(403);
  });

  test('teacher sees it in the inbox, flips and reacts', async ({ request }) => {
    const inbox = await request.get(`${NEXUS}/api/sketchbook/inbox`, { headers: { Authorization: `Bearer ${teacherToken}` } });
    expect(inbox.status()).toBe(200);
    const { sketches } = await inbox.json();
    expect(sketches.some((s: { id: string }) => s.id === sketchId)).toBe(true);

    const flip = await request.post(`${NEXUS}/api/sketchbook/entries/${sketchId}/flip`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { action: 'seen' } });
    expect(flip.status()).toBe(200);
    const react = await request.post(`${NEXUS}/api/sketchbook/entries/${sketchId}/react`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { reaction: 'fire' } });
    expect(react.status()).toBe(200);
  });

  test('the student sees the reaction and who saw it', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/sketchbook/me?sketch=${sketchId}`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const mine = body.sketches.find((s: { id: string }) => s.id === sketchId);
    expect(mine.reaction).toBe('fire');
    expect(mine.seenBy).not.toBeNull();
  });

  test('featuring under a test token is refused with a clear reason', async ({ request }) => {
    const res = await request.post(`${NEXUS}/api/sketchbook/entries/${sketchId}/feature`, {
      headers: { Authorization: `Bearer ${teacherToken}` }, data: { classroom_id: '00000000-0000-0000-0000-000000000000' }, failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Microsoft sign-in');
  });

  test('cleanup: student deletes the sketch', async ({ request }) => {
    const res = await request.delete(`${NEXUS}/api/sketchbook/entries/${sketchId}`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(res.status()).toBe(204);
  });
});

test.describe('Sketchbook on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function open(page: Page, path: string): Promise<'ok' | 'off' | 'down'> {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) return 'down';
    await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
    const shell = page.locator('button[aria-label="Open profile menu"]');
    try { await shell.waitFor({ timeout: 90_000 }); } catch { return 'down'; }
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    if (await page.getByText(/not available|switched off/i).first().isVisible().catch(() => false)) return 'off';
    return 'ok';
  }

  test('home renders without sideways scroll and with 48px targets', async ({ page }) => {
    const state = await open(page, '/student/sketchbook');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'student.sketchbook is off in this environment');
    await expect(page.getByRole('heading', { name: 'Sketchbook' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const fab = page.getByRole('button', { name: 'Add a sketch' });
    await expect(fab).toBeVisible();
    const box = await fab.boundingBox();
    expect(box && box.height >= 48 && box.width >= 48).toBe(true);
    const older = await page.getByRole('button', { name: 'Older month' }).boundingBox();
    expect(older && older.height >= 48).toBe(true);
  });

  test('dashboard shows the sketchbook card', async ({ page }) => {
    const state = await open(page, '/student/dashboard');
    test.skip(state !== 'ok', 'Nexus not running or flag off');
    await expect(page.getByRole('link', { name: /open sketchbook/i })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
```

- [ ] **Step 2: Run it**

With `pnpm dev:nexus` running (never a prod build while dev runs):

```bash
pnpm test:e2e tests/e2e/sketchbook-nexus-mobile.spec.ts --project=nexus-mobile
```

Expected: the API block passes; the phone block passes when `student.sketchbook` is on for the dev database and self-skips otherwise. Check the browser console during the run: zero errors is the target.

- [ ] **Step 3: ui-ux-pro-max review**

Invoke `/ui-ux-pro-max` with "review the sketchbook screens" and walk each screen at 375 and 1280: `/student/sketchbook`, a sketch page, the add sheet, `/teacher/sketchbook` both tabs, the feature sheet, `/teacher/sketchbook/[studentId]`, the profile section. Check against the skill's sections 1, 2, 5, 8 and 9 (contrast, targets, no horizontal scroll, labels and errors, predictable back). Fix what it finds in the same commit.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/sketchbook-nexus-mobile.spec.ts
git commit -m "test(e2e): sketchbook on a phone"
```

---

### Task 16: Teams image spike (staging, manual)

**Files:**
- Possibly modify: `apps/nexus/src/lib/teams-class-announcements.ts` (`postGraphMessage`, near line 295) if option (b) is needed

- [ ] **Step 1: Try the plain image first**

On staging, with `staff.sketchbook` on, `student.sketchbook` on for the pilot classroom, and a real Microsoft sign-in: add a sketch as a student, then as the teacher feature it to the pilot classroom. Open the class group chat and channel in Teams on a phone and on desktop.

Expected (option a works): the card shows the heading, the image, the caption, the "Open in Nexus" link and the @mention.

- [ ] **Step 2: If the image does not render, switch to hosted contents**

Graph accepts an inline image as a hosted content referenced from the body. Change `buildFeaturedSketchHtml` to reference `<img src="../hostedContents/1/$value" width="480">` when a `hosted` flag is passed, and extend `postGraphMessage` in `teams-class-announcements.ts` to accept an optional `hostedContents` array and send:

```ts
{
  body: { contentType: 'html', content: html },
  mentions,
  hostedContents: [
    { '@microsoft.graph.temporaryId': '1', contentBytes: base64, contentType: 'image/jpeg' },
  ],
}
```

where `base64` is the sketch fetched server-side from its public URL (`await (await fetch(url)).arrayBuffer()` then `Buffer.from(buf).toString('base64')`), capped at 3 MB (the compressed upload is far below that). Thread the option through `postChannelMessageDetailed` and `postChatMessageDetailed` as a trailing optional argument so no existing caller changes. Re-run Step 1.

- [ ] **Step 3: Un-feature and confirm**

Un-feature from the sketch page. Expected: both Teams messages show as deleted, the Featured chip disappears, and `is_gallery_visible` is false again (check with `mcp__supabase-staging__execute_sql`).

- [ ] **Step 4: Record the outcome**

Add one line to the spec's section 10 saying which option shipped and why, then:

```bash
git add docs/superpowers/specs/2026-09-11-student-sketchbook-design.md apps/nexus/src/lib/teams-class-announcements.ts
git commit -m "docs(sketchbook): record the Teams image outcome"
```

---

## Verification (end to end)

1. `pnpm test:run apps/nexus/src/lib/sketchbook-rhythm.test.ts apps/nexus/src/components/sketchbook packages/database/src/queries/nexus/sketchbook.test.ts apps/nexus/src/lib/nav-config.test.ts` all green.
2. `pnpm --filter @neram/nexus type-check` and `pnpm --filter @neram/database type-check` clean (run with `--force` on turbo if a cache hit looks suspicious).
3. `pnpm test:e2e tests/e2e/sketchbook-nexus-mobile.spec.ts --project=nexus-mobile` green with the dev server up.
4. Manual on staging (Task 16): feature and un-feature once, image visible on Teams phone and desktop.
5. Switch on `student.sketchbook` for the pilot classroom only, after the user says so. Nothing in this plan deploys.

## Self-review against the spec

- Sections 2 (D1 to D7), 3, 4, 5 screens 1 to 8, 6, 7.1 to 7.7, 8 (all routes except `/featured` and the cron, which the spec places in phase 2), 9, 10, 11, 12 and 14 map to Tasks 1 to 16. The Featured shelf, the rhythm nudge cron, milestones, the monthly recap and the parent page are phase 2 by the spec and are not in this plan.
- Names used across tasks: `computeRhythm`, `istDate`, `weekStart`, `daysBetween`, `rhythmLine` (Task 3) are what Tasks 6, 7, 11, 12, 14 import. `buildSketchbookPayload` / `SketchbookPayload` (Task 6) are what Tasks 11, 12, 14 consume. `SketchbookInboxRow`, `SketchbookFeatureFact`, `SketchbookSketchRow` (Task 4) are what Tasks 11 and 13 import. `REACTION_LABEL`, `firstName`, `reactionMessage`, `featuredMessage` (Task 5) are used by Tasks 7, 8, 11, 13. `realGraphToken`, `assertStaffSeesStudent`, `staffClassroomIds` (Task 5) are used by Tasks 7, 8, 9.
- The spec's opt-out toggle moved from `/student/profile` to the Sketchbook home overflow menu (recorded at the top of this plan).
