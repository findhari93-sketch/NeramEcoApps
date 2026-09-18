# Attendance register: a place to see who was in class

Status: approved design, not yet implemented.
Date: 2026-09-17.

## The problem

The teacher Attendance page (`/teacher/attendance`) is in the sidebar and in the
phone bottom bar, and nobody uses it. The founder wants it to be a class
attendance register: a place staff open only to look. For every class that has
already happened they should see who attended, who missed with a reason, who
missed without one, and how long each student was really in the live class,
including anyone who joined late, left early or stepped out.

### Why the current page is unused

It cannot work. It calls `/api/attendance` with the wrong parameters and body:

- GET sends `?classroom=&class_id=` (`page.tsx:97-99`); the route needs
  `scheduled_class_id` and returns 400 (`api/attendance/route.ts:21-25`). The page
  also reads `data.students`, which the route never returns.
- POST sends `{class_id, classroom_id, student_ids}` (`page.tsx:178-182`); the
  route needs `{scheduled_class_id, attendees}` and returns 400.
- Its class list comes from `/api/timetable`, which for staff includes drafts,
  cancelled classes and exams, and the default date is the UTC date.

The only working path is the Reconcile button to `/teacher/attendance/[classId]`,
and that page has two problems of its own:

- Its GET (`api/timetable/[classId]/followup`) calls `computeAbsencesForClass`,
  so merely opening it writes absence rows.
- Its Follow up sends through `notifyStudents`, not `sendNudge`, which breaks the
  standing rule in `apps/nexus/CLAUDE.md`.

### What production says

Measured 2026-09-17 against `zdnypksjqnhtiblwdaic`, evening classes since
2026-08-01 (one active classroom, JEE B.Arch Session 1).

| | |
|---|---|
| Lectures in the last 90 days | 33, all published, none cancelled, none batch-scoped |
| Evening classes with Teams attendance read (`attendance_sync_status = ok`) | every one |
| Attendance rows carrying `attendance_intervals` | every Teams row |
| Typical class | about 20 attended, about 17 absence rows |
| Absence rows with no reason | 184 no_show, plus 23 opted_out without a code |
| `late_joiner` absence rows | 71 (enrolled after the class, not really missed) |
| Booked time | 7:00 to 8:30 PM |
| Real end (80% of attendees gone) | between 7:41 and 8:29 PM |

### A defect the same change removes

`class-insights` sets `leftEarly` when a student left more than 10 minutes
before the **booked** end (`api/timetable/class-insights/route.ts:204`). Most
classes really end 15 to 50 minutes before 8:30, so on those nights every attendee is
flagged: 20 of 20 on 15 Sep, 19 of 19 on 11 Sep, 21 of 21 on 3 Sep. The Attended
tab in the timetable and catch-up panel shows this today. `lib/parent-attendance.ts`
carries a copy of the same rule.

## Decisions taken with the founder

1. Layout: one page with two views, **Classes** and **Register** (a grid).
2. Read-only. No marking and no messaging on this page. Corrections and follow
   ups link out to the surfaces that already do them. The broken checkbox
   register, the Reconcile page and its follow-up route are retired.
3. Groups inside a class: **Stayed the whole class**, **Partly there**,
   **Missed, gave a reason**, **Missed, no reason**. Students who joined the
   course after the class are listed apart and never counted as missed.

## Rules

All rules live in one pure module, `apps/nexus/src/lib/attendance-register.ts`,
unit tested, and used by the new endpoint, by `class-insights` and by
`parent-attendance.ts`, so no two screens can disagree.

### Which classes appear

`kind = 'lecture'`, `publish_state = 'published'`, `status` not `cancelled` or
`rescheduled`, in the active classroom, and already over (IST end time passed).
A class with no attendance rows yet still appears, greyed, labelled
"Attendance not read from Teams yet", and is left out of every percentage.

### Who is on the roster for a class

