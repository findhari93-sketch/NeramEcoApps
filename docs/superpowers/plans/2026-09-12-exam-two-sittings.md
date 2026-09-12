# Exam Two Sittings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank an exam's students in two separate lists, one for those who sat inside the exam's own window and one for those who sat later after catching up, so a late sitting can never take a podium place or renumber an announced result.

**Architecture:** A single pure function, `rankExamCandidates`, partitions candidates by sitting and runs the existing comparator once per group. Everything downstream (the Teams card, the private message, the badges, the student's card, the teacher's roster) reads that one result, so no two surfaces can disagree about who came first. A student's sitting is decided by one timestamp comparison, `started_at` against the exam's shared `closes_at`, and never by reading the grant or make-up tables.

**Tech Stack:** TypeScript, Next.js 14.2 App Router, Supabase (PostgREST), MUI via `@neram/ui`, Vitest for unit tests, Playwright for E2E. pnpm + Turborepo monorepo.

**Spec:** `docs/superpowers/specs/2026-09-12-exam-two-sittings-design.md`

## Global Constraints

- **No em dashes, double dashes or `&mdash;` in any user-visible string.** Use commas, colons, periods or parentheses. This is a repo-wide rule in `CLAUDE.md` and one task asserts it in CI.
- **Never deploy, push, or run `pnpm deploy:*`.** Make the changes and stop. Deployment happens only on an explicit instruction from the founder.
- **Never `git stash` in this repo.** Concurrent sessions share the working tree.
- **`pnpm test` is watch mode and never exits.** Always `pnpm test:run`, and always from the repo root (an app directory finds no tests).
- **Never pipe `tsc` into `head`.** The pipeline reports head's exit code, so a failing type-check reads as clean.
- **Use `--force` with turbo** for type-check and lint. A cache hit passes locally while the deploy fails.
- **The MUI theme in `@neram/ui` is the only source of colour, type and spacing.** Nexus primary is `#7C3AED`. Flat baseline: `elevation={0}` plus a 1px `divider` border, shadow on hover only.
- **Mobile first, 375px.** Touch targets at least 44px with 8px spacing, visible focus rings, SVG icons never emoji, no horizontal scroll at 375, 768, 1024 or 1440px.
- **No disabled buttons on these surfaces.** Where there is nothing to do, render no button. A greyed control carrying a refusal is a dead end.
- **User-facing vocabulary is "Exam day" and "Second sitting".** Never "catch-up list" or anything else that names a student by an absence.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/database/src/queries/nexus/exam-results.ts` | The pure partitioned ranking, and the I/O that assigns each student a sitting and a bucket | 1, 2 |
| `packages/database/src/queries/nexus/exam-rank.test.ts` | Ranking invariants (exists, extended) | 1 |
| `packages/database/src/queries/nexus/exam-results.buckets.test.ts` | Bucket assignment invariants (new) | 2 |
| `supabase/migrations/20260913100000_nexus_exam_sitting.sql` | Adds `nexus_exam_results.sitting` | 3 |
| `packages/database/src/queries/nexus/exams.ts` | `ExamResultRow.sitting`, and the student's own view of their result | 3, 7 |
| `apps/nexus/src/app/api/exams/[examId]/publish/route.ts` | Persists the sitting, counts both sittings in the blocker, warns about open windows | 3, 4 |
| `apps/nexus/src/lib/exam-badges.ts` | Topper and Podium require the main sitting | 4 |
| `apps/nexus/src/lib/exam-badges.test.ts` | Badge gate (new) | 4 |
| `apps/nexus/src/lib/exam-results-model.ts` | The Teams card and the private message | 5 |
| `apps/nexus/src/lib/exam-results-model.test.ts` | Copy and channel-stability tests (new) | 5 |
| `apps/nexus/src/app/api/exams/[examId]/notify/route.ts` | Passes the sitting and the per-sitting denominator | 5 |
| `apps/nexus/src/lib/student-test-card-state.ts` | Tells a student they will be in the second sitting BEFORE they sit | 6 |
| `apps/nexus/src/app/api/student/tests/overview/route.ts` | Carries the sitting to the student's card | 7 |
| `apps/nexus/src/components/tests/StudentTestCard.tsx` | Renders the student's rank with its per-sitting denominator | 7 |
| `apps/nexus/src/components/scheduled-exams/ExamResultsSheet.tsx` | The teacher's results screen: four stat-card filters, one list, one publish button (new, replaces `PublishExamResultsDialog.tsx`) | 8 |
| `apps/nexus/src/components/scheduled-exams/ExamResultsSheet.test.tsx` | Filter and button-state tests (new) | 8 |
| `tests/e2e/exam-results-sittings-nexus.spec.ts` | Mobile E2E (new) | 8 |

---

### Task 1: Partition the ranking function

The whole design rests on this one pure function. Nothing here touches a database.

**Files:**
- Modify: `packages/database/src/queries/nexus/exam-results.ts:22-88` (the types and `rankExamCandidates`)
- Test: `packages/database/src/queries/nexus/exam-rank.test.ts` (exists, 155 lines)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export type ExamSitting = 'main' | 'second'`
  - `export type ExamBucket = 'exam_day' | 'second_sitting' | 'still_to_sit' | 'absent'`
  - `ExamCandidate` gains `sitting: ExamSitting | null` and `bucket: ExamBucket`
  - `RankedCandidate` gains `sitting_size: number`, and its `rank` is now 1-based **within the student's own sitting**
  - `rankExamCandidates(candidates: ExamCandidate[]): RankedCandidate[]` (same name, same arity)

- [ ] **Step 1: Write the failing tests**

Add to `packages/database/src/queries/nexus/exam-rank.test.ts`. First update the existing `candidate` helper at the top of the file so every existing test still compiles, by giving the two new fields defaults:

```ts
const candidate = (
  id: string,
  name: string,
  percentage: number,
  time: number | null = 100,
  absent = false,
  sitting: ExamSitting | null = 'main',
): ExamCandidate => ({
  student_id: id,
  student_name: name,
  attempt_id: absent ? null : `a-${id}`,
  score: percentage,
  total_marks: 100,
  percentage,
  provisional: false,
  absent,
  time_spent_seconds: time,
  section_scores: [],
  sitting: absent ? null : sitting,
  bucket: absent ? 'absent' : sitting === 'second' ? 'second_sitting' : 'exam_day',
  window_closes_at: null,
});
```

Update the import on line 2 to `import { rankExamCandidates, type ExamCandidate, type ExamSitting } from './exam-results';`

Then append this block:

```ts
describe('rankExamCandidates, two sittings', () => {
  it('ranks each sitting from 1, independently', () => {
    const out = rankExamCandidates([
      candidate('a', 'Arun', 60, 100, false, 'main'),
      candidate('b', 'Bhavya', 90, 100, false, 'main'),
      candidate('c', 'Chitra', 99, 100, false, 'second'),
      candidate('d', 'Divya', 70, 100, false, 'second'),
    ]);
    const rankOf = (id: string) => out.find((r) => r.student_id === id)!.rank;
    expect(rankOf('b')).toBe(1);
    expect(rankOf('a')).toBe(2);
    expect(rankOf('c')).toBe(1);
    expect(rankOf('d')).toBe(2);
  });

  it('gives every ranked student the size of their OWN sitting', () => {
    const out = rankExamCandidates([
      candidate('a', 'Arun', 60, 100, false, 'main'),
      candidate('b', 'Bhavya', 90, 100, false, 'main'),
      candidate('c', 'Chitra', 99, 100, false, 'second'),
    ]);
    expect(out.find((r) => r.student_id === 'a')!.sitting_size).toBe(2);
    expect(out.find((r) => r.student_id === 'c')!.sitting_size).toBe(1);
  });

  // THE INVARIANT THE WHOLE DESIGN RESTS ON. A podium is announced in a Teams
  // channel and in a private message to each student; a sitting three weeks
  // later must not silently renumber it.
  it('a second sitting never changes a main sitting rank', () => {
    const main = [
      candidate('a', 'Arun', 60, 100, false, 'main'),
      candidate('b', 'Bhavya', 90, 100, false, 'main'),
      candidate('c', 'Chitra', 90, 200, false, 'main'),
    ];
    const before = rankExamCandidates(main).filter((r) => r.sitting === 'main');

    for (let n = 1; n <= 20; n += 1) {
      const late = Array.from({ length: n }, (_, i) =>
        candidate(`late${i}`, `Late ${i}`, 100 - i, 50, false, 'second'),
      );
      const after = rankExamCandidates([...main, ...late]).filter((r) => r.sitting === 'main');
      expect(after.map((r) => [r.student_id, r.rank, r.sitting_size])).toEqual(
        before.map((r) => [r.student_id, r.rank, r.sitting_size]),
      );
    }
  });

  it('shares a rank on a tie inside a sitting, without leaking across sittings', () => {
    const out = rankExamCandidates([
      candidate('a', 'Arun', 90, 200, false, 'main'),
      candidate('b', 'Bhavya', 90, 100, false, 'main'),
      candidate('c', 'Chitra', 50, 100, false, 'main'),
      candidate('d', 'Divya', 90, 100, false, 'second'),
    ]);
    expect(out.filter((r) => r.sitting === 'main').map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(out.find((r) => r.student_id === 'd')!.rank).toBe(1);
  });

  // A student with an open window has not sat and is NOT absent. The old code
  // forced absent: true on everyone without an attempt, which would privately
  // tell 28 students with live windows that they were marked absent.
  it('leaves the absent flag alone on a student who still has time', () => {
    const stillToSit: ExamCandidate = {
      student_id: 'z',
      student_name: 'Zara',
      attempt_id: null,
      score: 0,
      total_marks: 0,
      percentage: 0,
      provisional: false,
      absent: false,
      time_spent_seconds: null,
      section_scores: [],
      sitting: null,
      bucket: 'still_to_sit',
      window_closes_at: '2026-09-19T12:34:00.000Z',
    };
    const out = rankExamCandidates([candidate('a', 'Arun', 60), stillToSit]);
    const row = out.find((r) => r.student_id === 'z')!;
    expect(row.absent).toBe(false);
    expect(row.rank).toBeNull();
    expect(row.bucket).toBe('still_to_sit');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run packages/database/src/queries/nexus/exam-rank.test.ts`

