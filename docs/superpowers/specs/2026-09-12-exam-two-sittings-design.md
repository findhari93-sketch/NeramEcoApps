# Exam results: two sittings, one paper

Status: approved design, not yet implemented.
Date: 2026-09-12.

## The problem

An exam anchored to a class is sat by two groups of students who are not
competing on the same terms.

The first group attended the class and sat the paper inside the exam's own
window. The second group missed the class, finished their catch-up, earned a
window through a make-up or a teacher's reopen, and sat the paper days or weeks
later, having had that much longer to prepare.

Today both groups land in one ranked list. A student who sat four weeks late can
take first place from a student who sat on the day, and a student who was
punctual has no way to see that punctuality counted for anything.

### What production says

Measured 2026-09-12 against `zdnypksjqnhtiblwdaic`.

| | |
|---|---|
| Ranked exams that exist | 1, History of Architecture Test (`49f6c55a`) |
| Exams ever published | 0 |
| Students who started the paper before it closed | 16 |
| Students who started after it closed | 0 |
| Students holding a live window right now | 28 (26 access grants, 2 make-ups) |

The first podium this school ever announces would be drawn from a pool where
most entrants had four extra weeks. Nothing has been published yet, so there is
no announced result to protect and no data to migrate.

### A second defect the same change removes

`nexus_exam_results.rank` carries this comment
(`supabase/migrations/20260827090300_nexus_exams.sql:101`):

> rank is FROZEN here on purpose. It is named in a Teams post and in a private
> message to each student, so a makeup sitting three days later must not
> silently renumber a podium that has already been announced.

It is not frozen. `saveExamResults` (`packages/database/src/queries/nexus/exams.ts:1089`)
upserts every row on `(exam_id, student_id)`, so publishing a second time
renumbers the whole ladder. A teacher who publishes on the day and republishes
after a make-up has exactly two options today: renumber an announced podium, or
leave the late student with no rank at all.

Partitioning the two sittings removes the choice. A later sitting cannot enter
the main set, so the main ranks are stable by construction and no freeze flag is
needed.

### A third defect, in the absent message

`ExamCandidate.absent` is set to `closed`, meaning the exam's shared window has
passed and nothing was submitted (`exam-results.ts`, inside `getExamResults`).
Publish the History of Architecture exam tomorrow and all 28 students holding a
live window are marked absent. Each then receives, privately:

> You were marked absent because no attempt was recorded.

They are not absent. Their window is open and this design gives them their own
bucket so they are never told otherwise.

## Decisions taken

Decided by the founder on 2026-09-12, in this order.

| Question | Decision |
|---|---|
| What decides which list a student is in | **When they sat it.** Main list is everyone who sat inside the exam's own window; second list is everyone who sat after it closed |
| How the two lists share badges | **The podium belongs to the main list.** Topper and Podium require the main sitting. Points, Personal Best and Regular are earned by both |
| What the Teams channel says about the second list | **Nothing.** The channel post stays as it is today, built from the main sitting, sent once |

This supersedes the decision recorded in
`.claude/plans/this-exam-screen-user-fluffy-scone.md`, which said late sittings
were ranked normally. That was the behaviour at the time; it is what this design
changes.

### Why "when they sat it" and not "did you attend the class"

`apps/nexus/src/lib/exam-eligibility-roster.ts:120` already sorts students into
`mandatory_attended` and `mandatory_caught_up` from real attendance evidence, and
it is the obvious thing to reach for. It is the wrong axis for this, for two
reasons:

1. A student who attended every class but was ill on exam day and sat three weeks
   later still had three extra weeks. Attendance would keep them in the main
   list, which is the exact unfairness this feature exists to remove.
2. A student who missed the class, caught up quickly, and still sat on the day
   met the same deadline as everyone else. Attendance would push them out of the
   main list, which punishes an absence they had already made good and removes
   the incentive to catch up fast.

The deadline is the thing both groups share. It is the fair axis.