Today's non-dormant roster from `loadClassroomRoster`. A student whose
`enrolled_at` is after the class date (IST end of day) is **joined later** for
that class. If the class has a `batch_id`, only that batch's students count.
Dormant students are hidden, with `PausedFootnote` explaining the count.

### When the class really ran

- **Start**: the booked start. Time in the meeting before it is not counted.
- **End**: the time by which 80% of attendees with a leave time had left.
  Clamped to no earlier than start + 15 min and no later than booked end + 60 min.
  With fewer than 3 attendees carrying times, use the booked end.
- Shown as "held 7:00 to 8:10 PM (booked to 8:30)".

`sessionWindow(classRow, attendanceRows) -> { startMs, endMs, source: 'observed' | 'booked' }`

### Time in class, per student

Built from `attendance_intervals`, each interval clipped to the window. Rows
with only `joined_at`/`left_at` (CSV imports) are one segment, so stepping out
cannot be detected for them.

- **Minutes in class**: the sum of clipped intervals.
- **Joined late**: first join more than 10 min after start (`LATE_THRESHOLD_MINUTES`).
- **Left early**: last leave more than 10 min before the real end.
- **Stepped out**: gaps between intervals of 3 min or more, summed. Shorter gaps
  are reconnects and ignored.
- **Barely there**: minutes below `max(10, 25% of the real length)`. A tag, not a group.

`presenceOf(intervals, joinedAt, leftAt, window) -> { minutesIn, segments[], lateByMin, leftEarlyByMin, outMin, barelyThere, timesKnown }`

### Group, in this order

1. **Stayed the whole class**: attended, no late, early or stepped-out flag.
   A manual row with no times lands here, labelled "Marked present by hand".
2. **Partly there**: attended with any of those flags.
3. **Joined later**: enrolled after the class (or absence `kind = 'late_joiner'`).
   Not counted anywhere.
4. **Missed, gave a reason**: absence `reason_code` or `reason_note`, or an RSVP
   `not_attending` (with or without a code), or `excused_at` set.
5. **Missed, no reason**: everyone else.

Attended is checked first, so a stale absence row never outranks a present mark.
Caught up and recording watched are labels on a missed row, not groups.

`registerGroupOf(input) -> 'whole' | 'partly' | 'joined_later' | 'reason' | 'no_reason'`

### Attendance percentage, per student

`(whole + partly) / (classes shown in range that had attendance read, held after
the student enrolled, not excused)`. Null when the denominator is 0, shown as a dash.

## Screens

Phone first (375px), then 768, 1024, 1440. MUI theme from `@neram/ui`, colours
through `tagSx` and palette tokens only. Every group colour is paired with text
or a letter.

| Group | Tone | Grid letter |
|---|---|---|
| Stayed the whole class | success | F |
| Partly there | warning | P |
| Missed, gave a reason | info | R |
| Missed, no reason | error | X |
| Joined later | neutral | · |
| Attendance not read | neutral, dashed | ? |

### `/teacher/attendance`

`PageHeader` "Attendance", subtitle the classroom name. A range control
(2 weeks, 30 days default, 90 days) and a one-level tab bar (Classes, Register).
Both live in the URL as `?view=classes|register&range=14|30|90`, kept with
`history.replaceState` like the catch-up page.

**Classes view.** One card per class, newest first:

```
Tue 15 Sep   held 7:00 to 8:10 PM
Basic 3D Shape Composition
[##########======....::::::::::::::]
14 whole  6 partly  1 reason  16 no reason   >
```

The whole card is a link to the class screen. The bar is a flex row of four
proportional boxes (no chart library), 8px tall, with an `aria-label` repeating
the counts. Skeleton cards while loading. Empty state: "No classes in this range".

**Register view.** Students down the side, class dates across, newest on the
left so a phone shows recent classes without scrolling.