Expected: FAIL. TypeScript errors on `sitting` and `bucket` not existing on `ExamCandidate`, and on `sitting_size` not existing on the result.

- [ ] **Step 3: Implement the partition**

In `packages/database/src/queries/nexus/exam-results.ts`, add the two types above `ExamCandidate` and extend the interfaces:

```ts
/** Which of an exam's two rank lists a paper belongs to. */
export type ExamSitting = 'main' | 'second';

/**
 * Where one roster student stands. Exactly one per student, and the four
 * always sum to the roster.
 *
 * still_to_sit exists because "no paper" is not the same as "absent": 28
 * students on the History of Architecture exam hold live windows, and calling
 * them absent would privately tell each of them so.
 */
export type ExamBucket = 'exam_day' | 'second_sitting' | 'still_to_sit' | 'absent';
```

Add to `ExamCandidate`, after `section_scores`:

```ts
  /** Null when they have not submitted a paper. */
  sitting: ExamSitting | null;
  bucket: ExamBucket;
  /**
   * When this student's own window shuts. Set only on a still_to_sit row, so a
   * teacher deciding whether to publish now can see whether they are waiting
   * two days or three weeks.
   */
  window_closes_at: string | null;
```

Replace the `RankedCandidate` interface:

```ts
export interface RankedCandidate extends ExamCandidate {
  /**
   * 1-based, dense, WITHIN this student's own sitting: two students on the
   * same percentage share a rank and the next rank skips. Null when they did
   * not sit.
   */
  rank: number | null;
  /** How many sat in that same sitting, so a rank always travels with its denominator. */
  sitting_size: number;
}
```

Replace the body of `rankExamCandidates` (keep the existing doc comment above it and add the paragraph shown):

```ts
/**
 * ... existing doc comment stays ...
 *
 * TWO SITTINGS, RANKED SEPARATELY. A student who started the paper after the
 * exam's shared window closed had days or weeks longer to prepare, so they are
 * ranked among themselves rather than against the people who sat on the day.
 * The partition, not a freeze flag, is what stops a late sitting renumbering a
 * podium that has already been announced: a second-sitting paper simply cannot
 * enter the main set.
 */
export function rankExamCandidates(candidates: ExamCandidate[]): RankedCandidate[] {
  const byMarks = (a: ExamCandidate, b: ExamCandidate) =>
    b.percentage - a.percentage ||
    (a.time_spent_seconds ?? Number.MAX_SAFE_INTEGER) -
      (b.time_spent_seconds ?? Number.MAX_SAFE_INTEGER) ||
    a.student_name.localeCompare(b.student_name);

  const rankGroup = (group: ExamCandidate[]): RankedCandidate[] => {
    const ordered = [...group].sort(byMarks);
    const out: RankedCandidate[] = [];
    let lastPct: number | null = null;
    let lastRank = 0;

    ordered.forEach((c, i) => {
      const rank = lastPct !== null && c.percentage === lastPct ? lastRank : i + 1;
      lastPct = c.percentage;
      lastRank = rank;
      out.push({ ...c, rank, sitting_size: group.length });
    });

    return out;
  };

  const sat = candidates.filter((c) => !c.absent && c.attempt_id);
  const unsat = candidates.filter((c) => c.absent || !c.attempt_id);

  return [
    ...rankGroup(sat.filter((c) => c.sitting !== 'second')),
    ...rankGroup(sat.filter((c) => c.sitting === 'second')),
    // The absent flag is NOT forced here. A student holding a live window has
    // no paper and is not absent, and getExamResults has already said which.
    ...unsat
      .sort((a, b) => a.student_name.localeCompare(b.student_name))
      .map((c) => ({ ...c, rank: null, sitting_size: 0 })),
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run packages/database/src/queries/nexus/exam-rank.test.ts`

Expected: PASS, all tests in the file including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/queries/nexus/exam-results.ts packages/database/src/queries/nexus/exam-rank.test.ts
git commit -m "feat(exams): rank the main and second sittings separately

A student who started the paper after the exam closed had weeks longer to
prepare, so they are now ranked among themselves. The partition is also what
stops a late sitting renumbering an announced podium, which the freeze comment
on nexus_exam_results.rank claimed but saveExamResults never delivered.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Assign the sitting and the four buckets

**Files:**
- Modify: `packages/database/src/queries/nexus/exam-results.ts` (`getExamResults`, `loadExamSittings`, `EXAM_ATTEMPT_COLUMNS`, `ExamResultsSummary`)
- Test: `packages/database/src/queries/nexus/exam-results.buckets.test.ts` (create)

**Interfaces:**
- Consumes: `ExamSitting`, `ExamBucket`, `RankedCandidate`, `rankExamCandidates` from Task 1.
- Produces:
  - `export function examSittingFor(attempt: { started_at?: string | null; submitted_at?: string | null }, examClosesAt: string): ExamSitting`
  - `ExamResultsSummary.stats` gains `still_to_sit: number`; every score-derived figure in `stats` is now main-sitting only
  - `ExamResultsSummary.second: { sat: number; average: number; highest: number; lowest: number; passed: number } | null`
  - `ExamResultsSummary.podium` narrows to main-sitting ranks 1 to 3

- [ ] **Step 1: Write the failing test**

Create `packages/database/src/queries/nexus/exam-results.buckets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { examSittingFor } from './exam-results';

const CLOSES = '2026-08-18T17:15:00.000Z';

describe('examSittingFor', () => {
  it('puts a paper started before the close in the main sitting', () => {
    expect(
      examSittingFor(
        { started_at: '2026-08-18T16:00:00.000Z', submitted_at: '2026-08-18T17:00:00.000Z' },
        CLOSES,
      ),
    ).toBe('main');
  });

  // The real production row: started 17:00, submitted 18:05, exam closed 17:15.
  // They sat on the day and overran. Reading submitted_at would call this a
  // late sitting and drop a student off the podium they earned.
  it('puts an overrun in the main sitting, because it reads started_at', () => {
    expect(
      examSittingFor(
        { started_at: '2026-08-18T17:00:00.000Z', submitted_at: '2026-08-18T18:05:35.554Z' },
        CLOSES,
      ),
    ).toBe('main');
  });

  it('puts a paper started after the close in the second sitting', () => {
    expect(
      examSittingFor(
        { started_at: '2026-09-12T04:00:00.000Z', submitted_at: '2026-09-12T05:30:00.000Z' },
        CLOSES,
      ),
    ).toBe('second');
  });

  it('treats a sitting started exactly at the close as on the day', () => {
    expect(examSittingFor({ started_at: CLOSES, submitted_at: CLOSES }, CLOSES)).toBe('main');
  });

  // started_at is nullable and production has zero submitted papers without
  // one, so this is a safety net rather than a live path. Falling back to
  // submitted_at keeps the answer deterministic instead of guessing.
  it('falls back to submitted_at when started_at is missing', () => {
    expect(examSittingFor({ started_at: null, submitted_at: '2026-08-18T17:00:00.000Z' }, CLOSES)).toBe('main');
    expect(examSittingFor({ started_at: null, submitted_at: '2026-09-12T05:00:00.000Z' }, CLOSES)).toBe('second');
  });

  it('falls back to the main sitting when neither timestamp is usable', () => {
    expect(examSittingFor({ started_at: null, submitted_at: null }, CLOSES)).toBe('main');
    expect(examSittingFor({ started_at: 'not a date', submitted_at: null }, CLOSES)).toBe('main');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run packages/database/src/queries/nexus/exam-results.buckets.test.ts`

Expected: FAIL with `examSittingFor is not a function` or a TypeScript error that it is not exported.

- [ ] **Step 3: Implement `examSittingFor`**

Add to `packages/database/src/queries/nexus/exam-results.ts`, directly above `rankExamCandidates`:

```ts
/**
 * Which sitting one paper belongs to.
 *
 * STARTED, not submitted. Production holds a paper begun at 17:00 and handed in
 * at 18:05 against a 17:15 close: that student sat on the day and overran, and
 * an overrun is the common case rather than the exception. Reading submitted_at
 * would move them out of the podium they competed for.
 *
 * Deliberately does NOT read the grant or make-up tables. A grant overlapping
 * the normal window should move nobody, and the only question that matters is
 * whether the student beat the shared deadline.
 */
export function examSittingFor(
  attempt: { started_at?: string | null; submitted_at?: string | null },
  examClosesAt: string,
): ExamSitting {
  const closes = Date.parse(examClosesAt);
  const began = Date.parse(attempt.started_at ?? attempt.submitted_at ?? '');
  if (Number.isNaN(began) || Number.isNaN(closes)) return 'main';
  return began <= closes ? 'main' : 'second';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run packages/database/src/queries/nexus/exam-results.buckets.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the buckets into `getExamResults`**

Three edits in the same file.

**5a.** Add `started_at, submitted_at` to `EXAM_ATTEMPT_COLUMNS`:

```ts
const EXAM_ATTEMPT_COLUMNS =
  'id, student_id, status, attempt_number, score, total_marks, percentage, final_score, final_total_marks, final_percentage, finalised_at, time_spent_seconds, started_at, submitted_at, answers';