Punctual class attendance still matters and is still tracked; it decides whether
a student owes catch-up at all, through the eligibility roster. It does not
decide the rank list.

## The model

### Names

`main` and `second` in code and in the database. User-facing, the teacher screen
says **Exam day** and **Second sitting**.

Nothing a student reads may call it a "catch-up list". That names a student by
what they failed to do, on a permanent record, and this feature is about
recognising punctuality rather than marking absence.

### The rule

A student's sitting is `main` when they **started** the paper before the exam's
shared `closes_at`, and `second` otherwise.

`started_at`, not `submitted_at`. Production already holds a sitting that began
at 17:00 and was submitted at 18:05 against a 17:15 close. That student sat on
the day and overran; treating them as a late sitting would be wrong, and the
overrun case is the common one, not the exception.

The rule deliberately does not read the grant or make-up tables. A grant that
overlaps the normal window should not move anybody, and the only question that
matters is whether the student beat the shared deadline.

### The four buckets

Every student on the roster lands in exactly one.

| Bucket | Meaning |
|---|---|
| `exam_day` | Submitted a paper started before the shared close. Ranked in the main sitting |
| `second_sitting` | Submitted a paper started after the shared close. Ranked in the second sitting |
| `still_to_sit` | No submitted paper, and their personal window is still open |
| `absent` | No submitted paper, and no window is open for them |

`still_to_sit` is resolved through `resolveExamWindowForStudent(exam, makeup, reopen)`,
the function that already decides whether a door is open for one student, with
the make-up and the granted access request passed in. Reusing it means the
teacher's roster and the student's own card cannot disagree about whether
somebody still has time. Loading those rows in batch is already solved by
`loadRunAccessRequests` in `packages/database/src/queries/nexus/run-sittings.ts`.

## Data changes

One migration, `supabase/migrations/20260913100000_nexus_exam_sitting.sql`:

```sql
ALTER TABLE nexus_exam_results
  ADD COLUMN IF NOT EXISTS sitting TEXT NOT NULL DEFAULT 'main'
    CHECK (sitting IN ('main', 'second'));

COMMENT ON COLUMN nexus_exam_results.sitting IS
  'main: started the paper before the exam closed. second: started it after, through a make-up, a reopen or a catch-up unlock. rank is 1-based WITHIN this sitting, so a second sitting can never renumber an announced podium.';
```

The default is correct for every row that exists, because no row exists. No
backfill.

The `rank is FROZEN` comment on `nexus_exam_results.rank` is rewritten in the
same migration to say what is actually true: rank is dense within a sitting, and
the partition, not a freeze, is what protects an announced podium.

## Function changes

### `packages/database/src/queries/nexus/exam-results.ts`

```ts
export type ExamSitting = 'main' | 'second';
export type ExamBucket = 'exam_day' | 'second_sitting' | 'still_to_sit' | 'absent';

export interface ExamCandidate {
  // ... every existing field stays
  /** Null when they have not submitted a paper. */
  sitting: ExamSitting | null;
  bucket: ExamBucket;
}

export interface RankedCandidate extends ExamCandidate {
  /** 1-based, dense, WITHIN this student's sitting. Null unless they sat. */
  rank: number | null;
  /** How many sat in that same sitting, so a rank always has its denominator. */
  sitting_size: number;
}
```

`rankExamCandidates` partitions by `sitting` and runs the existing comparator
once per group. It stays one pure function: percentage descending, then the
faster paper, then the name; ties share a rank and the next rank skips. Students
who did not sit are appended unranked, alphabetically, as today.

`getExamResults` adds `started_at` to `EXAM_ATTEMPT_COLUMNS`, assigns the sitting
and the bucket, and returns:

```ts
stats: { roster, sat, absent, still_to_sit, average, highest, lowest, passed, passing_pct }
```

where every score-derived figure is the **main sitting only**, plus:

```ts
second: { sat, average, highest, lowest, passed } | null   // null when nobody has sat late
```

