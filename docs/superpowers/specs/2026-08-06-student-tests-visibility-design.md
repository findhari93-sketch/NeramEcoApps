# Student Tests: provenance, honest counts, reasons and errors

**Date:** 2026-08-06
**Status:** All phases implemented. Not committed, not deployed, **migrations not applied**.
**Touched:** `apps/nexus`, `packages/database`, root `supabase/migrations`
**Not touched:** `apps/app`, `apps/marketing`, `apps/admin`

**Verified as built:** 3,124 unit tests pass (83 new), `tsc --noEmit` clean on `apps/nexus`,
clean on `packages/database` apart from one pre-existing error in an untouched file
(`auto-messages.test.ts`), `eslint` 0 errors on every touched file. The three migrations reference
only objects confirmed to exist on production.

**Deferred deliberately:** `packages/database/src/types/database.generated.ts` is NOT hand-edited.
It is already stale for `nexus_tests` (missing `test_kind`, `folder_id`, `created_from`,
`is_repository`, `questions_to_serve`, which is why `test-repository.ts` carries `@ts-nocheck`).
Run `pnpm supabase:gen:types` once the migrations are applied and it picks up everything at once.
New code uses `as any` clients, matching the existing pattern.

> **Build cost note.** Phases B, C and D add columns and tables, which forces a type
> regeneration in `packages/database`. Touching a shared package rebuilds all four Vercel
> projects. Unavoidable for a schema change, called out so the deploy cost is not a surprise.
> Phase A deliberately avoids any schema change so it can ship on its own.

## Problem

The teacher hub's **Tests > Student tests** tab is unreadable. Every paper carries a
near-identical auto-generated name, most rows claim "0 attempts", several claim "0 questions",
and nothing says how or when the paper was built. Staff cannot tell a broken test from an
ignored one, cannot see the errors students hit inside a test, cannot see what state a student
is in, and are shown papers belonging to students who graduated.

### What the data actually says

Queried against production on 2026-08-06. 28 student-built tests exist, across 12 students.

| Claim on screen | Reality |
|---|---|
| Six papers show "0 questions"; one shows "4" | Every paper has questions. The 27-question "Puzzle Test" displays 4 |
| Most papers show "0 attempts" | 31 attempts exist: 12 submitted, 10 in progress, 9 abandoned |
| "JEE Paper 2 Practice - 25 questions": 0 attempts | 9 attempts, every one abandoned |
| Titles repeat and contradict their content | "Practice - 0 questions" holds 544 questions |

### Root causes, three separate bugs

**1. Counts are read from one page and reported as totals.**

```
supabase.from('nexus_test_questions').select('test_id').in('test_id', ids).range(0, 100000)
```

`.range(0, 100000)` reads as "everything". It is not. PostgREST applies its own `db-max-rows`
ceiling (1000 on this project) **after** the caller's range, and returns a short page with no
error and no truncation flag. The 28 tests hold 1,236 question rows between them, so 236 rows
were silently dropped. Truncation follows the index order of the `.in()` column, so *which*
tests break is arbitrary and shifts as rows are added, which is why it was never reproducible
enough to notice. Verified by recomputing the cut in SQL: ordering by `test_id` and taking the
first 1000 rows reproduces the screen exactly, including Puzzle Test showing 4 of its 27.

Six call sites shared the pattern, including the students' own Tests page.

**2. Attempts count submissions only.** The route filtered
`status='submitted' AND mode='official'`, so a paper opened nine times and abandoned nine times
reported zero. That inverts the meaning: it reads as a student ignoring their own work when it
in fact means a student who cannot finish it. Unfinished sittings are the more actionable half
of the number and were the half being discarded.

**3. Nothing about the build is stored.** `POST /api/question-bank/custom-tests` accepts title,
question ids and timer settings. The exam, year, session, category, difficulty, format, topic
and search filters the student used live in page state and the URL, and are discarded at
submit. `created_from` is NULL on every student test except the two "Fix my mistakes" papers.