```

**5b.** `loadExamSittings` currently finds the exam placement internally and returns only the attempts. `getExamResults` needs that placement id to batch-read access grants, so change its return type and both `return` statements:

```ts
async function loadExamSittings(
  exam: { test_id: string; scheduled_class_id?: string | null },
  studentIds: string[],
  supabase: TypedSupabaseClient,
): Promise<{ placementId: string | null; byStudent: Map<string, any> }> {
```

In the `if (placement)` branch return `{ placementId: placement.id, byStudent: out }`, and in the paper-wide fallback return `{ placementId: null, byStudent: out }`. The early return for an empty `studentIds` becomes `return { placementId: null, byStudent: out }`.

**5c.** In `getExamResults`, replace the line `const bestByStudent = await loadExamSittings(exam, studentIds, supabase);` with the block below, and add the two imports at the top of the file:

```ts
import { loadRunSittings, loadRunAccessRequests } from './run-sittings';
import { listExamMakeups, resolveExamWindowForStudent } from './exams';
```

(`loadRunSittings` is already imported; extend that import rather than duplicating it. `getExam` is already imported from `./exams`; extend that import too.)

```ts
  const { placementId, byStudent: bestByStudent } = await loadExamSittings(exam, studentIds, supabase);

  // Who still has time. Resolved through resolveExamWindowForStudent, the one
  // function that decides whether a door is open for one student, so the
  // teacher's roster and that student's own card cannot disagree.
  const [makeups, accessByPlacement] = await Promise.all([
    listExamMakeups(examId, supabase),
    placementId
      ? loadRunAccessRequests([placementId], studentIds, supabase)
      : Promise.resolve(new Map()),
  ]);
  const makeupByStudent = new Map(makeups.map((m) => [m.student_id, m]));
  const grantByStudent = placementId
    ? (accessByPlacement.get(placementId) ?? new Map())
    : new Map();
  const now = Date.now();
```

**5d.** Replace the `candidates` mapping. The not-submitted branch becomes:

```ts
  const candidates: ExamCandidate[] = roster.map((student) => {
    const attempt = bestByStudent.get(student.id);

    if (!attempt || attempt.status !== 'submitted') {
      // A granted row only. A pending ask is a question, not a door.
      const grant = grantByStudent.get(student.id);
      const reopen = grant?.status === 'granted' ? grant : null;
      const window = resolveExamWindowForStudent(exam, makeupByStudent.get(student.id) ?? null, reopen);
      const stillOpen = Date.parse(window.closes_at) > now;

      return {
        student_id: student.id,
        student_name: student.name,
        avatar_url: student.avatar_url ?? null,
        attempt_id: null,
        score: 0,
        total_marks: 0,
        percentage: 0,
        provisional: false,
        // Absent means no paper AND no way left to produce one. A student whose
        // window is still open has simply not sat it yet.
        absent: !stillOpen,
        time_spent_seconds: null,
        section_scores: [],
        sitting: null,
        bucket: stillOpen ? ('still_to_sit' as const) : ('absent' as const),
        window_closes_at: stillOpen ? window.closes_at : null,
      };
    }
```

and the submitted branch gains, just before its `return`:

```ts
    const sitting = examSittingFor(attempt, exam.closes_at);
```

with these two fields added to the object it returns, after `section_scores`:

```ts
      sitting,
      bucket: sitting === 'second' ? ('second_sitting' as const) : ('exam_day' as const),
      window_closes_at: null,
```

The local `const closed = new Date(exam.closes_at) <= new Date();` is now unused and must be deleted, or the build will warn.

**5e.** Replace the summary computation at the end of `getExamResults`. `sat` becomes main-sitting only, and a `second` block is added:

```ts
  const rows = rankExamCandidates(candidates);
  const sat = rows.filter((r) => r.bucket === 'exam_day');
  const late = rows.filter((r) => r.bucket === 'second_sitting');
  const percentages = sat.map((r) => r.percentage);
  const passingPct = exam.passing_pct == null ? null : Number(exam.passing_pct);
```

The `sectionTotals` loop keeps iterating `sat`, so section averages describe exam day, matching the rest of `stats`.

The returned object's `stats` and the two new members:

```ts
    stats: {
      roster: roster.length,
      sat: sat.length,
      absent: rows.filter((r) => r.bucket === 'absent').length,
      still_to_sit: rows.filter((r) => r.bucket === 'still_to_sit').length,
      average: percentages.length ? round2(avg(percentages)) : 0,
      highest: percentages.length ? Math.max(...percentages) : 0,
      lowest: percentages.length ? Math.min(...percentages) : 0,
      passed: passingPct == null ? sat.length : sat.filter((r) => r.percentage >= passingPct).length,
      passing_pct: passingPct,
    },
    second:
      late.length === 0
        ? null
        : {
            sat: late.length,
            average: round2(avg(late.map((r) => r.percentage))),
            highest: Math.max(...late.map((r) => r.percentage)),
            lowest: Math.min(...late.map((r) => r.percentage)),
            passed:
              passingPct == null ? late.length : late.filter((r) => r.percentage >= passingPct).length,
          },
```

and `podium` narrows:

```ts
    podium: rows.filter((r) => r.sitting === 'main' && r.rank != null && r.rank <= 3),
```

Update `ExamResultsSummary` to declare `still_to_sit: number` inside `stats` and add:

```ts
  /**
   * The second sitting's own figures, null until somebody sits late.
   *
   * Kept OUT of `stats` on purpose: the channel card is built from `stats`, and
   * the average a class was told on results day has to stay true afterwards.
   */
  second: { sat: number; average: number; highest: number; lowest: number; passed: number } | null;
```

- [ ] **Step 6: Add the bucket exclusivity test**

Append to `packages/database/src/queries/nexus/exam-results.buckets.test.ts`:

```ts
import { rankExamCandidates, type ExamCandidate, type ExamBucket } from './exam-results';

const row = (id: string, bucket: ExamBucket, percentage = 50): ExamCandidate => ({
  student_id: id,
  student_name: `S ${id}`,
  attempt_id: bucket === 'exam_day' || bucket === 'second_sitting' ? `a-${id}` : null,
  score: percentage,
  total_marks: 100,
  percentage,
  provisional: false,
  absent: bucket === 'absent',
  time_spent_seconds: 100,
  section_scores: [],
  sitting: bucket === 'exam_day' ? 'main' : bucket === 'second_sitting' ? 'second' : null,
  bucket,
  window_closes_at: bucket === 'still_to_sit' ? '2026-09-19T12:34:00.000Z' : null,
});

describe('the four buckets', () => {
  it('keeps every roster student in exactly one bucket, summing to the roster', () => {
    const input = [
      row('a', 'exam_day'),
      row('b', 'exam_day', 70),
      row('c', 'second_sitting', 90),
      row('d', 'still_to_sit'),
      row('e', 'absent'),
    ];
    const out = rankExamCandidates(input);
    expect(out).toHaveLength(input.length);

    const counts = out.reduce<Record<string, number>>((acc, r) => {
      acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ exam_day: 2, second_sitting: 1, still_to_sit: 1, absent: 1 });
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(input.length);
  });

  it('ranks only the two sittings, never a student without a paper', () => {
    const out = rankExamCandidates([row('a', 'exam_day'), row('d', 'still_to_sit'), row('e', 'absent')]);
    expect(out.find((r) => r.student_id === 'a')!.rank).toBe(1);
    expect(out.find((r) => r.student_id === 'd')!.rank).toBeNull();
    expect(out.find((r) => r.student_id === 'e')!.rank).toBeNull();
  });
});
```

- [ ] **Step 7: Run the full database suite and the type-check**

Run: `pnpm test:run packages/database` then `pnpm type-check --force --filter=@neram/database`

Expected: PASS. `exam-results.sittings.test.ts` and `exam-results.draws.test.ts` already exist and both build `ExamCandidate` values; if either fails to compile, add `sitting` and `bucket` to its fixtures rather than loosening the types.

- [ ] **Step 8: Commit**

```bash
git add packages/database/src/queries/nexus/exam-results.ts packages/database/src/queries/nexus/exam-results.buckets.test.ts
git commit -m "feat(exams): sort every roster student into one of four buckets

Exam day, second sitting, still to sit, absent. still_to_sit is the one that
did not exist: absent meant no paper and a closed window, so publishing the
History of Architecture exam would have privately told 28 students holding live
windows that they were marked absent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Persist the sitting

**Files:**
- Create: `supabase/migrations/20260913100000_nexus_exam_sitting.sql`
- Modify: `packages/database/src/queries/nexus/exams.ts:1074-1087` (`ExamResultRow`)
- Modify: `apps/nexus/src/app/api/exams/[examId]/publish/route.ts` (the `saveExamResults` call and the blocker)

**Interfaces:**
- Consumes: `ExamSitting` and `ExamBucket` from Task 1, the populated `results.rows` from Task 2.
- Produces: `ExamResultRow` gains `sitting: 'main' | 'second'`. `getExamResultRows` returns it, which Task 5 reads.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260913100000_nexus_exam_sitting.sql`:

```sql
-- ============================================
-- EXAM RESULTS: TWO SITTINGS, RANKED SEPARATELY
--
-- A student who started the paper after the exam's shared window closed had
-- days or weeks longer to prepare than one who sat on the day. Ranking both in
-- one list lets the extra time buy a podium place.
--
-- The partition also replaces a workaround. The comment on `rank` said it was
-- frozen so a make-up could not renumber an announced podium, but
-- saveExamResults upserts every row, so republishing renumbered everyone. Once
-- the two sittings are separate sets a late paper cannot enter the main one, so
-- the main ranks are stable by construction and no freeze flag is needed.
--
-- Additive with a safe default, and there is nothing to backfill: no exam has
-- ever been published, so nexus_exam_results is empty.
-- ============================================

ALTER TABLE nexus_exam_results
  ADD COLUMN IF NOT EXISTS sitting TEXT NOT NULL DEFAULT 'main'
    CHECK (sitting IN ('main', 'second'));

COMMENT ON COLUMN nexus_exam_results.sitting IS
  'main: started the paper before the exam closed. second: started it after, through a make-up, a reopen or a catch-up unlock. Decided by started_at, never by which table opened the door.';

COMMENT ON COLUMN nexus_exam_results.rank IS
  '1-based and dense WITHIN this row''s sitting: ties share a rank and the next rank skips. A second sitting is ranked among itself, which is what stops a late paper renumbering a podium already named in a Teams post.';
```

- [ ] **Step 2: Apply it to staging and verify the column exists**

Use `mcp__supabase-staging__apply_migration` with name `nexus_exam_sitting` and the SQL above, then verify with `mcp__supabase-staging__execute_sql`:

```sql
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_name = 'nexus_exam_results' and column_name = 'sitting';
```

Expected: one row, `text`, default `'main'::text`, `NO`.

Do NOT apply to production. The deploy pipeline does that, and the founder decides when it runs.

- [ ] **Step 3: Extend `ExamResultRow`**

In `packages/database/src/queries/nexus/exams.ts`, add to the interface after `rank`:

```ts
  /** Which of the exam's two rank lists this row belongs to. */
  sitting: 'main' | 'second';
```

- [ ] **Step 4: Persist it, and count both sittings in the blocker**

In `apps/nexus/src/app/api/exams/[examId]/publish/route.ts`:

Replace the blocker in POST. The old form refuses a teacher who never published on the day and came back once the catch-up group had sat:

```ts
    // Both sittings. A teacher who never published on the day and comes back
    // once the catch-up group has sat does have results to publish.
    const anySat = results.rows.some((r) => r.bucket === 'exam_day' || r.bucket === 'second_sitting');
    if (!anySat) {
      return NextResponse.json(
        { error: 'Nobody has sat this exam yet, so there is nothing to publish.' },
        { status: 400 },
      );
    }
```

Apply the identical change to the GET blocker, which currently reads `if (results.stats.sat === 0)`.

Add `sitting` to the `saveExamResults` mapping and replace the stale comment above it:

```ts
    // ── 1. The snapshot, FIRST ──────────────────────────────────────────────
    // Ranks are per sitting, so writing the second sitting cannot disturb the
    // exam-day ranks already named in a Teams post and in private messages.
    await saveExamResults(
      params.examId,
      results.rows.map((row) => ({
        student_id: row.student_id,
        attempt_id: row.attempt_id,
        rank: row.rank,
        sitting: row.sitting ?? 'main',
        score: row.score,
        total_marks: row.total_marks,
        percentage: row.percentage,
        section_scores: row.section_scores as unknown,
        is_provisional: row.provisional,
        absent: row.absent,
      })),
    );
```

Add the open-window warning to the GET `warnings` array, after the existing `drawings_ungraded` warning:

```ts
    if (results.stats.still_to_sit > 0) {
      const n = results.stats.still_to_sit;
      warnings.push(
        `${n} student${n === 1 ? ' still has' : 's still have'} an open window. Publishing now announces exam day results only. They will be ranked in the second sitting.`,
      );
    }
```

- [ ] **Step 5: Verify the type-check passes across both packages**

Run: `pnpm type-check --force --filter=@neram/database --filter=@neram/nexus`

Expected: PASS, 2 successful tasks. Never pipe this into `head`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260913100000_nexus_exam_sitting.sql packages/database/src/queries/nexus/exams.ts "apps/nexus/src/app/api/exams/[examId]/publish/route.ts"
git commit -m "feat(exams): persist which sitting each result belongs to

Also fixes the publish blocker, which counted only the main sitting and so
refused a teacher who never published on the day and came back once the
catch-up group had sat.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The podium belongs to exam day

**Files:**
- Modify: `apps/nexus/src/lib/exam-badges.ts:45-85`
- Modify: `apps/nexus/src/app/api/exams/[examId]/publish/route.ts` (`awardExamGamification`)
- Test: `apps/nexus/src/lib/exam-badges.test.ts` (create)

**Interfaces:**
- Consumes: `ExamSitting` from Task 1.
- Produces: `ExamBadgeInput` gains `sitting: 'main' | 'second'`. `examBadgesFor` returns Topper and Podium only for `'main'`.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/lib/exam-badges.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { examBadgesFor, examPointsFor, EXAM_BADGE_IDS } from './exam-badges';

const input = (over: Partial<Parameters<typeof examBadgesFor>[0]> = {}) => ({
  rank: 1,
  percentage: 88,
  candidates: 16,
  examsSat: 1,
  previousBestPct: null,
  sitting: 'main' as const,
  ...over,
});

describe('examBadgesFor', () => {
  it('gives the exam day winner the topper and podium badges', () => {
    expect(examBadgesFor(input())).toContain(EXAM_BADGE_IDS.topper);
    expect(examBadgesFor(input())).toContain(EXAM_BADGE_IDS.podium);
  });

  // The scarce thing punctuality buys. A student who sat four weeks later had
  // four more weeks to prepare, so they cannot take a placing from someone who
  // met the deadline.
  it('gives the second sitting winner neither topper nor podium', () => {
    const out = examBadgesFor(input({ sitting: 'second' }));
    expect(out).not.toContain(EXAM_BADGE_IDS.topper);
    expect(out).not.toContain(EXAM_BADGE_IDS.podium);
  });

  // And it does not tell them their work was worth nothing.
  it('still gives the second sitting regular and personal best', () => {
    const out = examBadgesFor(
      input({ sitting: 'second', examsSat: 3, percentage: 80, previousBestPct: 60 }),
    );
    expect(out).toContain(EXAM_BADGE_IDS.regular);
    expect(out).toContain(EXAM_BADGE_IDS.personalBest);
  });

  it('still pays points on the score, whichever sitting it was', () => {
    expect(examPointsFor(76)).toBe(76);
  });

  it('gives an absent student nothing at all', () => {
    expect(examBadgesFor(input({ rank: null }))).toEqual([]);
  });

  it('withholds the podium from a sitting too small for it to mean anything', () => {
    expect(examBadgesFor(input({ candidates: 4 }))).not.toContain(EXAM_BADGE_IDS.topper);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/exam-badges.test.ts`

Expected: FAIL. TypeScript rejects `sitting` as an unknown property on `ExamBadgeInput`.

- [ ] **Step 3: Gate the podium on the sitting**

In `apps/nexus/src/lib/exam-badges.ts`, add to `ExamBadgeInput`:

```ts
  /**
   * Which sitting they were in. Only the main sitting can win a placing: a
   * student who sat weeks later had weeks longer to prepare.
   */
  sitting: 'main' | 'second';
```

and change `examBadgesFor`, replacing the `podiumCounts` block:

```ts
  // Only exam day carries a placing. `candidates` is the main sitting's size,
  // so the minimum still measures the pool the rank was actually won in.
  const podiumCounts = input.sitting === 'main' && input.candidates >= EXAM_PODIUM_MIN_CANDIDATES;
```

Also extend the doc comment above `EXAM_BADGE_IDS.topper` usage by adding this paragraph to the function's doc block:

```ts
 * A second-sitting student earns points, Regular and Personal Best, and never
 * Topper or Podium. Refusing them everything would say their work was worth
 * nothing; giving them a placing would let extra preparation time buy one.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/lib/exam-badges.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Pass the sitting and the right denominator from the publish route**

In `apps/nexus/src/app/api/exams/[examId]/publish/route.ts`, `awardExamGamification` currently computes `const sat = input.rows.filter((r) => !r.absent && r.attempt_id); const candidates = sat.length;`. Widen the `rows` parameter type and split the counts:

```ts
  rows: Array<{
    student_id: string;
    rank: number | null;
    percentage: number;
    absent: boolean;
    attempt_id: string | null;
    sitting: 'main' | 'second' | null;
    bucket: 'exam_day' | 'second_sitting' | 'still_to_sit' | 'absent';
  }>;
```

```ts
  const sat = input.rows.filter((r) => r.bucket === 'exam_day' || r.bucket === 'second_sitting');
  // The main sitting's size, because that is the pool a placing is won in.
  const candidates = input.rows.filter((r) => r.bucket === 'exam_day').length;
```

and add one line to the `examBadgesFor` call, which is the head of a `for...of` loop around line 355. It currently reads:

```ts
    for (const badgeId of examBadgesFor({
      rank: row.rank,
      percentage: row.percentage,
      candidates,
      examsSat: Math.max(1, prior.count),
      previousBestPct: prior.best,
    })) {
```

and becomes:

```ts
    for (const badgeId of examBadgesFor({
      rank: row.rank,
      percentage: row.percentage,
      candidates,
      examsSat: Math.max(1, prior.count),
      previousBestPct: prior.best,
      sitting: row.sitting ?? 'main',
    })) {
```

- [ ] **Step 6: Run the nexus suite and type-check**

Run: `pnpm test:run apps/nexus` then `pnpm type-check --force --filter=@neram/nexus`

Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/lib/exam-badges.ts apps/nexus/src/lib/exam-badges.test.ts "apps/nexus/src/app/api/exams/[examId]/publish/route.ts"
git commit -m "feat(exams): reserve topper and podium for the exam day sitting

Points, Regular and Personal Best are still earned by both. The placing is the
one scarce thing punctuality buys, and it cannot be bought with extra weeks.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The channel card and the private message

**Files:**
- Modify: `apps/nexus/src/lib/exam-results-model.ts`
- Modify: `apps/nexus/src/app/api/exams/[examId]/notify/route.ts`
- Test: `apps/nexus/src/lib/exam-results-model.test.ts` (create)

**Interfaces:**
- Consumes: `ExamResultsSummary` with `second` and `stats.still_to_sit` from Task 2, `ExamResultRow.sitting` from Task 3.
- Produces: `buildStudentResultMessage` input gains `sitting: 'main' | 'second' | null` and its `totalSat` now means the size of that student's own sitting.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/lib/exam-results-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildExamResultSections, buildStudentResultMessage } from './exam-results-model';
import { renderShareText } from './class-share-render';
import type { ExamResultsSummary, RankedCandidate } from '@neram/database';

const ranked = (over: Partial<RankedCandidate> = {}): RankedCandidate => ({
  student_id: 's1',
  student_name: 'Kaveya',
  avatar_url: null,
  attempt_id: 'a1',
  score: 38,
  total_marks: 50,
  percentage: 76,
  provisional: false,
  absent: false,
  time_spent_seconds: 3600,
  section_scores: [],
  sitting: 'main',
  bucket: 'exam_day',
  rank: 3,
  sitting_size: 16,
  ...over,
});

const summary = (over: Partial<ExamResultsSummary> = {}): ExamResultsSummary => ({
  rows: [ranked()],
  stats: {
    roster: 47,
    sat: 16,
    absent: 3,
    still_to_sit: 19,
    average: 61,
    highest: 84,
    lowest: 30,
    passed: 12,
    passing_pct: 40,
  },
  section_averages: [],
  podium: [ranked({ rank: 1, student_name: 'Arun', percentage: 84 })],
  drawings_ungraded: 0,
  second: null,
  ...over,
});

describe('buildExamResultSections', () => {
  // The channel is told the exam day figures on results day. A sitting three
  // weeks later must not make that announcement retrospectively wrong.
  it('renders identically once a second sitting exists', () => {
    const before = renderShareText(
      buildExamResultSections({ examTitle: 'HOA Test', classroomName: 'NATA 2027', results: summary(), provisional: false }),
      new Set(['exam_summary', 'exam_podium', 'exam_sections']),
    );

    const withLate = summary({
      rows: [ranked(), ranked({ student_id: 's9', student_name: 'Late', sitting: 'second', bucket: 'second_sitting', percentage: 99, rank: 1, sitting_size: 9 })],
      second: { sat: 9, average: 71, highest: 99, lowest: 44, passed: 8 },
    });
    const after = renderShareText(
      buildExamResultSections({ examTitle: 'HOA Test', classroomName: 'NATA 2027', results: withLate, provisional: false }),
      new Set(['exam_summary', 'exam_podium', 'exam_sections']),
    );

    expect(after).toBe(before);
  });

  it('never names anyone from the second sitting', () => {
    const withLate = summary({
      podium: [ranked({ rank: 1, student_name: 'Arun' })],
      rows: [ranked({ student_id: 's9', student_name: 'Latecomer', sitting: 'second', bucket: 'second_sitting' })],
      second: { sat: 1, average: 76, highest: 76, lowest: 76, passed: 1 },
    });
    const text = renderShareText(
      buildExamResultSections({ examTitle: 'HOA Test', classroomName: null, results: withLate, provisional: false }),
      new Set(['exam_summary', 'exam_podium', 'exam_sections']),
    );
    expect(text).not.toContain('Latecomer');
  });
});

describe('buildStudentResultMessage', () => {
  it('tells an exam day student their rank plainly', () => {
    const { plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked(),
      totalSat: 16,
      provisional: false,
      passingPct: 40,
      sitting: 'main',
    });
    expect(plain).toContain('Your rank: 3rd of 16');
    expect(plain).not.toContain('second sitting');
  });

  it('names the second sitting, and counts only that sitting', () => {
    const { plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ sitting: 'second', bucket: 'second_sitting', rank: 2, sitting_size: 9 }),
      totalSat: 9,
      provisional: false,
      passingPct: 40,
      sitting: 'second',
    });
    expect(plain).toContain('second sitting');
    expect(plain).toContain('Your rank: 2nd of 9 in the second sitting');
  });

  // 28 students on the one real exam hold live windows. Telling them they were
  // marked absent is the thing this must never do.
  it('never uses the absent wording for a student who still has time', () => {
    const { subject, plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ attempt_id: null, absent: false, bucket: 'still_to_sit', sitting: null, rank: null, sitting_size: 0 }),
      totalSat: 16,
      provisional: false,
      passingPct: 40,
      sitting: null,
    });
    expect(subject).not.toContain('absent');
    expect(plain).not.toContain('marked absent');
    expect(plain).toContain('still open');
  });

  it('keeps the absent wording for a genuinely absent student', () => {
    const { plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ attempt_id: null, absent: true, bucket: 'absent', sitting: null, rank: null, sitting_size: 0 }),
      totalSat: 16,
      provisional: false,
      passingPct: 40,
      sitting: null,
    });
    expect(plain).toContain('marked absent');
  });

  it('uses no em dash or double dash in anything a student reads', () => {
    const { subject, plain } = buildStudentResultMessage({
      examTitle: 'HOA Test',
      row: ranked({ sitting: 'second', bucket: 'second_sitting', rank: 2, sitting_size: 9 }),
      totalSat: 9,
      provisional: true,
      passingPct: 40,
      sitting: 'second',
    });
    expect(`${subject}\n${plain}`).not.toMatch(/—|--|&mdash;/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/exam-results-model.test.ts`

Expected: FAIL. `sitting` is not accepted by `buildStudentResultMessage`, and the still-to-sit case returns the absent wording.

- [ ] **Step 3: Implement the message branches**

In `apps/nexus/src/lib/exam-results-model.ts`, change `buildStudentResultMessage`'s parameter type to add:

```ts
  /** Which sitting they were in. Null when they have no paper. */
  sitting: 'main' | 'second' | null;
```

and replace the no-attempt branch and the rank lines:

```ts
  if (!row.attempt_id) {
    // Two different situations, and conflating them is why this split exists:
    // a student whose window is still open has not missed anything yet.
    if (!row.absent) {
      return {
        subject: `${examTitle}: results are out`,
        plain: `Results for ${examTitle} are out. Your window is still open, so your result is not in this list yet. Sit the paper and you will be ranked with the second sitting.`,
      };
    }
    return {
      subject: `${examTitle}: you were marked absent`,
      plain: `Results for ${examTitle} are out. You were marked absent because no attempt was recorded. If that is wrong, speak to your teacher: they can open a second window for you.`,
    };
  }

  const lines: string[] = [
    `Results for ${examTitle} are out.`,
    ...(input.sitting === 'second'
      ? ['', 'You sat this in the second sitting, after your catch-up.']
      : []),
    '',
    `Your score: ${marks(row.score, row.total_marks)} (${pct(row.percentage)})`,
    input.sitting === 'second'
      ? `Your rank: ${ordinal(row.rank)} of ${input.totalSat} in the second sitting`
      : `Your rank: ${ordinal(row.rank)} of ${input.totalSat}`,
  ];
```

Update the doc comment above the function to record the privacy rule and the sitting:

```ts
 * A second-sitting student is told their rank inside their own sitting and is
 * never told where they would have placed on exam day. That comparison turns
 * into "I would have come second" and undoes the reason for separating the
 * lists at all.
```

`buildExamResultSections` needs no change: it reads `results.stats` and `results.podium`, both of which Task 2 narrowed to the main sitting. Add one line to its doc comment so nobody widens it later:

```ts
 * Built from the MAIN SITTING only. The average and the podium a channel is
 * told on results day have to stay true afterwards, so a later sitting never
 * reaches this card.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/lib/exam-results-model.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Pass the sitting from the notify route**

In `apps/nexus/src/app/api/exams/[examId]/notify/route.ts`, `totalSat` currently counts every non-absent row. Replace it with per-sitting sizes, and pass the sitting through:

```ts
    const sizeOf = (sitting: 'main' | 'second') =>
      rows.filter((r) => !r.absent && r.attempt_id && (r.sitting ?? 'main') === sitting).length;
    const sittingSize = { main: sizeOf('main'), second: sizeOf('second') };
```

Then replace the whole `buildStudentResultMessage({ ... })` call inside `batch.map`, since its inline `row` must now satisfy the widened `RankedCandidate`:

```ts
            const sitting = (row.sitting ?? 'main') as 'main' | 'second';
            const size = sittingSize[sitting];
            const { subject, plain } = buildStudentResultMessage({
              examTitle: exam.title || 'Exam',
              row: {
                student_id: row.student_id,
                student_name: '',
                avatar_url: null,
                attempt_id: row.attempt_id,
                score: Number(row.score) || 0,
                total_marks: Number(row.total_marks) || 0,
                percentage: Number(row.percentage) || 0,
                provisional: row.is_provisional,
                absent: row.absent,
                time_spent_seconds: null,
                section_scores: Array.isArray(row.section_scores) ? (row.section_scores as any) : [],
                rank: row.rank,
                sitting: row.attempt_id ? sitting : null,
                sitting_size: row.attempt_id ? size : 0,
                bucket: row.attempt_id
                  ? sitting === 'second'
                    ? 'second_sitting'
                    : 'exam_day'
                  : row.absent
                    ? 'absent'
                    : 'still_to_sit',
              },
              totalSat: size,
              provisional: row.is_provisional,
              passingPct: exam.passing_pct == null ? null : Number(exam.passing_pct),
              sitting: row.attempt_id ? sitting : null,
            });
```

The existing `notified_at` filter already means a second publish messages only the students the first one did not reach. Leave it exactly as it is, and add a line to the file's doc comment:

```ts
 * The notified_at filter is also what makes the second sitting safe to publish
 * later: the exam day students are not messaged twice.
```

- [ ] **Step 6: Stop the second publish reaching the channel**

The spec says the Teams post is sent on the first publish only. Without a guard, a teacher publishing the second sitting posts the exam day card to the channel a second time, and the class is announced results it already has.

The client must not be the only thing holding this, so guard it in `apps/nexus/src/app/api/exams/[examId]/publish/route.ts`. `nexus_exams.results_published_at` already exists and is written by `setExamResultsState`, so it is the fact to read. Inside POST, after `const exam = access.exam;`:

```ts
    /**
     * The channel hears about an exam once.
     *
     * A second publish exists to add the second sitting, and that sitting is
     * deliberately never announced: naming it would tell forty classmates, and
     * often their parents, exactly who missed the class. So a republish writes
     * rows and sends private messages, and posts nothing.
     */
    const alreadyAnnounced = Boolean(exam.results_published_at);
```

then replace every `postToTeams` in POST with `postToTeams && !alreadyAnnounced`. There are three uses: the delegated-token check near the top, the `if (postToTeams && (classroom as any)?.ms_team_id && graphToken)` block, and nothing else. The simplest correct edit is to narrow the variable once, immediately after it is read from the body:

```ts
    const postToTeams = body?.post_to_teams !== false && !alreadyAnnounced;
```

which requires `alreadyAnnounced` to be declared above it.

- [ ] **Step 7: Verify the guard**

**Do not write an E2E test that publishes.** The publish POST posts a real card to a real classroom's Teams channel, which reaches every student in it and often a parent, and deleting it does not unsee it. No automated test may press that button.

So the guard is verified two ways, neither of which publishes:

1. By reading the code. Run `grep -n "alreadyAnnounced" "apps/nexus/src/app/api/exams/[examId]/publish/route.ts"` and expect at least two lines, including the `postToTeams` assignment.
2. By the client half, asserted in Task 8's component test: once `last_published_at` is set, the sheet neither shows the "Post this to the classroom's Teams channel" checkbox nor sends `post_to_teams: true`.

- [ ] **Step 8: Run the nexus suite and type-check**

Run: `pnpm test:run apps/nexus` then `pnpm type-check --force --filter=@neram/nexus`

Expected: PASS both.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/lib/exam-results-model.ts apps/nexus/src/lib/exam-results-model.test.ts "apps/nexus/src/app/api/exams/[examId]/notify/route.ts" "apps/nexus/src/app/api/exams/[examId]/publish/route.ts"
git commit -m "feat(exams): tell each student which sitting they were ranked in

The channel card stays byte-identical once a second sitting exists, so an
announcement made on results day cannot become wrong later. A student with an
open window is no longer privately told they were marked absent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tell the student before they sit, not after

**Files:**
- Modify: `apps/nexus/src/lib/student-test-card-state.ts:87-100` (`StudentTestFacts`) and `:191-202` (the reopened branch)
- Test: `apps/nexus/src/lib/student-test-card-state.test.ts` (exists)

**Interfaces:**
- Consumes: nothing from earlier tasks. This is pure client-visible copy.
- Produces: `StudentTestFacts` gains `ranks_in_second_sitting?: boolean`. The `reopened` state's `reason` gains one clause when it is true.

- [ ] **Step 1: Write the failing test**

Append to `apps/nexus/src/lib/student-test-card-state.test.ts`:

```ts
describe('the second sitting is announced before the student sits', () => {
  const NOW = Date.parse('2026-09-12T06:00:00.000Z');

  // A student who sits late and learns only afterwards that they were in a
  // separate list will feel cheated, and would be right.
  it('says so on a reopened exam that will be ranked in the second sitting', () => {
    const card = resolveStudentTestCard(
      {
        is_exam: true,
        is_reopen: true,
        access_state: 'granted',
        available_from: '2026-09-11T12:23:00.000Z',
        available_until: '2026-09-19T12:34:00.000Z',
        ranks_in_second_sitting: true,
      },
      NOW,
    );
    expect(card.state).toBe('reopened');
    expect(card.reason).toContain('second sitting');
    expect(card.action.kind).toBe('start');
  });

  it('says nothing about sittings when the reopen is still inside exam day', () => {
    const card = resolveStudentTestCard(
      {
        is_exam: true,
        is_reopen: true,
        access_state: 'granted',
        available_until: '2026-09-19T12:34:00.000Z',
        ranks_in_second_sitting: false,
      },
      NOW,
    );
    expect(card.state).toBe('reopened');
    expect(card.reason).not.toContain('second sitting');
  });

  it('uses no em dash or double dash in the second sitting sentence', () => {
    const card = resolveStudentTestCard(
      { is_exam: true, is_reopen: true, access_state: 'granted', available_until: '2026-09-19T12:34:00.000Z', ranks_in_second_sitting: true },
      NOW,
    );
    expect(card.reason).not.toMatch(/—|--|&mdash;/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/student-test-card-state.test.ts`

Expected: FAIL. `ranks_in_second_sitting` is not a known property, and the reason has no such clause.

- [ ] **Step 3: Add the fact and the clause**

In `apps/nexus/src/lib/student-test-card-state.ts`, add to `StudentTestFacts` after `access_state`:

```ts
  /**
   * True when sitting this now puts the student in the exam's second rank list.
   *
   * Stated on the card BEFORE they sit. Learning afterwards that you were
   * ranked in a separate list, having been given no chance to weigh it, is the
   * kind of surprise a student is right to resent.
   */
  ranks_in_second_sitting?: boolean;
```

In the reopened branch, replace the returned card:

```ts
    const sittingNote = t.ranks_in_second_sitting
      ? ' You will be ranked with the second sitting, because exam day has passed.'
      : '';
    return card(
      'reopened',
      `Your teacher opened this for you.${untilPhrase}${sittingNote}`,
      { kind: sat ? 'retry' : 'start', label: sat ? 'Try again' : 'Start the test' },
      'attention',
    );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/lib/student-test-card-state.test.ts`

Expected: PASS, including the pre-existing 600-plus permutation invariants, which already assert that no state is a dead end, that the banner and the button agree, and that no copy contains an em dash.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/student-test-card-state.ts apps/nexus/src/lib/student-test-card-state.test.ts
git commit -m "feat(tests): warn a student about the second sitting before they sit it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The student's own result carries its sitting

**Files:**
- Modify: `packages/database/src/queries/nexus/exams.ts:487-495` (`NexusStudentExamView['result']`) and `:596-630` (where it is built)
- Modify: `apps/nexus/src/app/api/student/tests/overview/route.ts` (`shapeExam`)
- Modify: `apps/nexus/src/components/tests/StudentTestCard.tsx` (`examResultChip`)
- Test: `packages/database/src/queries/nexus/exams.student-view.test.ts` (exists)

**Interfaces:**
- Consumes: `ExamResultRow.sitting` from Task 3, `ranks_in_second_sitting` from Task 6.
- Produces: `NexusStudentExamView['result']` gains `sitting: 'main' | 'second'`, and its `total_ranked` now counts that student's own sitting. `shapeExam` emits `ranks_in_second_sitting`.

- [ ] **Step 1: Write the failing test**

Append to `packages/database/src/queries/nexus/exams.student-view.test.ts`. Its `COLUMNS` map at the top of the file lists the columns each stubbed table answers with; add `sitting` to the `nexus_exam_results` entry or the stub throws a synthetic 42703 and the whole file fails.

The file already has a `stubClient(seed)` helper keyed by table name, a `baseExam` fixture whose id is `ex1`, and a `COLUMNS` map. Its call signature is `listStudentExams(studentId, classroomId, client)`, student id FIRST. Use all of those rather than introducing new ones.

```ts
describe('a published result names its sitting', () => {
  const resultRow = (student_id: string, sitting: 'main' | 'second', rank: number, percentage: number, absent = false) => ({
    exam_id: 'ex1',
    student_id,
    rank,
    sitting,
    score: percentage,
    total_marks: 100,
    percentage,
    is_provisional: false,
    absent,
  });

  it('counts the second sitting, not everyone who sat', async () => {
    const client = stubClient({
      nexus_exams: [{ ...baseExam, results_state: 'final' }],
      nexus_exam_makeups: [],
      nexus_test_attempts: [],
      nexus_exam_results: [
        resultRow('stu-1', 'second', 2, 76),
        resultRow('other-1', 'second', 1, 90),
        resultRow('other-2', 'main', 1, 95),
        resultRow('other-3', 'main', 2, 80),
        resultRow('other-4', 'main', 3, 70, true),
      ],
    });

    const [view] = await listStudentExams('stu-1', 'c1', client as never);
    expect(view.result).toMatchObject({ rank: 2, sitting: 'second', total_ranked: 2 });
  });

  it('counts the main sitting for a student who sat on the day', async () => {
    const client = stubClient({
      nexus_exams: [{ ...baseExam, results_state: 'final' }],
      nexus_exam_makeups: [],
      nexus_test_attempts: [],
      nexus_exam_results: [
        resultRow('stu-1', 'main', 1, 95),
        resultRow('other-1', 'main', 2, 80),
        resultRow('other-2', 'second', 1, 99),
      ],
    });

    const [view] = await listStudentExams('stu-1', 'c1', client as never);
    expect(view.result).toMatchObject({ rank: 1, sitting: 'main', total_ranked: 2 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run packages/database/src/queries/nexus/exams.student-view.test.ts`

Expected: FAIL. `total_ranked` counts every non-absent row across both sittings, and `sitting` is absent from the result.

- [ ] **Step 3: Narrow the denominator to the student's own sitting**

In `packages/database/src/queries/nexus/exams.ts`, add to the `result` shape in `NexusStudentExamView`:

```ts
    /** Which of the exam's two rank lists this result was ranked in. */
    sitting: 'main' | 'second';
```

and change the comment on `total_ranked` plus the build:

```ts
    /**
     * Non-absent candidates IN THE SAME SITTING, for rendering "Rank 3 of 16".
     * A rank never travels without the denominator it was won against.
     */
    total_ranked: number;
```

Add `sitting` to the snapshot select on line 600:

```ts
      .select('exam_id, student_id, rank, sitting, score, total_marks, percentage, is_provisional, absent')
```

and replace the `result` assignment:

```ts
      if (mine) {
        const sitting = (mine.sitting ?? 'main') as 'main' | 'second';
        result = {
          rank: mine.rank,
          sitting,
          total_ranked: rows.filter((r) => !r.absent && (r.sitting ?? 'main') === sitting).length,
          score: mine.score,
          total_marks: mine.total_marks,
          percentage: mine.percentage,
          is_provisional: mine.is_provisional,
          absent: mine.absent,
        };
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run packages/database/src/queries/nexus/exams.student-view.test.ts`

Expected: PASS, including the four pre-existing reopen tests.

- [ ] **Step 5: Carry it to the card**

`shapeExam` at `apps/nexus/src/app/api/student/tests/overview/route.ts:451` already passes the whole result object through as `exam_result: ev?.result ?? null`, so `sitting` reaches the client the moment it exists on the view. Two things still need doing.

**7a.** `NexusStudentExamView.closes_at` is the RESOLVED window, meaning the student's own make-up or reopen, so it cannot answer "did my window start after exam day ended". Add the exam's own close to the view in `packages/database/src/queries/nexus/exams.ts`, beside `closes_at`:

```ts
  /**
   * The exam's OWN close, not this student's. `closes_at` above is already
   * resolved through the make-up and the reopen, so it cannot say whether a
   * personal window begins after exam day ended.
   */
  exam_closes_at: string;
```

and populate it in the `exams.map(...)` return as `exam_closes_at: exam.closes_at,`.

**7b.** In `shapeExam`, add one field beside `is_reopen` at line 448:

```ts
        // Said BEFORE they sit, while the door is still shut. A personal window
        // that begins after exam day closed will rank them in the second sitting.
        ranks_in_second_sitting: Boolean(
          ev?.is_reopen &&
            ev?.opens_at &&
            ev?.exam_closes_at &&
            Date.parse(ev.opens_at) > Date.parse(ev.exam_closes_at),
        ),
```

**7c.** Name the sitting on the finished card. In `apps/nexus/src/lib/student-test-card-state.ts`, add to `StudentTestFacts`:

```ts
  /** Which sitting their published result was ranked in. Null until results are out. */
  result_sitting?: 'main' | 'second' | null;
```

and in the `done` branch that reports a sat exam, append one clause to the reason:

```ts
    const sittingNote =
      t.result_sitting === 'second' ? ' You were ranked in the second sitting.' : '';
```

used as `` `You sat this on ${on(t.last_submitted_at)}.${sittingNote}` ``. Apply it to every `done` reason that reports a completed sitting, so the two `done` returns cannot drift apart.

Pass it from `shapeExam`: `result_sitting: ev?.result?.sitting ?? null,`.

**7d.** In `apps/nexus/src/components/tests/StudentTestCard.tsx`, add `sitting` to the `exam_result` shape on the `StudentTest` interface at line 66:

```ts
  exam_result?: {
    rank: number | null;
    total_ranked: number;
    sitting?: 'main' | 'second';
```

`examResultChip` at line 114 needs NO change. Its label is already `Rank ${r.rank ?? '-'} of ${r.total_ranked}`, and `total_ranked` is now the student's own sitting, which is the honest part. The sitting is named in the card's sentence instead: a chip reading "Rank 2 of 9 in the second sitting" wraps badly at 375px, and saying it twice on one card is the scattered-status problem the redesign removed.

- [ ] **Step 6: Run the nexus suite, lint and type-check**

Run: `pnpm test:run apps/nexus` then `pnpm type-check --force --filter=@neram/nexus --filter=@neram/database` then `pnpm lint --force --filter=@neram/nexus`

Expected: PASS all three.

- [ ] **Step 7: Commit**

```bash
git add packages/database/src/queries/nexus/exams.ts packages/database/src/queries/nexus/exams.student-view.test.ts apps/nexus/src/app/api/student/tests/overview/route.ts apps/nexus/src/components/tests/StudentTestCard.tsx
git commit -m "feat(tests): show a student their rank inside their own sitting

A rank never travels without the denominator it was won against, which is what
keeps a small second sitting honest without a rule to hide it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The teacher's results screen

`PublishExamResultsDialog.tsx` (303 lines) shows counts, a podium of three and the Teams preview, and never the ranked roster. A teacher cannot currently see who scored what anywhere in Nexus, so two lists would be invisible.

**Files:**
- Create: `apps/nexus/src/components/scheduled-exams/ExamResultsSheet.tsx`
- Delete: `apps/nexus/src/components/scheduled-exams/PublishExamResultsDialog.tsx`
- Modify: `apps/nexus/src/app/(teacher)/teacher/timetable/[classId]/exam/page.tsx:25` (the import) and `:296` (the usage)
- Modify: `apps/nexus/src/app/api/exams/[examId]/publish/route.ts` (GET returns the roster rows)
- Test: `apps/nexus/src/components/scheduled-exams/ExamResultsSheet.test.tsx` (create)
- Test: `tests/e2e/exam-results-sittings-nexus.spec.ts` (create)

**Interfaces:**
- Consumes: `results.rows` (each with `bucket`, `sitting`, `rank`, `sitting_size`), `results.stats.still_to_sit`, `results.second` from Tasks 1 and 2; `warnings` from Task 3.
- Produces: no exported types other than the default-exported component, which keeps the props `PublishExamResultsDialog` had: `{ open, onClose, examId, onPublished? }`.

- [ ] **Step 1: Return the roster from the publish GET**

The GET already returns the whole `results` object, which now carries `rows`. Trim what reaches the client to what the screen renders, since a full `section_scores` array per student is large and unused here. In the GET response, replace `results,` with:

```ts
          results: {
            stats: results.stats,
            second: results.second,
            podium: results.podium,
            drawings_ungraded: results.drawings_ungraded,
            rows: results.rows.map((r) => ({
              student_id: r.student_id,
              student_name: r.student_name,
              avatar_url: r.avatar_url ?? null,
              bucket: r.bucket,
              sitting: r.sitting,
              rank: r.rank,
              sitting_size: r.sitting_size,
              window_closes_at: r.window_closes_at,
              score: r.score,
              total_marks: r.total_marks,
              percentage: r.percentage,
              provisional: r.provisional,
            })),
          },
```

Add the publish timestamp so the screen can say when results last went out. `nexus_exams.results_published_at` already exists (`supabase/migrations/20260827090300_nexus_exams.sql:68`) and is written by `setExamResultsState`, so read it straight off the exam:

```ts
          last_published_at: exam.results_published_at ?? null,
```

- [ ] **Step 2: Write the failing component test**

Create `apps/nexus/src/components/scheduled-exams/ExamResultsSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExamResultsSheet from './ExamResultsSheet';

vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getToken: async () => 'test_token' }),
}));

const PAYLOAD = {
  data: {
    exam: { id: 'e1', title: 'History of Architecture Test', results_state: 'unpublished' },
    results: {
      stats: { roster: 47, sat: 16, absent: 3, still_to_sit: 19, average: 61, highest: 84, lowest: 30, passed: 12, passing_pct: 40 },
      second: { sat: 9, average: 71, highest: 99, lowest: 44, passed: 8 },
      podium: [],
      drawings_ungraded: 0,
      rows: [
        { student_id: '1', student_name: 'Arun', avatar_url: null, bucket: 'exam_day', sitting: 'main', rank: 1, sitting_size: 16, score: 42, total_marks: 50, percentage: 84, provisional: false },
        { student_id: '2', student_name: 'Kaveya', avatar_url: null, bucket: 'second_sitting', sitting: 'second', rank: 1, sitting_size: 9, score: 45, total_marks: 50, percentage: 90, provisional: false },
        { student_id: '3', student_name: 'Zara', avatar_url: null, bucket: 'still_to_sit', sitting: null, rank: null, sitting_size: 0, score: 0, total_marks: 0, percentage: 0, provisional: false, window_closes_at: '2026-09-19T12:34:00.000Z' },
        { student_id: '4', student_name: 'Meera', avatar_url: null, bucket: 'absent', sitting: null, rank: null, sitting_size: 0, score: 0, total_marks: 0, percentage: 0, provisional: false },
      ],
    },
    sections: [],
    provisional: false,
    blockers: [],
    warnings: ['19 students still have an open window. Publishing now announces exam day results only. They will be ranked in the second sitting.'],
    preview: { text: 'preview', html: '<p>preview</p>' },
    last_published_at: null,
  },
};

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => PAYLOAD })) as never;
});

const open = () => render(<ExamResultsSheet open examId="e1" onClose={() => {}} />);

describe('ExamResultsSheet', () => {
  it('opens on exam day and shows only that sitting', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(screen.queryByText('Kaveya')).toBeNull();
    expect(screen.queryByText('Zara')).toBeNull();
  });

  it('filters to the second sitting when that card is pressed', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    fireEvent.click(screen.getByTestId('bucket-second_sitting'));
    await waitFor(() => expect(screen.getByText('Kaveya')).toBeTruthy());
    expect(screen.queryByText('Arun')).toBeNull();
  });

  it('marks the selected filter for assistive technology', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('bucket-exam_day')).toBeTruthy());
    expect(screen.getByTestId('bucket-exam_day').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('bucket-second_sitting').getAttribute('aria-pressed')).toBe('false');
  });

  it('labels the publish button with exactly what pressing it does', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('exam-publish-cta')).toBeTruthy());
    expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish exam day results (1)');
  });

  // The channel hears about an exam once. A republish exists to add the second
  // sitting, which is deliberately never announced.
  it('offers no Teams post once the exam has already been announced', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          ...PAYLOAD.data,
          exam: { ...PAYLOAD.data.exam, results_state: 'final' },
          last_published_at: '2026-08-19T06:00:00.000Z',
        },
      }),
    })) as never;

    open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(screen.queryByText(/Post this to the classroom/i)).toBeNull();
    expect(screen.getByTestId('exam-publish-cta').textContent).toBe('Publish 1 second sitting result');
  });

  it('renders no disabled control anywhere on the sheet', async () => {
    const { container } = open();
    await waitFor(() => expect(screen.getByText('Arun')).toBeTruthy());
    expect(container.querySelectorAll('[disabled], [aria-disabled="true"]')).toHaveLength(0);
  });

  it('shows the open window warning rather than hiding it behind publish', async () => {
    open();
    await waitFor(() =>
      expect(screen.getByText(/19 students still have an open window/)).toBeTruthy(),
    );
  });
});
```

Note: this repo's Nexus tests must not use jest-dom matchers. `toBeInTheDocument` and `toHaveAttribute` pass under Vitest but fail the Nexus `tsc` run. Assert on plain DOM values, as above.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/scheduled-exams/ExamResultsSheet.test.tsx`

Expected: FAIL with a module-not-found error for `./ExamResultsSheet`.

- [ ] **Step 4: Build the sheet**

Create `apps/nexus/src/components/scheduled-exams/ExamResultsSheet.tsx`. Port the whole of `PublishExamResultsDialog.tsx` (the `authFetch` callback, the load effect, `handlePublish`, the section toggles, the Teams preview block and the privacy `Alert` all stay exactly as they are) and add the roster. The structural changes:

1. `PreviewData.results` gains `rows`, `second` and `stats.still_to_sit`, typed to match the payload in the test above. `PreviewData` gains `last_published_at: string | null`.

2. Add the bucket state and the four cards above the list. The cards ARE the filter, matching the Forms-style convention used across Nexus: one tab level, never tabs inside tabs.

```tsx
const BUCKETS = [
  { id: 'exam_day', label: 'Exam day' },
  { id: 'second_sitting', label: 'Second sitting' },
  { id: 'still_to_sit', label: 'Still to sit' },
  { id: 'absent', label: 'Absent' },
] as const;

type BucketId = (typeof BUCKETS)[number]['id'];

const [bucket, setBucket] = useState<BucketId>('exam_day');
const counts = (id: BucketId) => (data?.results.rows ?? []).filter((r) => r.bucket === id).length;
const shown = (data?.results.rows ?? []).filter((r) => r.bucket === bucket);
```

```tsx
<Box
  sx={{
    display: 'flex',
    gap: 1,
    overflowX: 'auto',
    pb: 0.5,
    // The row scrolls inside itself so four cards never push the sheet sideways.
    '&::-webkit-scrollbar': { display: 'none' },
    scrollbarWidth: 'none',
  }}
>
  {BUCKETS.map((b) => {
    const selected = bucket === b.id;
    return (
      <Paper
        key={b.id}
        component="button"
        type="button"
        elevation={0}
        data-testid={`bucket-${b.id}`}
        aria-pressed={selected}
        onClick={() => setBucket(b.id)}
        sx={{
          flex: '0 0 auto',
          minWidth: 92,
          minHeight: 64,
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 2,
          border: 1,
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: selected ? 'action.selected' : 'background.paper',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {counts(b.id)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {b.label}
        </Typography>
      </Paper>
    );
  })}
</Box>
```

3. The list beneath. A ranked row shows its rank, an unranked one does not:

```tsx
<Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
  {shown.map((r) => (
    <Box
      key={r.student_id}
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 48,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="body2" sx={{ width: 28, fontWeight: 700, color: 'text.secondary' }}>
        {r.rank ?? ''}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2">{r.student_name}</Typography>
        {r.window_closes_at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Open until{' '}
            {new Date(r.window_closes_at).toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </Typography>
        )}
      </Box>
      {r.rank != null && (
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {Math.round(r.percentage)}%
        </Typography>
      )}
    </Box>
  ))}
  {shown.length === 0 && (
    <Typography variant="caption" color="text.secondary">
      Nobody is in this group.
    </Typography>
  )}
</Box>
```

4. The publish button. Never disabled: where there is nothing to do, render no button.

```tsx
const examDay = counts('exam_day');
const secondSitting = counts('second_sitting');
const publishedBefore = Boolean(data?.last_published_at);
const cta = !publishedBefore
  ? examDay > 0 || secondSitting > 0
    ? `Publish exam day results (${examDay})`
    : null
  : secondSitting > 0
    ? `Publish ${secondSitting} second sitting result${secondSitting === 1 ? '' : 's'}`
    : null;
```

In `DialogActions`, replace the old button block:

```tsx
{!done && cta && (
  <Button
    variant="contained"
    onClick={handlePublish}
    data-testid="exam-publish-cta"
    sx={{ minHeight: 48 }}
  >
    {publishing ? 'Publishing...' : cta}
  </Button>
)}
{!done && !cta && data?.last_published_at && (
  <Typography variant="caption" color="text.secondary">
    Results last went out on {new Date(data.last_published_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}.
  </Typography>
)}
```

The old button's `disabled={publishing || loading || blockers.length > 0}` goes. A blocker is already rendered as an `Alert` above, and a greyed button carrying a refusal is a dead end. While `publishing` is true the label reads "Publishing..." and `handlePublish` already guards re-entry through its own state.

5. The Teams half of the sheet disappears once the exam has been announced. Wrap the section-toggle block, the preview `Paper`, the "Post this to the classroom's Teams channel" checkbox and the privacy `Alert` in `{!publishedBefore && ( ... )}`, and initialise the state so the server and the client agree:

```tsx
const [postToTeams, setPostToTeams] = useState(true);
// ...after data loads, inside the same effect that sets `data`:
setPostToTeams(!json.data.last_published_at);
```

`handlePublish` keeps sending `post_to_teams: postToTeams`, which is now false on a republish. The server refuses independently (Task 5, Step 6), because the client must not be the only thing standing between a republish and a second announcement to forty students.

6. `DialogTitle` becomes `Results`, and the exam title goes beneath it as a `body2` secondary line.

- [ ] **Step 5: Run the component test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/scheduled-exams/ExamResultsSheet.test.tsx`

Expected: PASS, 7 tests.

- [ ] **Step 6: Switch the caller over and delete the old dialog**

In `apps/nexus/src/app/(teacher)/teacher/timetable/[classId]/exam/page.tsx`:

- Line 25: `import ExamResultsSheet from '@/components/scheduled-exams/ExamResultsSheet';`
- Line 296: `<ExamResultsSheet open={publishOpen} onClose={() => setPublishOpen(false)} examId={exam.id} onPublished={load} />`, props unchanged.
- Lines 245 to 246: the button that opens it reads "Publish results" or "Publish again". It now opens a results screen that a teacher wants to read whether or not they are about to publish, so the label becomes the destination rather than the act:

```tsx
          <Button variant="contained" onClick={() => setPublishOpen(true)} sx={{ minHeight: 48 }} data-testid="open-exam-results">
            Results
          </Button>
```

Then:

```bash
git rm apps/nexus/src/components/scheduled-exams/PublishExamResultsDialog.tsx
```

Run `grep -rn "PublishExamResultsDialog" apps/nexus/src tests/` and confirm it returns nothing before continuing.

- [ ] **Step 7: Write the mobile E2E**

Create `tests/e2e/exam-results-sittings-nexus.spec.ts`:

Follow the navigation pattern already used by `tests/e2e/class-share-nexus-mobile.spec.ts:25-75`: sign in, go to `/teacher/timetable`, click the first class card, then find the control. Do not hardcode a class or exam id, and do not publish: the publish POST posts a real card to a real classroom's Teams channel.

```ts
import { test, expect } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const NEXUS = APP_URLS.nexus;
const BUCKETS = ['exam_day', 'second_sitting', 'still_to_sit', 'absent'] as const;

/**
 * NOTHING HERE PRESSES PUBLISH. That button posts to a real classroom's Teams
 * channel, which reaches every student in it and often a parent, and deleting
 * the post does not unsee it. The sheet is opened and read, never fired.
 */
test.describe('Exam results, two sittings', () => {
  async function openResults(page: import('@playwright/test').Page) {
    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/timetable`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const classCard = page.locator('[class*="MuiBox"]').filter({ hasText: /PM|AM/ }).first();
    if (await classCard.count()) {
      await classCard.click().catch(() => {});
      await page.waitForTimeout(1200);
    }

    const examTab = page.getByRole('tab', { name: 'Exam', exact: true });
    if (await examTab.count()) {
      await examTab.first().click();
      await page.waitForTimeout(600);
    }

    const openBtn = page.getByTestId('open-exam-results');
    test.skip((await openBtn.count()) === 0, 'No class with an exam on screen in this environment');

    const payload = page.waitForResponse(
      (r) => /\/api\/exams\/[^/]+\/publish$/.test(r.url()) && r.request().method() === 'GET',
    );
    await openBtn.first().click();
    return (await (await payload).json()).data;
  }

  test('375px: the API partitions the sittings and the sheet fits the phone', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    const data = await openResults(page);

    // Every roster student is in exactly one bucket, and the four sum to the roster.
    const counts: Record<string, number> = {};
    for (const row of data.results.rows) counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
    expect(Object.keys(counts).every((k) => (BUCKETS as readonly string[]).includes(k))).toBe(true);
    expect(Object.values(counts).reduce((s, n) => s + n, 0)).toBe(data.results.stats.roster);

    // A main rank is only ever won against the main sitting.
    for (const row of data.results.rows.filter((r: { sitting: string }) => r.sitting === 'main')) {
      expect(row.rank === null || row.rank <= (counts.exam_day ?? 0)).toBe(true);
    }

    await expect(page.getByTestId('bucket-exam_day')).toBeVisible();

    // The chip row is the new overflow risk, so check after every filter.
    for (const bucket of BUCKETS) {
      await page.getByTestId(`bucket-${bucket}`).click();
      await page.waitForTimeout(250);
      await assertNoHorizontalOverflow(page);
    }

    await assertTouchTargetSize(page, '[data-testid="bucket-exam_day"]', 44);
    await context.close();
  });

  test('375px: nothing on the sheet is a dead end', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await openResults(page);

    // The machine-checkable form of "never a dead end": a greyed control
    // carrying a refusal states a problem and offers no way out of it.
    expect(
      await page.locator('[role="dialog"] [disabled], [role="dialog"] [aria-disabled="true"]').count(),
    ).toBe(0);

    const cta = page.getByTestId('exam-publish-cta');
    if (await cta.count()) await assertTouchTargetSize(page, '[data-testid="exam-publish-cta"]', 44);
    await context.close();
  });
});
```

Run it once and confirm it did NOT skip. A spec that skips on every run is not testing anything, and the skip message must name which condition fired so the next reader knows what to seed.

- [ ] **Step 8: Run everything**

```bash
pnpm test:run
pnpm type-check --force
pnpm lint --force
pnpm test:e2e tests/e2e/exam-results-sittings-nexus.spec.ts --project=nexus-mobile
```

Expected: the unit suite passes with no new failures against its pre-change baseline; type-check and lint report all tasks successful. If an E2E test fails, first run the unmodified spec from `git show HEAD:<path>` as a control to establish whether the failure pre-existed, before changing any code.

- [ ] **Step 9: Commit**

```bash
git add apps/nexus/src/components/scheduled-exams/ExamResultsSheet.tsx apps/nexus/src/components/scheduled-exams/ExamResultsSheet.test.tsx "apps/nexus/src/app/(teacher)/teacher/timetable/[classId]/exam/page.tsx" "apps/nexus/src/app/api/exams/[examId]/publish/route.ts" tests/e2e/exam-results-sittings-nexus.spec.ts
git commit -m "feat(exams): give teachers a results screen showing both sittings

Four stat cards filter one list: exam day, second sitting, still to sit,
absent. Replaces the publish dialog, which showed counts and a podium of three
and never the roster, so a teacher could not see who scored what anywhere.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Done when

- `pnpm test:run` passes with no new failures against the pre-change baseline.
- `pnpm type-check --force` and `pnpm lint --force` report every task successful.
- Adding any number of second-sitting candidates leaves every main-sitting rank and the rendered Teams text byte-identical, asserted by tests rather than by inspection.
- No user-visible string added by this work contains an em dash or a double dash.
- The teacher's results sheet renders zero disabled controls and no horizontal overflow at 375px under each of the four filters.
- Nothing is deployed. The founder decides when this ships.