Keeping `stats` as the main sitting means the Teams post and the dialog header
need no reshaping, and the average a channel was told on results day stays true
forever.

`podium` narrows to main-sitting ranks 1 to 3.

### `apps/nexus/src/lib/exam-badges.ts`

`ExamBadgeInput` gains `sitting: ExamSitting`. Topper and Podium are awarded only
when `sitting === 'main'`, and `candidates` becomes the main-sitting size so the
existing `EXAM_PODIUM_MIN_CANDIDATES` floor of 5 measures the right pool.

Regular, Personal Best and points are unchanged and are earned by both sittings.
A student who caught up and scored well has done real work; this design declines
to award them a scarce placing they did not compete for, and declines equally to
tell them their work was worth nothing.

### `apps/nexus/src/lib/exam-results-model.ts`

`buildExamResultSections` reads main-sitting figures only, so its output is
unchanged for an exam with no late sittings and stays stable for one that
acquires them later.

`buildStudentResultMessage` gains the sitting, and its three branches become:

- Main sitting: "Your rank: 3rd of 16".
- Second sitting: "You sat this in the second sitting. Your rank: 2nd of 9 in that group."
- Absent: unchanged, and now reaches only students in the `absent` bucket.

### `apps/nexus/src/app/api/exams/[examId]/publish/route.ts`

The POST writes the sitting on each row. Notification goes only to rows where
`notified_at is null`, so a teacher publishing the second sitting does not
message the exam-day students a second time.

The existing `warnings[]` array gains one entry when anybody is in
`still_to_sit`, carrying that live count: "19 students still have an open window.
Publishing now announces exam day results only. They will be ranked in the second
sitting."

The Teams post is sent on the first publish only. A second publish writes rows
and sends private messages, and posts nothing to the channel.

Two edge cases, pinned so they are not decided twice:

- The existing blocker "Nobody has sat this exam yet, so there is nothing to
  publish" must count **both** sittings. A teacher who never published on the day
  and comes back once the catch-up group has sat has results to publish, and a
  blocker reading only the main sitting would refuse them.
- A first publish that happens after both groups have sat writes and notifies
  both at once, and posts the channel card from the main sitting. That is
  correct and needs no special case.

## Teacher experience

### The gap being filled

`apps/nexus/src/components/scheduled-exams/PublishExamResultsDialog.tsx` (303
lines) is the only surface a teacher has for results, and it shows counts, a
podium of three and a Teams preview. It never shows the ranked roster. A teacher
currently cannot see who scored what anywhere in Nexus. Two lists are invisible
without fixing that, so the roster is part of this work.

The component becomes `ExamResultsSheet`, opened from the same place on
`apps/nexus/src/app/(teacher)/teacher/timetable/[classId]/exam/page.tsx:296`, and
is reachable both before and after publishing.

### Layout, 375px first

Stat cards are the filter and there is one list beneath them. No tabs inside
tabs, matching the Forms-style convention used across Nexus.