The bad titles are a separate, already-fixed bug: the auto-title effect ran once per mount with
a stale selection, which is how a 544-question paper is called "Practice - 0 questions". The fix
landed at [questions/page.tsx:211](../../apps/nexus/src/app/(student)/student/question-bank/questions/page.tsx#L211);
the historical rows keep their bad names and always will, because renaming a student's own work
is not ours to do.

## Goals

1. Every number on the screen is true.
2. A teacher can tell, without opening the paper, what is in it and how it was built.
3. A test that is broken looks different from a test that is hard, which looks different from a
   test that was ignored.
4. Students can say why they did not do, or could not finish, a test, and staff can read it.
5. A student's name is never shown without their study stage and participation state.
6. Alumni papers are gone.

## Phase A: make the numbers true

No migration. No shared-schema change. Ships alone.

### A1. `packages/database/src/utils/paged-rows.ts`

Three exports, the fix for a class of bug rather than one instance:

- `fetchAllRows(build)`, runs a query to exhaustion in 500-row pages. `build` is a **factory**,
  not a query, because a PostgREST builder is single-use: calling `.range()` twice on one
  instance mutates and re-sends the same request.
- `countRowsByKey(build, key)`, the tally all six call sites were hand-rolling. Returns a `Map`
  so a missing key cannot be confused with a zero, and so uuid keys cannot collide with
  `Object.prototype`.
- `countRowsForIds(client, table, keyColumn, ids, refine?)`, additionally chunks the id list at
  200 so a long `.in()` cannot overflow the URL into a 414.

Page size is 500, deliberately **below** the 1000 server cap: a page that comes back exactly
full is indistinguishable from one that was truncated, and the loop needs a short page to know
it has finished. A page error throws rather than returning what arrived, because a partial
tally that reports itself as complete is the exact failure being fixed.

Applied at all six sites:

| File | What it was miscounting |
|---|---|
| `apps/nexus/src/app/api/question-bank/tests/student-tests/route.ts` | questions per student test |
| `apps/nexus/src/app/api/student/tests/overview/route.ts` | questions on the student's own Tests page |
| `packages/database/src/queries/nexus/test-repository.ts` (x2 pairs) | questions and attempts, Library and By-location tabs |
| `packages/database/src/queries/nexus/class-test.ts` | questions behind "pass at 6 of 8" |

`class-test.ts` keeps its documented soft-fail: a failed tally costs the card a line, it must
not cost the teacher the card.

### A2. Attempts, told honestly

The route returns three numbers instead of one:

- `attempts`, finished sittings. Keeps its old meaning so existing readers are unaffected.
- `attempts_started`, every sitting.
- `attempts_unfinished`, in progress plus abandoned.

The row renders `attemptSummary()`: "Never opened", "9 tries, none finished", "1 attempt,
2 unfinished". A paper with tries but no finishes also carries an amber **Unfinished** chip,
because it is the one row on the screen a teacher should chase. Best score still comes from
official submissions only, so a revision run cannot move a reported result.

Created date joins the caption.

### A3. Alumni removed

The student-tests query now resolves `users.is_alumni` and drops those rows, matching what
[`loadClassroomRoster`](../../packages/database/src/queries/nexus/roster.ts) already does on
every other Nexus surface. Removes 8 papers across 6 graduated students. Rows whose user embed
does not resolve are dropped too, rather than rendered as "Unknown student", which was never
information anyone could act on.

### A4. Tests

`packages/database/src/utils/paged-rows.test.ts`, 14 tests. The fake PostgREST honours the
caller's range but caps at 1000 rows and reports no error, so it fails against the old code and
passes against the new. One test asserts the fake is faithful by reproducing the original
truncation (200 rows in, 100 counted). Others cover the exact production shape (1,236 rows
across 28 keys), the page-boundary case, throw-on-error, missing and non-string keys,
`Object.prototype` shadowing, id chunking, and cross-chunk summing.

## Phase B: what the test is and how it was built

One migration adds two `jsonb` columns to `nexus_tests`:

**`source_filters`**, what the student asked for. Written by `POST /api/question-bank/custom-tests`
from the builder's live filter state: exam, year, session, categories, difficulty, formats,
topic ids, attempt status, search text, and whether the selection was hand-picked or came from
"select all matching". Exact, but only available from the day it ships.

**`content_summary`**, what the paper actually contains. Computed in `composeTest` from the
questions themselves: count, category mix, difficulty spread, source papers, exam and year
spread. Works retroactively, so the migration **backfills all 28 existing tests** and every old
paper gains a real description.

Both are needed. `source_filters` alone leaves the existing 28 unexplained; `content_summary`
alone records what landed in the paper rather than what the student went looking for.

Stored rather than derived on read because a student test is immutable once composed (there is
no student edit path), so the summary cannot drift, and because deriving it live would mean
joining up to 544 question rows per row of a list view.

### Rendering

The row leads with the derived label, "JEE Paper 2 2009, 50 Q, mostly Aptitude, medium", and
shows the stored title underneath: the same two-line pattern
[`TestRow`](../../apps/nexus/src/app/(teacher)/teacher/tests/page.tsx#L97) already uses for
`context_label`. A **How this was built** expander shows the exact filters when
`source_filters` is present, plus the creation timestamp. The student's own title is never
rewritten, only demoted when it carries no information.

## Phase C: reasons

New `apps/nexus/src/lib/test-reasons.ts`, mirroring the shape of
[`prework-reasons.ts`](../../apps/nexus/src/lib/prework-reasons.ts) (codes, labels, short
labels, `requiresNote`, tally and describe helpers) but with two codes that vocabulary lacks and
this feature exists to capture:

| Code | Label | Why it is new |
|---|---|---|
| `technical_problem` | Something went wrong and I could not continue | Separates broken from hard |
| `too_hard` | It was too hard for me | Separates hard from ignored |

Plus `not_understood`, `no_time`, `unwell`, `other` carried over so a teacher's tally stays one
set of words.

**Abandon reason.** `navigator.sendBeacon` fires on unload, so there is no UI moment at the
point of abandoning. The attempt is marked abandoned as it is today by
[`/api/tests/attempt/abandon`](../../apps/nexus/src/app/api/tests/attempt/abandon/route.ts); the
next time the student opens Tests, a one-tap sheet asks "You left X unfinished, what happened?"
Stored on the attempt as `abandon_reason_code`, `abandon_reason_note`, `abandon_reason_at`.

**Not-started reason.** New `nexus_test_skip_reasons` (student, test, placement, code, note,
created_at), available on an assigned test before its deadline.

Both surface in the teacher's Results tab and as a tally on the list row. The 19 unfinished
attempts already in production get no reason retroactively; they are visible via A2 regardless.

## Phase D: errors, three streams in one panel

1. **Student-reported question problems.** `nexus_qb_question_reports` already exists and holds
   3 open rows nobody has seen, because the only surface for them is
   `/teacher/question-bank/reports` and nothing links there from a test. Join by the test's
   question ids, badge the list row, list them on the test page.
2. **Technical failures during an attempt.** New `nexus_test_attempt_errors` (attempt, test,
   student, question, phase in load/render/image/submit/grade, message, detail jsonb). Written
   by a hook on the take page and by the catch blocks in the attempt routes. This is the
   evidence that distinguishes a broken test from a hard one.
3. **Structural checks**, computed on read, nothing stored: questions since deactivated or
   deleted, no `correct_answer` recorded, missing image URLs, a title that contradicts the
   question count.

## Phase E: the student is never anonymous

A shared `StudentIdentityLine` wrapping the existing
[`StudentStageChip` and `DormantChip`](../../apps/nexus/src/components/students/StudentStageChip.tsx),
fed from `loadClassroomRoster`. Shows avatar, name, study stage (Break Year, Class 12, Class 11,
Class 10, Not set), dormant state with its reason, and exam year. Used on the Student tests
group headers first, then the other Nexus surfaces that name a student without saying what state
they are in.

## Files, as built

| Phase | File | What it is |
|---|---|---|
| A | `packages/database/src/utils/paged-rows.ts` (+ test) | `fetchAllRows` / `countRowsByKey` / `countRowsForIds`, 14 tests |
| B | `supabase/migrations/20260824090000_nexus_test_provenance.sql` | 2 jsonb columns + backfill of every active test |
| B | `packages/database/src/queries/nexus/test-provenance.ts` (+ test) | `buildContentSummary`, `summariseTest`, `storeContentSummary`, 11 tests |
| B | `apps/nexus/src/lib/test-provenance.ts` (+ test) | `describeTestContent`, `isGeneratedTitle`, `meaningfulCategories`, 30 tests |
| C | `supabase/migrations/20260824090100_nexus_test_reasons.sql` | abandon columns + `nexus_test_skip_reasons` |
| C | `apps/nexus/src/lib/test-reasons.ts` (+ test) | the third vocabulary, 19 tests |
| C | `apps/nexus/src/app/api/student/tests/reasons/route.ts` | one route, both reason shapes |
| C | `apps/nexus/src/components/tests/UnfinishedTestSheet.tsx` | skippable bottom sheet / dialog |
| D | `supabase/migrations/20260824090200_nexus_test_attempt_errors.sql` | `nexus_test_attempt_errors` |
| D | `apps/nexus/src/hooks/useTestErrorReporter.ts` | de-duplicating, batching, never-throwing reporter |
| D | `apps/nexus/src/lib/test-health.ts` (+ test) | the three streams combined, 23 tests |
| D | `apps/nexus/src/app/api/question-bank/tests/[id]/health/route.ts` | separate from the detail read, on purpose |
| D | `apps/nexus/src/components/tests/TestHealthPanel.tsx` | renders nothing when nothing is wrong |
| E | `apps/nexus/src/components/students/StudentIdentityLine.tsx` | name + stage + dormant, composed over existing chips |

## Design notes worth keeping

**`meaningfulCategories` drops umbrella categories.** Production has 544-question papers where
`aptitude` has n = 544. "Mostly Aptitude" there is true of the entire question bank and therefore
less informative than silence. A category covering the whole paper is dropped, unless dropping it
would leave nothing.

**`isGeneratedTitle` distinguishes generated from chosen.** `Practice - 10 questions` is demoted
below the derived line; `Puzzle Test` always leads, because a name a student typed is the most
informative thing on the row. `Fix my mistakes (20)` counts as chosen: it is generated, but it
names an intent nothing else conveys.

**The reasons sheet is skippable, and dismissals are not persisted.** "Not now" means not now, not
never. Persisting a dismissal would turn one skipped tap into permanent silence about a paper that
may well be broken. One paper is asked about per visit, newest first, out of at most three.

**`nexus_test_attempt_errors.attempt_id` is nullable.** The most valuable failure is a paper that
will not open, and that never creates an attempt row. A `NOT NULL` there would have silently
discarded the worst category of failure.

**The errors route always answers 200.** A student mid-test must never see an error about the
error reporter, and a 4xx would invite a client retry loop. Only authentication is refused
normally.

## Decisions on record

| Question | Decision |
|---|---|
| Which tests ask for a reason? | Both: abandon reason and not-started reason |
| How is provenance recorded? | Derived from questions **and** filters stored going forward |
| What counts as an error? | All three: reported questions, technical failures, structural checks |
| Alumni tests? | Hidden outright, no toggle |
| Ship order? | Phase A alone and first, no migration; B to F after |

## Out of scope

- Renaming or editing a student's existing papers. Their workspace, not ours.
- Backfilling reasons for the 19 unfinished attempts already in production.
- Deploying. Code changes only, per the standing rule.