```
Student       15   11   09   07   05     %
              Tu   Fr   We   Mo   Sa
Student A     F    F    P    F    X     70
Student B     X    R    F    F    F     60
Student C     P    F    F    ·    ·     83
F full class  P partly  R reason  X no reason  · joined later
```

- Name column sticky on the left, % column last. Only the grid scrolls sideways,
  the page never does (allowed by `apps/nexus/CLAUDE.md` for complex tables with
  a sticky first column).
- Cells at least 44px, each with an `aria-label` such as
  "Student A, Tue 15 Sep: left 25 min early, 45 of 70 min".
- `StudentListToolbar` + `useStudentListView` (standing rule) with an extra sort
  "Lowest attendance first" as the default.
- A cell links to the class screen with `?student=<id>`, which scrolls to and
  highlights that row. A date header links to the class screen.

### `/teacher/attendance/[classId]` (replaces the Reconcile page)

```
< Attendance                                  ⋮
Basic 3D Shape Composition
Tue 15 Sep, held 7:00 to 8:10 PM (booked to 8:30)
[<]  class 1 of 12  [>]

[Whole class 14]      [Partly there 6]
[Missed, reason 1]    [Missed, no reason 16]
3 joined the course after this class

PARTLY THERE  6
(o) Student A                        45 of 70 min
    7:00       7:30       8:00  8:10
    |     #######################.....|
    Joined 24 min late. Left 25 min early.

MISSED, NO REASON  16
(o) Student C
    No reason given. Recording not watched.
```

- **Back** is an explicit href to `/teacher/attendance?view=&range=` from the
  URL the user came from, defaulting to the Classes view.
- **Prev / next** step through the classes of the same range, 44px buttons,
  disabled (not hidden) at the ends. The class order comes from the register
  response already in the SWR cache; a cold open (a shared link) fetches it once,
  so the class screen costs at most two requests.
- **Stat tiles are the filters** (`components/tests/StudentStatFilters.tsx`).
  Pressing one shows that group; pressing it again shows all. The joined-later
  line toggles that list.
- **Sections** in tile order. Each present row: `StudentStageAvatar`, name,
  "45 of 70 min", a presence strip across the real window (filled where in the
  meeting, a visible gap where out), and the flags in words. Tapping the row
  expands exact times ("in 7:04 to 7:37, 7:56 to 8:10"). A time axis sits above
  the first strip. On md and up the name, strip and minutes share one line.
- Each missed row: the reason label and the student's own note in quotes, who
  gave it (student or parent, in advance or after), and the catch-up label
  (Caught up, Watched recording, Not started, Excused).
- `StudentListToolbar` (search, stage filter, sort: group order default, name,
  least time first) and `PausedFootnote`.
- **⋮ menu**: "Correct attendance" opens the existing `ClassAttendanceDialog`
  with `initialTab="register"`; "Follow up in Catch-up" links to
  `/teacher/catch-up?tab=classes`. No other actions.
- Loading: skeleton tiles and rows. A class not yet read from Teams shows the
  sync status message instead of the strips.

Motion: the row expand uses `Collapse` and respects `prefers-reduced-motion`.
Focus rings stay visible on cards, tiles, cells and rows.

## Data

### New: `GET /api/attendance/register?classroom_id=&from=&to=`

- Staff only: `canUser(staff, 'coord.attendance.view')`, the same gate as
  `/api/catchup/overview` (`route.ts:88`).
- **Never writes.** No call to `computeAbsencesForClass`, `deriveNoShows` or any
  insert, update, upsert or delete.
- Queries, run in parallel: classes in range, roster, attendance rows (with
  intervals) for those classes, absence rows, RSVP opt-outs.
- `Cache-Control: private, max-age=60`. Read on the client with `useAuthSWR`,
  one request per page view, shared by both views.