```
┌───────────────────────────────────────────┐
│ Results                                   │
│ History of Architecture Test              │
├───────────────────────────────────────────┤
│ ┌────────┐┌────────┐┌────────┐┌────────┐ │  the cards ARE the filter
│ │Exam day││ Second ││Still to││ Absent │ │  48px tall, own scroll row
│ │   16   ││   9    ││   19   ││   3    │ │  aria-pressed on the selected
│ └────────┘└────────┘└────────┘└────────┘ │
├───────────────────────────────────────────┤
│  1  Kaveya R.          42/50    84%       │
│  2  Hari H.            38/50    76%       │
│  2  Meera S.           38/50    76%       │  ties share, next rank is 4
│  4  ...                                   │
├───────────────────────────────────────────┤
│ 19 students still have an open window.    │
│ Publishing now announces exam day only.   │
│ ┌───────────────────────────────────────┐ │
│ │   Publish exam day results (16)       │ │  48px, label states the act
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

Default filter is Exam day. `still_to_sit` rows show the name and when their
window closes, with no rank. `absent` rows show the name alone.

The publish button is never disabled. Its label says exactly what pressing it
does, and it changes with the state:

| State | Control |
|---|---|
| Nothing published | "Publish exam day results (16)" |
| Exam day published, new second-sitting papers | "Publish 9 second sitting results" |
| Nothing new | No button, and a line reading when results last went out |

A disabled button carrying a refusal is a dead end, which is the same rule the
student test card now follows.

## Student experience

### Before they sit, which is the part that matters

A student who sits late and learns only afterwards that they were in a separate
list will feel cheated, and would be right. The consequence is stated while the
door is still shut, on the card itself:

> Open for you until Sat 19 Sep. You will be ranked with the second sitting,
> because exam day has passed.

This is one clause added to the `reopened` state in
`apps/nexus/src/lib/student-test-card-state.ts`, so the banner and the button
still resolve from a single object and the existing permutation invariants cover
it.

### On the result

| Sitting | Line | Score row |
|---|---|---|
| Main | "You sat this on exam day." | 76% · Rank 3 of 16 |
| Second | "You sat this in the second sitting, after your catch-up." | 76% · Rank 2 of 9 in the second sitting |

A rank always carries its denominator. That is what keeps a small second sitting
honest, and it is why no rule is needed to hide a rank when few people sat.

A second-sitting student is never shown where they would have placed on exam day.
That comparison turns into "I would have come second", and it undoes the reason
for separating the lists at all.

## Deliberately not built

- **No second Teams post, and no public second podium.** Naming a late podium in
  a class channel tells forty classmates, and often their parents, exactly who
  missed the class. That is a permanent public record of an absence and a far
  heavier consequence than the ranking problem being solved.
- **No third sitting.** Two groups answer the question. A ladder of sittings adds
  states nobody asked for.
- **No punctuality streak or attendance badge.** It is a different feature with a
  different data source, and bundling it here would make both harder to judge.
- **No change to class tests.** They are `mode = 'practice'` and already unranked.
- **No rank-hiding threshold.** Considered, using the existing
  `EXAM_PODIUM_MIN_CANDIDATES` of 5, and rejected: the denominator already tells
  the student how small the group is.

## Testing

Unit, run from the repo root with `pnpm test:run`.

- `rankExamCandidates` partition invariant: adding any number of second-sitting
  candidates leaves every main-sitting rank byte-identical. Asserted as an
  invariant over generated inputs, not one example, because this is the property
  the whole design rests on.
- Ties still share a rank and still skip, independently within each sitting.
- The overrun case, pinned from the real production row: started 17:00, submitted
  18:05, exam closes 17:15, resolves to `main`.
- Bucket exclusivity: every roster student lands in exactly one of the four, and
  the four counts sum to the roster size.
- `still_to_sit` beats `absent` for a student holding a live make-up, and for one
  holding a live granted access request.
- `examBadgesFor`: a second-sitting rank 1 earns neither Topper nor Podium, and
  still earns Regular and Personal Best.
- `buildExamResultSections` output is unchanged when second-sitting candidates are
  added to the same results object.
- `buildStudentResultMessage` never produces the absent wording for a student in
  `still_to_sit`.
- No user-visible string added by this feature contains an em dash or a double
  dash.

E2E, `pnpm test:e2e --project=nexus-mobile` and `--project=nexus-chrome`.

- At 375px each stat card filters the list, with no horizontal overflow after any
  of the four.
- Touch targets on the stat cards and the publish button are at least 44px.
- The results sheet contains zero disabled or `aria-disabled` controls.

## Rollout

This touches `packages/database`, so a deploy rebuilds all four apps.

1. Migration applies through the normal deploy pipeline. It is additive with a
   safe default and needs no manual step.
2. Ship before the History of Architecture exam is published. Publishing it under
   today's code would announce a podium drawn from a pool that mostly had four
   extra weeks, and would privately tell 28 students with open windows that they
   were absent.
3. Nothing is deployed without an explicit instruction from the founder.