```ts
interface RegisterResponse {
  classroom: { id: string; name: string };
  range: { from: string; to: string };
  classes: Array<{
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    held: { start: string; end: string; source: 'observed' | 'booked' } | null;
    measured: boolean;
    sync_status: string | null;
    counts: { whole: number; partly: number; reason: number; noReason: number; joinedLater: number };
  }>;
  students: Array<{
    id: string;
    name: string;
    avatar_url: string | null;
    study_stage: string | null;
    enrolled_at: string | null;
    present: number;
    counted: number;
    rate: number | null;
  }>;
  // cells[classId][studentId]
  cells: Record<string, Record<string, { g: 'whole' | 'partly' | 'reason' | 'no_reason' | 'joined_later'; min?: number; late?: number; early?: number; out?: number }>>;
}
```

### Changed: `GET /api/timetable/class-insights`

Stays the one read for the class screen and the existing panel. Additions only,
so `ClassAttendancePanel` and its call-count tests keep working:

- `summary.held: { start, end, source }` and `summary.heldMinutes`.
- Per student: `segments: Array<{ start: string; end: string }>` (clipped),
  `minutesIn`, `lateByMin`, `leftEarlyByMin`, `outMin`, `group`.
- `joinedLate`, `leftEarly`, `droppedMidClass` (now "stepped out 3 min or more")
  and `barelyAttended` are recomputed through the shared module against the real
  window. This fixes the Attended tab everywhere it is mounted.

### Changed: `lib/parent-attendance.ts`

`parseSegments` and the late/left-early derivation call the shared module, so
parents and teachers read the same facts.

### Retired

- `app/(teacher)/teacher/attendance/page.tsx`: rewritten as the register.
- `app/(teacher)/teacher/attendance/[classId]/page.tsx`: rewritten as the class screen.
- `app/api/timetable/[classId]/followup/route.ts`: deleted. Its only caller is
  the Reconcile page.
- `/api/attendance` stays (it has its own e2e spec and capability checks) but
  loses its only UI caller. Noted for a later cleanup, not removed here.

Navigation is unchanged: sidebar item, bottom-bar slot, dashboard card, flag
`staff.attendance`.

## Testing

- **Unit** (`lib/attendance-register.test.ts`): `sessionWindow` (80% rule, both
  clamps, fewer than 3 attendees), `presenceOf` (clip before start and after end,
  3 min gap threshold, late and early at exactly 10 min, CSV single segment,
  manual row with no times), `registerGroupOf` precedence (attended beats a stale
  absence, joined later never missed, RSVP opt-out without a code is a reason,
  excused is a reason). Fixtures use the interval shapes of the 15 Sep class,
  with names removed.
- **Route** (`api/attendance/register/route.test.ts`): student gets 403, dormant
  students absent, joined-later cells, batch scoping, and a mocked client that
  fails the test on any write method.
- **class-insights**: `leftEarly` false for a student who left with everyone
  20 min before the booked end.
- **Components**: class card counts and href, grid letters and `aria-label`s,
  tiles filter and reset, back link keeps `view` and `range`,
  `ClassAttendancePanel.test.tsx` still passes unchanged.
- **E2E** (`tests/e2e/attendance-register-nexus.spec.ts`, 375px and 1280px): no
  page-level horizontal overflow, touch targets at least 44px, grid scrolls
  inside its container, cell opens the class with the student highlighted, back
  returns to the Register view, student role denied. Entra now forces MFA, so
  automated login may be blocked; if it is, that is reported, not skipped silently.
- **Design review**: ui-ux-pro-max review at 375, 768, 1024 and 1440 before done.

## Out of scope

- Marking or correcting attendance on this page.
- Sending any message from this page.
- Fixing the other broken attendance percentages (`api/students/route.ts`,
  `api/gamification/profile`, `queries/nexus/attendance.ts`), which still count
  `status = 'completed'`. Worth a follow-up; the register does not depend on them.
- Storing Teams `meetingStartDateTime` / `meetingEndDateTime`. The 80% rule is
  enough today; storing them would be a migration.
