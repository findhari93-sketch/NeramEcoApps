# Attendance Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/teacher/attendance` into a read-only class attendance register that shows, for every class that has already happened, who stayed the whole class, who was only partly there and for how long, who missed with a reason and who missed without one.

**Architecture:** One pure rules module decides when a class really ran, how long each student was in it, and which group they fall in. A new read-only endpoint serves the classes list and the register grid from that module; the existing `class-insights` endpoint serves the per-class screen from the same module, which also fixes the "left early" flag it reports today. No new tables and no migration.

**Tech Stack:** Next.js 14 App Router (client pages), MUI through `@neram/ui`, SWR through `useAuthSWR`, Supabase admin client, Vitest with React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-attendance-register-design.md`

## Global Constraints

- **Copy:** never use em dashes, double dashes or `&mdash;` in any user-visible text. Use commas, colons, periods or parentheses.
- **Mobile first:** design at 375px, then 768, 1024, 1440. No horizontal scroll at the page level. The register grid is the one allowed sideways scroller, inside its own container with a sticky first column.
- **Touch targets:** at least 44px, 8px apart. Visible focus rings. Respect `prefers-reduced-motion`.
- **Icons:** SVG only (`@mui/icons-material`), never emoji.
- **Theme:** colour, type and spacing come from the `@neram/ui` MUI theme and `components/timetable/timetable-theme.ts` (`RADIUS`, `SHADOW`, `tagSx`). Do not introduce new palettes.
- **Student lists:** every full list of students uses `useStudentListView` + `StudentListToolbar`, and shows `PausedFootnote`. Dormant students appear in no list and no count.
- **No jest-dom matchers** in Nexus tests (`toBeInTheDocument` and friends). They pass Vitest but fail `tsc` in this app. Use `expect(x).toBeTruthy()` and query helpers.
- **MUI sx:** never `width: 1` (it means 100%). Write `'1px'`.
- **Sidebar width breaks window breakpoints:** the teacher layout reserves 248px, so `sx` breakpoints measure more room than the content has. Size the grid with flexible widths and its own scroll container, not window breakpoints.
- **Vercel cost:** the new route is per-user authenticated, so `export const dynamic = 'force-dynamic'` is correct here. Set `Cache-Control: private, max-age=60`. One client request per page view through SWR.
- **Read-only:** nothing under `/teacher/attendance` may write. No insert, update, upsert or delete, and no call to `computeAbsencesForClass` or `deriveNoShows`.
- **Tests:** run with `pnpm test:run <path>` from the repo root. Plain `pnpm test` is watch mode. Never pipe `tsc` output into `head`, the exit code then belongs to `head`. Use `pnpm type-check --force` so a Turbo cache hit cannot hide an error.
- **Never deploy or push.** Commits stay local. Confirm with the user before the first commit.
- **Never run a production build while `pnpm dev` is running**, it clobbers `.next`.

---

### Task 1: The rules module

Everything the register knows about time in class, in one pure file with no React and no Supabase.

**Files:**
- Create: `apps/nexus/src/lib/attendance-register.ts`
- Create: `apps/nexus/src/lib/attendance-register.test.ts`

**Interfaces:**
- Consumes: `barelyAttendedCutoff` from `apps/nexus/src/lib/attendance-quality.ts`; `LATE_THRESHOLD_MINUTES` from `apps/nexus/src/lib/class-absences.ts` (value 10).
- Produces, used by every later task:
  - `sessionWindow(cls, rows): SessionWindow` where `SessionWindow = { startMs: number; endMs: number; minutes: number; source: 'observed' | 'booked' }`
  - `presenceOf(row, window): Presence` where `Presence = { minutesIn: number; segments: Segment[]; lateByMin: number; leftEarlyByMin: number; outMin: number; barelyThere: boolean; timesKnown: boolean }` and `Segment = { startMs: number; endMs: number }`
  - `attendanceFlags(presence): { joinedLate: boolean; leftEarly: boolean; droppedMidClass: boolean; barelyAttended: boolean }`
  - `registerGroupOf(input): RegisterGroup` where `RegisterGroup = 'whole' | 'partly' | 'joined_later' | 'reason' | 'no_reason'`
  - `describePresence(presence): string`
  - `GROUP_ORDER`, `GROUP_LABEL`, `GROUP_TONE`, `GROUP_LETTER`
  - `STEPPED_OUT_MIN_MINUTES` (3), `MIN_OBSERVED_ATTENDEES` (3), `OBSERVED_END_QUANTILE` (0.8)

- [ ] **Step 1: Write the failing tests**

Create `apps/nexus/src/lib/attendance-register.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  attendanceFlags,
  describePresence,
  presenceOf,
  registerGroupOf,
  sessionWindow,
} from './attendance-register';

/** The 15 Sep 2026 class: booked 7:00 to 8:30 PM IST, really ended about 8:10. */
const CLASS = { scheduled_date: '2026-09-15', start_time: '19:00:00', end_time: '20:30:00' };
const ist = (hhmm: string) => `2026-09-15T${hhmm}:00+05:30`;

function interval(fromHHMM: string, toHHMM: string) {
  return { joinDateTime: ist(fromHHMM), leaveDateTime: ist(toHHMM) };
}

describe('sessionWindow', () => {
  it('ends the class when 80 percent of attendees have left, not at the booked time', () => {
    const rows = [
      { attended: true, left_at: ist('20:03') },
      { attended: true, left_at: ist('20:10') },
      { attended: true, left_at: ist('20:10') },
      { attended: true, left_at: ist('20:10') },
      { attended: true, left_at: ist('20:13') },
    ];
    const w = sessionWindow(CLASS, rows);
    expect(w.source).toBe('observed');
    expect(new Date(w.endMs).toISOString()).toBe(new Date(ist('20:10')).toISOString());
    expect(w.minutes).toBe(70);
  });

  it('falls back to the booked end when fewer than three attendees have times', () => {
    const w = sessionWindow(CLASS, [{ attended: true, left_at: ist('19:30') }]);
    expect(w.source).toBe('booked');
    expect(w.minutes).toBe(90);
  });

  it('ignores absent rows when reading leave times', () => {
    const rows = [
      { attended: false, left_at: ist('19:05') },
      { attended: false, left_at: ist('19:05') },
      { attended: true, left_at: ist('20:10') },
    ];
    expect(sessionWindow(CLASS, rows).source).toBe('booked');
  });

  it('never ends the class less than 15 minutes after it started', () => {
    const rows = [
      { attended: true, left_at: ist('19:02') },
      { attended: true, left_at: ist('19:03') },
      { attended: true, left_at: ist('19:04') },
    ];
    expect(sessionWindow(CLASS, rows).minutes).toBe(15);
  });

  it('never runs more than an hour past the booked end', () => {
    const rows = [
      { attended: true, left_at: ist('23:00') },
      { attended: true, left_at: ist('23:00') },
      { attended: true, left_at: ist('23:00') },
    ];
    expect(sessionWindow(CLASS, rows).minutes).toBe(150);
  });
});

describe('presenceOf', () => {
  const window = sessionWindow(CLASS, [
    { attended: true, left_at: ist('20:10') },
    { attended: true, left_at: ist('20:10') },
    { attended: true, left_at: ist('20:10') },
  ]);

  it('counts the minutes inside the class only', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('18:55', '20:10')] },
      window,
    );
    expect(p.minutesIn).toBe(70);
    expect(p.lateByMin).toBe(0);
    expect(p.leftEarlyByMin).toBe(0);
    expect(p.timesKnown).toBe(true);
  });

  it('reports joining late and leaving early against the real end', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('19:24', '19:45')] },
      window,
    );
    expect(p.minutesIn).toBe(21);
    expect(p.lateByMin).toBe(24);
    expect(p.leftEarlyByMin).toBe(25);
  });

  it('does not call someone early who left when the class ended', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('19:02', '20:10')] },
      window,
    );
    expect(p.leftEarlyByMin).toBe(0);
  });

  it('adds up gaps of three minutes or more as time stepped out', () => {
    const p = presenceOf(
      {
        attended: true,
        attendance_intervals: [interval('19:04', '19:37'), interval('19:56', '20:10')],
      },
      window,
    );
    expect(p.outMin).toBe(19);
    expect(p.minutesIn).toBe(47);
  });

  it('ignores a reconnect shorter than three minutes', () => {
    const p = presenceOf(
      {
        attended: true,
        attendance_intervals: [interval('19:02', '20:02'), interval('20:04', '20:10')],
      },
      window,
    );
    expect(p.outMin).toBe(0);
  });

  it('treats a row with only joined_at and left_at as one segment', () => {
    const p = presenceOf(
      { attended: true, joined_at: ist('19:02'), left_at: ist('20:10'), attendance_intervals: null },
      window,
    );
    expect(p.minutesIn).toBe(68);
    expect(p.outMin).toBe(0);
    expect(p.timesKnown).toBe(true);
  });

  it('says times are unknown for a row marked present by hand', () => {
    const p = presenceOf({ attended: true, attendance_intervals: null }, window);
    expect(p.timesKnown).toBe(false);
    expect(p.minutesIn).toBe(0);
    expect(p.lateByMin).toBe(0);
    expect(p.barelyThere).toBe(false);
  });

  it('flags a token appearance as barely there', () => {
    const p = presenceOf(
      { attended: true, attendance_intervals: [interval('19:02', '19:10')] },
      window,
    );
    expect(p.barelyThere).toBe(true);
  });
});

describe('attendanceFlags', () => {
  it('reads straight off the presence', () => {
    const flags = attendanceFlags({
      minutesIn: 21,
      segments: [],
      lateByMin: 24,
      leftEarlyByMin: 25,
      outMin: 0,
      barelyThere: false,
      timesKnown: true,
    });
    expect(flags).toEqual({
      joinedLate: true,
      leftEarly: true,
      droppedMidClass: false,
      barelyAttended: false,
    });
  });
});

describe('registerGroupOf', () => {
  const clean = { minutesIn: 70, segments: [], lateByMin: 0, leftEarlyByMin: 0, outMin: 0, barelyThere: false, timesKnown: true };

  it('puts a student who stayed throughout in the whole group', () => {
    expect(registerGroupOf({ attended: true, presence: clean })).toBe('whole');
  });

  it('puts a student with any flag in partly', () => {
    expect(registerGroupOf({ attended: true, presence: { ...clean, leftEarlyByMin: 25 } })).toBe('partly');
    expect(registerGroupOf({ attended: true, presence: { ...clean, outMin: 19 } })).toBe('partly');
    expect(registerGroupOf({ attended: true, presence: { ...clean, lateByMin: 24 } })).toBe('partly');
  });

  it('keeps a hand-marked student with no times in the whole group', () => {
    expect(registerGroupOf({ attended: true, presence: { ...clean, timesKnown: false, minutesIn: 0 } })).toBe('whole');
  });

  it('lets attendance beat a stale absence row', () => {
    expect(
      registerGroupOf({ attended: true, presence: clean, absence: { reason_code: 'unwell' } }),
    ).toBe('whole');
  });

  it('never counts a student who enrolled after the class as missing', () => {
    expect(registerGroupOf({ attended: false, joinedAfterClass: true })).toBe('joined_later');
    expect(
      registerGroupOf({ attended: false, joinedAfterClass: true, absence: { reason_code: null } }),
    ).toBe('joined_later');
  });

  it('counts a reason, a note, an advance opt out or an excuse as a reason', () => {
    expect(registerGroupOf({ attended: false, absence: { reason_code: 'clash' } })).toBe('reason');
    expect(registerGroupOf({ attended: false, absence: { reason_note: 'had fever' } })).toBe('reason');
    expect(registerGroupOf({ attended: false, rsvp: 'not_attending' })).toBe('reason');
    expect(registerGroupOf({ attended: false, absence: { excused_at: ist('20:00') } })).toBe('reason');
  });

  it('leaves a silent absence in no reason, even once caught up', () => {
    expect(registerGroupOf({ attended: false, absence: { caught_up_at: ist('20:00') } })).toBe('no_reason');
    expect(registerGroupOf({ attended: false })).toBe('no_reason');
  });
});

describe('describePresence', () => {
  it('says what happened in plain words', () => {
    expect(
      describePresence({
        minutesIn: 21,
        segments: [],
        lateByMin: 24,
        leftEarlyByMin: 25,
        outMin: 19,
        barelyThere: false,
        timesKnown: true,
      }),
    ).toBe('Joined 24 min late. Left 25 min early. Stepped out 19 min.');
  });

  it('says nothing for a clean attendance', () => {
    expect(
      describePresence({ minutesIn: 70, segments: [], lateByMin: 0, leftEarlyByMin: 0, outMin: 0, barelyThere: false, timesKnown: true }),
    ).toBe('');
  });

  it('explains a hand-marked row', () => {
    expect(
      describePresence({ minutesIn: 0, segments: [], lateByMin: 0, leftEarlyByMin: 0, outMin: 0, barelyThere: false, timesKnown: false }),
    ).toBe('Marked present by hand, no times.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run apps/nexus/src/lib/attendance-register.test.ts`
Expected: FAIL, "Failed to resolve import ./attendance-register".

- [ ] **Step 3: Write the module**

Create `apps/nexus/src/lib/attendance-register.ts`:

```ts
/**
 * What a class's attendance looks like as a register, as plain functions.
 *
 * The one non-obvious rule lives here. A class is booked 7:00 to 8:30 PM but
 * really ends when the teacher ends the meeting, which in production is 15 to 50
 * minutes early. Measuring "left early" against the booked end flagged every
 * attendee of every class, which is how a true flag became a meaningless one.
 * So the end of the class is read off the room itself: the moment by which 80%
 * of the people who came had gone.
 *
 * No React, no Supabase. The register endpoint, the class screen and the parent
 * view all answer from here, so no two screens can disagree about the same night.
 */
import { barelyAttendedCutoff } from './attendance-quality';
import { LATE_THRESHOLD_MINUTES } from './class-absences';

/** A gap this long or longer means they stepped out. Shorter is a reconnect. */
export const STEPPED_OUT_MIN_MINUTES = 3;

/** Below this many attendees with times, the room cannot tell us when it ended. */
export const MIN_OBSERVED_ATTENDEES = 3;

/** The class ended when this share of attendees had left. */
export const OBSERVED_END_QUANTILE = 0.8;

/** A class cannot be measured as shorter than this. */
export const MIN_SESSION_MINUTES = 15;

/** Nor as running longer than this past its booked end. */
export const MAX_OVERRUN_MINUTES = 60;

const MS_PER_MIN = 60_000;

export interface RawInterval {
  joinDateTime?: string | null;
  leaveDateTime?: string | null;
  durationInSeconds?: number | null;
}

export interface Segment {
  startMs: number;
  endMs: number;
}

export interface SessionWindow {
  startMs: number;
  endMs: number;
  /** Whole minutes from start to end. */
  minutes: number;
  source: 'observed' | 'booked';
}

export interface Presence {
  minutesIn: number;
  segments: Segment[];
  lateByMin: number;
  leftEarlyByMin: number;
  outMin: number;
  barelyThere: boolean;
  /** False for a row marked by hand, which carries no join or leave time. */
  timesKnown: boolean;
}

interface ClassTimes {
  scheduled_date: string;
  start_time: string;
  end_time: string;
}

interface LeaveRow {
  attended?: boolean | null;
  left_at?: string | null;
}

const minutesBetween = (fromMs: number, toMs: number) => Math.round((toMs - fromMs) / MS_PER_MIN);

/** When the class was booked to run, in epoch ms, IST. */
function bookedWindow(cls: ClassTimes): { startMs: number; endMs: number } {
  return {
    startMs: Date.parse(`${cls.scheduled_date}T${cls.start_time}+05:30`),
    endMs: Date.parse(`${cls.scheduled_date}T${cls.end_time}+05:30`),
  };
}

/**
 * When the class actually ran.
 *
 * The end is the 80th percentile of the attendees' leave times, which is the
 * moment the room emptied: Teams drops everyone together when the organiser ends
 * the meeting, so the leave times bunch. The two clamps stop a pathological
 * night (everyone gone in the first minute, or one person idling for hours) from
 * producing a window nothing can be measured against.
 */
export function sessionWindow(cls: ClassTimes, rows: LeaveRow[]): SessionWindow {
  const { startMs, endMs: bookedEndMs } = bookedWindow(cls);
  const fallback: SessionWindow = {
    startMs,
    endMs: bookedEndMs,
    minutes: minutesBetween(startMs, bookedEndMs),
    source: 'booked',
  };
  if (!Number.isFinite(startMs) || !Number.isFinite(bookedEndMs)) return fallback;

  const leaves = rows
    .filter((r) => r.attended && r.left_at)
    .map((r) => Date.parse(r.left_at as string))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
  if (leaves.length < MIN_OBSERVED_ATTENDEES) return fallback;

  // The same index Postgres percentile_disc(0.8) picks, so a query written
  // against this rule and the app agree.
  const index = Math.min(leaves.length - 1, Math.ceil(OBSERVED_END_QUANTILE * leaves.length) - 1);
  const observed = leaves[index];
  const floor = startMs + MIN_SESSION_MINUTES * MS_PER_MIN;
  const ceiling = bookedEndMs + MAX_OVERRUN_MINUTES * MS_PER_MIN;
  const endMs = Math.min(Math.max(observed, floor), ceiling);
  return { startMs, endMs, minutes: minutesBetween(startMs, endMs), source: 'observed' };
}

interface AttendanceRow {
  attended?: boolean | null;
  joined_at?: string | null;
  left_at?: string | null;
  attendance_intervals?: RawInterval[] | null;
}

/** Every stretch this student was in the room, clipped to the class itself. */
function segmentsOf(row: AttendanceRow, window: SessionWindow): Segment[] {
  const raw: Array<[number, number]> = [];
  if (Array.isArray(row.attendance_intervals) && row.attendance_intervals.length) {
    for (const i of row.attendance_intervals) {
      raw.push([Date.parse(String(i?.joinDateTime)), Date.parse(String(i?.leaveDateTime))]);
    }
  } else if (row.joined_at) {
    // A CSV import keeps only the first join and the last leave, so it can never
    // show stepping out. One segment is the honest reading of it.
    raw.push([Date.parse(row.joined_at), row.left_at ? Date.parse(row.left_at) : window.endMs]);
  }

  return raw
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e))
    .map(([s, e]): Segment => ({
      startMs: Math.max(s, window.startMs),
      endMs: Math.min(e, window.endMs),
    }))
    .filter((seg) => seg.endMs > seg.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

/** How long this student was really in this class, and what that says. */
export function presenceOf(row: AttendanceRow, window: SessionWindow): Presence {
  const segments = segmentsOf(row, window);
  if (!segments.length) {
    return {
      minutesIn: 0,
      segments: [],
      lateByMin: 0,
      leftEarlyByMin: 0,
      outMin: 0,
      barelyThere: false,
      timesKnown: false,
    };
  }

  const minutesIn = Math.round(
    segments.reduce((total, s) => total + (s.endMs - s.startMs), 0) / MS_PER_MIN,
  );

  const lateRaw = minutesBetween(window.startMs, segments[0].startMs);
  const earlyRaw = minutesBetween(segments[segments.length - 1].endMs, window.endMs);

  let outMin = 0;
  for (let i = 1; i < segments.length; i++) {
    const gap = minutesBetween(segments[i - 1].endMs, segments[i].startMs);
    if (gap >= STEPPED_OUT_MIN_MINUTES) outMin += gap;
  }

  return {
    minutesIn,
    segments,
    lateByMin: lateRaw > LATE_THRESHOLD_MINUTES ? lateRaw : 0,
    leftEarlyByMin: earlyRaw > LATE_THRESHOLD_MINUTES ? earlyRaw : 0,
    outMin,
    barelyThere: minutesIn < barelyAttendedCutoff(window.minutes),
    timesKnown: true,
  };
}

/** The four flags the older panel fields are named after. */
export function attendanceFlags(presence: Presence): {
  joinedLate: boolean;
  leftEarly: boolean;
  droppedMidClass: boolean;
  barelyAttended: boolean;
} {
  return {
    joinedLate: presence.lateByMin > 0,
    leftEarly: presence.leftEarlyByMin > 0,
    droppedMidClass: presence.outMin > 0,
    barelyAttended: presence.barelyThere,
  };
}

export type RegisterGroup = 'whole' | 'partly' | 'joined_later' | 'reason' | 'no_reason';

export interface GroupInput {
  attended?: boolean | null;
  presence?: Presence | null;
  /** Their enrolment began after this class ran, so nothing was expected of them. */
  joinedAfterClass?: boolean;
  rsvp?: string | null;
  absence?: {
    reason_code?: string | null;
    reason_note?: string | null;
    excused_at?: string | null;
    caught_up_at?: string | null;
  } | null;
}

/**
 * Which of the five groups a student is in for this class.
 *
 * Attended is read first, so a stale absence row (nothing deletes one when a
 * teacher marks somebody present by hand) can never put a student who sat
 * through the class onto a chase list. Joined later outranks both reason checks,
 * because a student who enrolled afterwards has nothing to explain. Caught up is
 * deliberately NOT a group: it is a label on a row, and the question this screen
 * answers is who was in the room.
 */
export function registerGroupOf(input: GroupInput): RegisterGroup {
  if (input.attended) {
    const p = input.presence;
    if (!p || !p.timesKnown) return 'whole';
    return p.lateByMin > 0 || p.leftEarlyByMin > 0 || p.outMin > 0 ? 'partly' : 'whole';
  }
  if (input.joinedAfterClass) return 'joined_later';
  const explained =
    !!input.absence?.reason_code ||
    !!input.absence?.reason_note ||
    !!input.absence?.excused_at ||
    input.rsvp === 'not_attending';
  return explained ? 'reason' : 'no_reason';
}

export const GROUP_ORDER: RegisterGroup[] = ['whole', 'partly', 'reason', 'no_reason', 'joined_later'];

export const GROUP_LABEL: Record<RegisterGroup, string> = {
  whole: 'Stayed the whole class',
  partly: 'Partly there',
  reason: 'Missed, gave a reason',
  no_reason: 'Missed, no reason',
  joined_later: 'Joined the course later',
};

export const GROUP_TONE: Record<RegisterGroup, 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
  whole: 'success',
  partly: 'warning',
  reason: 'info',
  no_reason: 'error',
  joined_later: 'neutral',
};

/** The register grid's letter, so colour is never the only signal. */
export const GROUP_LETTER: Record<RegisterGroup, string> = {
  whole: 'F',
  partly: 'P',
  reason: 'R',
  no_reason: 'X',
  joined_later: '·',
};

/** What happened, in words a teacher would use. Empty when nothing did. */
export function describePresence(presence: Presence): string {
  if (!presence.timesKnown) return 'Marked present by hand, no times.';
  const parts: string[] = [];
  if (presence.lateByMin > 0) parts.push(`Joined ${presence.lateByMin} min late`);
  if (presence.leftEarlyByMin > 0) parts.push(`Left ${presence.leftEarlyByMin} min early`);
  if (presence.outMin > 0) parts.push(`Stepped out ${presence.outMin} min`);
  return parts.length ? `${parts.join('. ')}.` : '';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run apps/nexus/src/lib/attendance-register.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/lib/attendance-register.ts apps/nexus/src/lib/attendance-register.test.ts
git commit -m "feat(nexus): attendance rules read the class's real end time"
```

---

### Task 2: class-insights answers from the rules module

This is the bug fix. The same change corrects the Attended tab everywhere the class panel is mounted (timetable dialog and catch-up drawer).

**Files:**
- Modify: `apps/nexus/src/app/api/timetable/class-insights/route.ts:112-232` and its response `summary` block at `:267-293`
- Modify: `apps/nexus/src/components/timetable/attendance/types.ts` (`StudentInsight`, `Insights['summary']`)
- Test: `apps/nexus/src/lib/attendance-register.test.ts` (add one composition case)

**Interfaces:**
- Consumes: `sessionWindow`, `presenceOf`, `attendanceFlags`, `registerGroupOf` from Task 1.
- Produces: `class-insights` response gains `summary.held: { start: string; end: string; source: 'observed' | 'booked'; minutes: number }` and per student `minutesIn: number`, `lateByMin: number`, `leftEarlyByMin: number`, `outMin: number`, `segments: Array<{ start: string; end: string }>`, `group: RegisterGroup`. Existing fields keep their names and meanings.

- [ ] **Step 1: Write the failing test**

Append to `apps/nexus/src/lib/attendance-register.test.ts`:

```ts
describe('the class-insights regression', () => {
  it('does not flag a whole class of students who left when the meeting ended', () => {
    // 15 Sep: booked to 8:30 PM, the room emptied at 8:10. Every one of these
    // students was flagged "left early" before the window was measured.
    const leaves = ['20:03', '20:10', '20:10', '20:10', '20:13'];
    const rows = leaves.map((t) => ({
      attended: true,
      attendance_intervals: [interval('19:03', t)],
      left_at: ist(t),
    }));
    const window = sessionWindow(CLASS, rows);
    const flagged = rows.filter((r) => attendanceFlags(presenceOf(r, window)).leftEarly);
    expect(flagged.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it passes already**

Run: `pnpm test:run apps/nexus/src/lib/attendance-register.test.ts`
Expected: PASS. Task 1 built the rule; this case pins the production bug so a later change cannot bring it back. If it fails, fix Task 1 before touching the route.

- [ ] **Step 3: Wire the route to the module**

In `apps/nexus/src/app/api/timetable/class-insights/route.ts`, add to the imports from `@/lib/attendance-quality` a new import line:

```ts
import {
  attendanceFlags,
  presenceOf,
  registerGroupOf,
  sessionWindow,
} from '@/lib/attendance-register';
```

Replace the window maths at `:112-116`:

```ts
    // How long the class was booked for, and how long it actually ran. The
    // second is what every flag below is measured against.
    const held = sessionWindow(cls, attendance || []);
    const lengthMinutes = spanMinutes(cls.start_time, cls.end_time);
    const barelyCutoff = barelyAttendedCutoff(held.minutes);
```

Delete the now unused `startMs`, `endMs` and `graceMs` constants.

Inside `students = members.map(...)`, replace the `joinedMs` / `leftMs` / `segments` lines with:

```ts
      const presence = presenceOf(a || {}, held);
      const flags = attendanceFlags(presence);
```

and replace the four flag fields in the row literal with:

```ts
        joinedLate: attended && flags.joinedLate,
        leftEarly: attended && flags.leftEarly,
        droppedMidClass: attended && flags.droppedMidClass,
        barelyAttended: attended && flags.barelyAttended,
        minutesIn: attended ? presence.minutesIn : 0,
        lateByMin: presence.lateByMin,
        leftEarlyByMin: presence.leftEarlyByMin,
        outMin: presence.outMin,
        segments: presence.segments.map((s) => ({
          start: new Date(s.startMs).toISOString(),
          end: new Date(s.endMs).toISOString(),
        })),
```

Change the last line of the map from `return { ...row, bucket: bucketFor(row) };` to:

```ts
      return {
        ...row,
        bucket: bucketFor(row),
        group: registerGroupOf({
          attended,
          presence,
          joinedAfterClass: row.joinedAfterClass,
          rsvp: row.rsvp,
          absence: row.absence,
        }),
      };
```

In the response `class` block, add after `has_meeting: !!cls.teams_meeting_id,`:

```ts
        // The id itself, not just whether one exists: the class screen mounts
        // ClassAttendanceDialog, whose Sync button needs the real meeting id.
        teams_meeting_id: cls.teams_meeting_id ?? null,
```

In the response `summary`, add after `barelyAttendedCutoff: barelyCutoff,`:

```ts
        // When the class really ran, so the screen can say "held 7:00 to 8:10 PM
        // (booked to 8:30)" instead of measuring everyone against a time the
        // teacher never taught to.
        held: {
          start: new Date(held.startMs).toISOString(),
          end: new Date(held.endMs).toISOString(),
          source: held.source,
          minutes: held.minutes,
        },
```

- [ ] **Step 4: Add the new fields to the shared types**

In `apps/nexus/src/components/timetable/attendance/types.ts`, add to `StudentInsight`:

```ts
  /** Minutes inside the class itself, ignoring time before it started. */
  minutesIn: number;
  lateByMin: number;
  leftEarlyByMin: number;
  outMin: number;
  segments: Array<{ start: string; end: string }>;
  group: 'whole' | 'partly' | 'joined_later' | 'reason' | 'no_reason';
```

to `Insights['summary']`:

```ts
  held: { start: string; end: string; source: 'observed' | 'booked'; minutes: number };
```

and to `Insights['class']`:

```ts
  teams_meeting_id: string | null;
```

- [ ] **Step 5: Run the existing panel tests and the type check**

Run: `pnpm test:run apps/nexus/src/components/timetable/attendance/ClassAttendancePanel.test.tsx`
Expected: PASS, unchanged. The panel reads only fields that still exist.

Run: `pnpm type-check --force --filter=@neram/nexus`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/app/api/timetable/class-insights/route.ts apps/nexus/src/components/timetable/attendance/types.ts apps/nexus/src/lib/attendance-register.test.ts
git commit -m "fix(nexus): left early is measured against when the class really ended"
```

---

### Task 3: The register endpoint

**Files:**
- Create: `apps/nexus/src/app/api/attendance/register/route.ts`
- Create: `apps/nexus/src/app/api/attendance/register/route.test.ts`

**Interfaces:**
- Consumes: Task 1's rules; `canUser` from `@/lib/staff-capabilities`; `getSupabaseAdminClient`, `loadClassroomRoster`, `istTodayYmd` from `@neram/database`; `verifyMsToken` from `@/lib/ms-verify`; `joinedAfterClass` from `@/lib/attendance-quality`.
- Produces: `GET /api/attendance/register?classroom_id=&from=&to=` returning `RegisterResponse`, exported as a type from the route file and imported by every UI task:

```ts
export interface RegisterCell {
  g: RegisterGroup;
  min?: number;
  late?: number;
  early?: number;
  out?: number;
}
export interface RegisterClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  held: { start: string; end: string; source: 'observed' | 'booked'; minutes: number } | null;
  measured: boolean;
  sync_status: string | null;
  counts: { whole: number; partly: number; reason: number; noReason: number; joinedLater: number };
}
export interface RegisterStudent {
  id: string;
  name: string;
  avatar_url: string | null;
  study_stage: string | null;
  enrolled_at: string | null;
  present: number;
  counted: number;
  rate: number | null;
}
export interface RegisterResponse {
  classroom_id: string;
  range: { from: string; to: string };
  classes: RegisterClass[];
  students: RegisterStudent[];
  cells: Record<string, Record<string, RegisterCell>>;
  paused_hidden: number;
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/app/api/attendance/register/route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The register is the one attendance surface that may not write. Opening the
 * screen it replaced called computeAbsencesForClass on every GET, so simply
 * looking at a class created rows. The write guard below is the point of this
 * file: any insert, update, upsert or delete fails the test.
 */

const state = vi.hoisted(() => ({
  capability: true,
  classes: [] as Record<string, unknown>[],
  attendance: [] as Record<string, unknown>[],
  absences: [] as Record<string, unknown>[],
  rsvps: [] as Record<string, unknown>[],
  members: [] as Record<string, unknown>[],
  writes: [] as string[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const rows = () => {
    if (table === 'nexus_scheduled_classes') return state.classes;
    if (table === 'nexus_attendance') return state.attendance;
    if (table === 'nexus_class_absences') return state.absences;
    if (table === 'nexus_class_rsvp') return state.rsvps;
    if (table === 'users') return [{ id: 'staff-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true }];
    return [];
  };
  const chain = () => b;
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'order', 'limit']) {
    b[method] = chain;
  }
  for (const method of ['insert', 'update', 'upsert', 'delete']) {
    b[method] = () => {
      state.writes.push(`${table}.${method}`);
      return Promise.resolve({ data: null, error: null });
    };
  }
  b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(onFulfilled);
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => builder(table) }),
  loadClassroomRoster: async () => ({
    members: state.members,
    ids: state.members.map((m) => m.user_id as string),
    dormantIds: [],
    counts: { dormant: 1 },
  }),
  istTodayYmd: () => '2026-09-16',
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'ms-oid-1' }) }));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: () => state.capability }));

const { GET } = await import('./route');

const call = () =>
  GET(
    new NextRequest('http://localhost/api/attendance/register?classroom_id=c1&from=2026-09-01&to=2026-09-16', {
      headers: { Authorization: 'Bearer token' },
    }),
  );

beforeEach(() => {
  state.capability = true;
  state.writes = [];
  state.classes = [
    {
      id: 'class-1',
      title: 'Basic 3D Shape Composition',
      scheduled_date: '2026-09-15',
      start_time: '19:00:00',
      end_time: '20:30:00',
      batch_id: null,
      attendance_sync_status: 'ok',
    },
  ];
  state.members = [
    { user_id: 'stayed', enrolled_at: '2026-06-01T00:00:00Z', batch_id: null, current_standard: 'class_12', user: { name: 'Student A', avatar_url: null } },
    { user_id: 'partly', enrolled_at: '2026-06-01T00:00:00Z', batch_id: null, current_standard: null, user: { name: 'Student B', avatar_url: null } },
    { user_id: 'silent', enrolled_at: '2026-06-01T00:00:00Z', batch_id: null, current_standard: null, user: { name: 'Student C', avatar_url: null } },
    { user_id: 'newcomer', enrolled_at: '2026-09-16T00:00:00Z', batch_id: null, current_standard: null, user: { name: 'Student D', avatar_url: null } },
  ];
  state.attendance = [
    {
      scheduled_class_id: 'class-1',
      student_id: 'stayed',
      attended: true,
      joined_at: '2026-09-15T13:32:00Z',
      left_at: '2026-09-15T14:40:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:32:00Z', leaveDateTime: '2026-09-15T14:40:00Z' }],
    },
    {
      scheduled_class_id: 'class-1',
      student_id: 'partly',
      attended: true,
      joined_at: '2026-09-15T13:56:00Z',
      left_at: '2026-09-15T14:15:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:56:00Z', leaveDateTime: '2026-09-15T14:15:00Z' }],
    },
    {
      scheduled_class_id: 'class-1',
      student_id: 'third',
      attended: true,
      joined_at: '2026-09-15T13:33:00Z',
      left_at: '2026-09-15T14:40:00Z',
      attendance_intervals: [{ joinDateTime: '2026-09-15T13:33:00Z', leaveDateTime: '2026-09-15T14:40:00Z' }],
    },
  ];
  state.absences = [{ scheduled_class_id: 'class-1', student_id: 'silent', kind: 'no_show', reason_code: null, reason_note: null, excused_at: null, caught_up_at: null }];
  state.rsvps = [];
});

describe('GET /api/attendance/register', () => {
  it('never writes to the database', async () => {
    await call();
    expect(state.writes).toEqual([]);
  });

  it('refuses a caller without the attendance capability', async () => {
    state.capability = false;
    const res = await call();
    expect(res.status).toBe(403);
  });

  it('groups each student in the class', async () => {
    const body = await (await call()).json();
    const cells = body.cells['class-1'];
    expect(cells.stayed.g).toBe('whole');
    expect(cells.partly.g).toBe('partly');
    expect(cells.silent.g).toBe('no_reason');
    expect(cells.newcomer.g).toBe('joined_later');
  });

  it('counts each group on the class', async () => {
    const body = await (await call()).json();
    expect(body.classes[0].counts).toEqual({
      whole: 1,
      partly: 1,
      reason: 0,
      noReason: 1,
      joinedLater: 1,
    });
  });

  it('leaves a student who joined later out of their own percentage', async () => {
    const body = await (await call()).json();
    const newcomer = body.students.find((s: { id: string }) => s.id === 'newcomer');
    expect(newcomer.counted).toBe(0);
    expect(newcomer.rate).toBe(null);
  });

  it('reports the real end of the class, not the booked one', async () => {
    const body = await (await call()).json();
    expect(body.classes[0].held.source).toBe('observed');
    expect(body.classes[0].held.minutes).toBe(70);
  });

  it('says how many dormant students were hidden', async () => {
    const body = await (await call()).json();
    expect(body.paused_hidden).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/app/api/attendance/register/route.test.ts`
Expected: FAIL, "Failed to resolve import ./route".

- [ ] **Step 3: Write the route**

Create `apps/nexus/src/app/api/attendance/register/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, istTodayYmd, loadClassroomRoster } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { canUser } from '@/lib/staff-capabilities';
import { joinedAfterClass } from '@/lib/attendance-quality';
import {
  presenceOf,
  registerGroupOf,
  sessionWindow,
  type RegisterGroup,
} from '@/lib/attendance-register';

/**
 * GET /api/attendance/register?classroom_id=&from=&to=   (staff)
 *
 * The whole register in one request: every class that has already happened in
 * the range, every student, and which group each student is in for each class.
 * The Classes list and the grid are two readings of this one payload.
 *
 * READ ONLY, deliberately. The screen this replaced wrote absence rows on every
 * GET, so opening a class to look at it changed the data underneath. Nothing
 * here inserts, updates or deletes, and route.test.ts fails if that changes.
 */

// Per-user authentication on every request, so this cannot be statically
// rendered. The client makes one SWR request per page view and the response
// carries a short private cache.
export const dynamic = 'force-dynamic';

const DEFAULT_RANGE_DAYS = 30;

export interface RegisterCell {
  g: RegisterGroup;
  min?: number;
  late?: number;
  early?: number;
  out?: number;
}

export interface RegisterClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  held: { start: string; end: string; source: 'observed' | 'booked'; minutes: number } | null;
  measured: boolean;
  sync_status: string | null;
  counts: { whole: number; partly: number; reason: number; noReason: number; joinedLater: number };
}

export interface RegisterStudent {
  id: string;
  name: string;
  avatar_url: string | null;
  study_stage: string | null;
  enrolled_at: string | null;
  present: number;
  counted: number;
  rate: number | null;
}

export interface RegisterResponse {
  classroom_id: string;
  range: { from: string; to: string };
  classes: RegisterClass[];
  students: RegisterStudent[];
  cells: Record<string, Record<string, RegisterCell>>;
  paused_hidden: number;
}

/** Plain date arithmetic on a YYYY-MM-DD, no timezone reinterpretation. */
function ymdDaysAgo(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Has this class finished?
 *
 * Nothing in production ever flips a past class to `completed`, so the status
 * column cannot answer this. The clock can.
 */
function hasEnded(scheduledDate: string, endTime: string, now: number): boolean {
  const endMs = Date.parse(`${scheduledDate}T${endTime}+05:30`);
  return Number.isFinite(endMs) && endMs < now;
}

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    // The capability, not user_type === 'admin': the staff tiers exist so a
    // coordinator can read attendance without being an admin.
    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'coord.attendance.view')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }
    const to = request.nextUrl.searchParams.get('to') || istTodayYmd();
    const from = request.nextUrl.searchParams.get('from') || ymdDaysAgo(to, DEFAULT_RANGE_DAYS);

    // Lectures only: an exam row is not a class anybody attends.
    const { data: rawClasses } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, end_time, batch_id, attendance_sync_status')
      .eq('classroom_id', classroomId)
      .eq('kind', 'lecture')
      .eq('publish_state', 'published')
      .not('status', 'in', '(cancelled,rescheduled)')
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date', { ascending: false })
      .order('start_time', { ascending: false });

    const now = Date.now();
    const classes = (rawClasses || []).filter((c: any) => hasEnded(c.scheduled_date, c.end_time, now));
    const classIds = classes.map((c: any) => c.id);

    const empty = { data: [] as any[] };
    const [{ members, counts: rosterCounts }, { data: attendance }, { data: absences }, { data: optOuts }] =
      await Promise.all([
        loadClassroomRoster(classroomId, { client: supabase }),
        classIds.length
          ? supabase
              .from('nexus_attendance')
              .select(
                'scheduled_class_id, student_id, attended, joined_at, left_at, duration_minutes, attendance_intervals',
              )
              .in('scheduled_class_id', classIds)
          : empty,
        classIds.length
          ? supabase
              .from('nexus_class_absences')
              .select(
                'scheduled_class_id, student_id, kind, reason_code, reason_note, excused_at, caught_up_at',
              )
              .in('scheduled_class_id', classIds)
          : empty,
        classIds.length
          ? supabase
              .from('nexus_class_rsvp')
              .select('scheduled_class_id, student_id')
              .eq('response', 'not_attending')
              .in('scheduled_class_id', classIds)
          : empty,
        ]);

    const key = (classId: string, studentId: string) => `${classId}:${studentId}`;
    const attByKey = new Map<string, any>((attendance || []).map((a: any) => [key(a.scheduled_class_id, a.student_id), a]));
    const absByKey = new Map<string, any>((absences || []).map((a: any) => [key(a.scheduled_class_id, a.student_id), a]));
    const optByKey = new Set<string>((optOuts || []).map((o: any) => key(o.scheduled_class_id, o.student_id)));
    const attByClass = new Map<string, any[]>();
    for (const a of attendance || []) {
      const list = attByClass.get(a.scheduled_class_id) || [];
      list.push(a);
      attByClass.set(a.scheduled_class_id, list);
    }

    const tally = new Map<string, { present: number; counted: number }>(
      members.map((m: any) => [m.user_id as string, { present: 0, counted: 0 }]),
    );
    const cells: Record<string, Record<string, RegisterCell>> = {};

    const outClasses: RegisterClass[] = classes.map((cls: any) => {
      const rows = attByClass.get(cls.id) || [];
      const measured = rows.length > 0;
      const window = sessionWindow(cls, rows);
      const counts = { whole: 0, partly: 0, reason: 0, noReason: 0, joinedLater: 0 };
      const classCells: Record<string, RegisterCell> = {};

      for (const m of members as any[]) {
        // A class limited to one batch is only about that batch's students.
        if (cls.batch_id && m.batch_id && m.batch_id !== cls.batch_id) continue;

        const a = attByKey.get(key(cls.id, m.user_id));
        const attended = !!a?.attended;
        const presence = attended ? presenceOf(a, window) : null;
        const group = registerGroupOf({
          attended,
          presence,
          joinedAfterClass: joinedAfterClass(m.enrolled_at, cls.scheduled_date),
          rsvp: optByKey.has(key(cls.id, m.user_id)) ? 'not_attending' : 'attending',
          absence: absByKey.get(key(cls.id, m.user_id)) ?? null,
        });

        const cell: RegisterCell = { g: group };
        if (presence?.timesKnown) {
          cell.min = presence.minutesIn;
          if (presence.lateByMin) cell.late = presence.lateByMin;
          if (presence.leftEarlyByMin) cell.early = presence.leftEarlyByMin;
          if (presence.outMin) cell.out = presence.outMin;
        }
        classCells[m.user_id] = cell;

        if (group === 'whole') counts.whole++;
        else if (group === 'partly') counts.partly++;
        else if (group === 'reason') counts.reason++;
        else if (group === 'no_reason') counts.noReason++;
        else counts.joinedLater++;

        // A class nobody has read attendance for measures nothing, and a student
        // who was not yet enrolled is not owed that class either.
        const row = tally.get(m.user_id);
        if (row && measured && group !== 'joined_later') {
          row.counted++;
          if (group === 'whole' || group === 'partly') row.present++;
        }
      }

      cells[cls.id] = classCells;
      return {
        id: cls.id,
        title: cls.title,
        scheduled_date: cls.scheduled_date,
        start_time: cls.start_time,
        end_time: cls.end_time,
        held: measured
          ? {
              start: new Date(window.startMs).toISOString(),
              end: new Date(window.endMs).toISOString(),
              source: window.source,
              minutes: window.minutes,
            }
          : null,
        measured,
        sync_status: cls.attendance_sync_status ?? null,
        counts,
      };
    });

    const students: RegisterStudent[] = (members as any[]).map((m) => {
      const row = tally.get(m.user_id) || { present: 0, counted: 0 };
      return {
        id: m.user_id,
        name: m.user?.name || 'Student',
        avatar_url: m.user?.avatar_url || null,
        study_stage: m.current_standard ?? null,
        enrolled_at: m.enrolled_at ?? null,
        present: row.present,
        counted: row.counted,
        rate: row.counted ? Math.round((row.present / row.counted) * 100) : null,
      };
    });

    return NextResponse.json(
      {
        classroom_id: classroomId,
        range: { from, to },
        classes: outClasses,
        students,
        cells,
        // Read the real field name off loadClassroomRoster's `counts` in
        // packages/database/src/queries/nexus/roster.ts before trusting this.
        paused_hidden: rosterCounts?.dormant ?? 0,
      } satisfies RegisterResponse,
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the register';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/app/api/attendance/register/route.test.ts`
Expected: PASS, all seven cases.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/app/api/attendance/register
git commit -m "feat(nexus): read-only attendance register endpoint"
```

---

### Task 4: The page shell and the Classes view

**Files:**
- Create: `apps/nexus/src/components/attendance/ClassAttendanceCard.tsx`
- Create: `apps/nexus/src/components/attendance/ClassAttendanceCard.test.tsx`
- Create: `apps/nexus/src/components/attendance/attendance-format.ts`
- Modify (replace contents): `apps/nexus/src/app/(teacher)/teacher/attendance/page.tsx`

**Interfaces:**
- Consumes: `RegisterResponse`, `RegisterClass` from Task 3; `GROUP_LABEL`, `GROUP_TONE` from Task 1; `useAuthSWR` from `@/lib/nexus-swr`; `useNexusAuthContext` from `@/hooks/useNexusAuth`; `PageHeader` from `@/components/PageHeader`; `RADIUS`, `SHADOW` from `@/components/timetable/timetable-theme`.
- Produces:
  - `formatHeldRange(cls: RegisterClass): string`, e.g. `"held 7:00 to 8:10 PM"` or `"booked 7:00 to 8:30 PM"` when nothing was measured
  - `formatClassDate(ymd: string): string`, e.g. `"Tue 15 Sep"`
  - `<ClassAttendanceCard cls={RegisterClass} href={string} />`

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/attendance/ClassAttendanceCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ClassAttendanceCard from './ClassAttendanceCard';
import type { RegisterClass } from '@/app/api/attendance/register/route';

const CLS: RegisterClass = {
  id: 'class-1',
  title: 'Basic 3D Shape Composition',
  scheduled_date: '2026-09-15',
  start_time: '19:00:00',
  end_time: '20:30:00',
  held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
  measured: true,
  sync_status: 'ok',
  counts: { whole: 14, partly: 6, reason: 1, noReason: 16, joinedLater: 3 },
};

describe('ClassAttendanceCard', () => {
  it('names the class, the day and the time it really ran', () => {
    render(<ClassAttendanceCard cls={CLS} href="/teacher/attendance/class-1" />);
    expect(screen.getByText('Basic 3D Shape Composition')).toBeTruthy();
    expect(screen.getByText(/Tue 15 Sep/)).toBeTruthy();
    expect(screen.getByText(/held 7:00 to 8:10 PM/)).toBeTruthy();
  });

  it('writes every count out, so colour is never the only signal', () => {
    render(<ClassAttendanceCard cls={CLS} href="/teacher/attendance/class-1" />);
    expect(screen.getByText(/14 whole/)).toBeTruthy();
    expect(screen.getByText(/6 partly/)).toBeTruthy();
    expect(screen.getByText(/1 reason/)).toBeTruthy();
    expect(screen.getByText(/16 no reason/)).toBeTruthy();
  });

  it('links to the class', () => {
    render(<ClassAttendanceCard cls={CLS} href="/teacher/attendance/class-1?view=classes" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/teacher/attendance/class-1?view=classes');
  });

  it('says so when Teams attendance has not been read', () => {
    render(
      <ClassAttendanceCard
        cls={{ ...CLS, measured: false, held: null, counts: { whole: 0, partly: 0, reason: 0, noReason: 0, joinedLater: 0 } }}
        href="/teacher/attendance/class-1"
      />,
    );
    expect(screen.getByText(/Attendance not read from Teams yet/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/attendance/ClassAttendanceCard.test.tsx`
Expected: FAIL, "Failed to resolve import ./ClassAttendanceCard".

- [ ] **Step 3: Write the formatter**

Create `apps/nexus/src/components/attendance/attendance-format.ts`:

```ts
import type { RegisterClass } from '@/app/api/attendance/register/route';

const IST = 'Asia/Kolkata';

/** "Tue 15 Sep" in IST, from a plain YYYY-MM-DD. */
export function formatClassDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: IST,
  });
}

/** "7:00 PM" in IST from an ISO instant. */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: IST,
  });
}

/** "7:00 PM" in IST from a stored HH:MM:SS wall clock. */
export function formatWallClock(hhmmss: string, ymd: string): string {
  return formatClock(`${ymd}T${hhmmss}+05:30`);
}

/**
 * When the class ran, in the words the register uses.
 *
 * "held" when the room told us, "booked" when nothing was measured, so nobody
 * reads an estimate as a fact.
 */
export function formatHeldRange(cls: RegisterClass): string {
  if (!cls.held) {
    return `booked ${formatWallClock(cls.start_time, cls.scheduled_date)} to ${formatWallClock(cls.end_time, cls.scheduled_date)}`;
  }
  return `held ${formatClock(cls.held.start)} to ${formatClock(cls.held.end)}`;
}
```

- [ ] **Step 4: Write the card**

Create `apps/nexus/src/components/attendance/ClassAttendanceCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Box, Typography, useTheme } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';
import type { RegisterClass } from '@/app/api/attendance/register/route';
import { formatClassDate, formatHeldRange } from './attendance-format';

/**
 * One past class, as a row a teacher reads in a second.
 *
 * The bar is four proportional boxes, not a chart: it renders at 375px, costs no
 * JavaScript, and the counts are written out beside it, so the colours are a
 * second reading of the numbers rather than the only one.
 */
export default function ClassAttendanceCard({ cls, href }: { cls: RegisterClass; href: string }) {
  const theme = useTheme();
  const { whole, partly, reason, noReason } = cls.counts;
  const total = whole + partly + reason + noReason;

  const parts: Array<{ key: string; value: number; color: string; label: string }> = [
    { key: 'whole', value: whole, color: theme.palette.success.main, label: `${whole} whole` },
    { key: 'partly', value: partly, color: theme.palette.warning.main, label: `${partly} partly` },
    { key: 'reason', value: reason, color: theme.palette.info.main, label: `${reason} reason` },
    { key: 'no_reason', value: noReason, color: theme.palette.error.main, label: `${noReason} no reason` },
  ];
  const summary = parts.map((p) => p.label).join('   ');

  return (
    <Box
      component={Link}
      href={href}
      sx={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        p: 2,
        borderRadius: RADIUS.card,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: SHADOW.card,
        bgcolor: 'background.paper',
        minHeight: 88,
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: 'text.secondary' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {formatClassDate(cls.scheduled_date)}, {formatHeldRange(cls)}
          </Typography>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{cls.title}</Typography>
        </Box>
        <ChevronRightIcon sx={{ color: 'text.disabled' }} />
      </Box>

      {cls.measured && total > 0 ? (
        <>
          <Box
            role="img"
            aria-label={summary}
            sx={{ display: 'flex', gap: '2px', mt: 1.25, height: 8, borderRadius: 99, overflow: 'hidden' }}
          >
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <Box key={p.key} sx={{ flex: p.value, bgcolor: p.color }} />
              ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {summary}
          </Typography>
        </>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
          Attendance not read from Teams yet
        </Typography>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Run the card test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/attendance/ClassAttendanceCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Replace the page with the shell and the Classes view**

Replace the whole contents of `apps/nexus/src/app/(teacher)/teacher/attendance/page.tsx`:

```tsx
'use client';

/**
 * The attendance register: a screen staff open only to look.
 *
 * It replaces a page that could not work (it called /api/attendance with
 * parameters that route never accepted, so expanding a class and saving both
 * 400'd) and, with it, the idea that this is where attendance gets marked.
 * Marking and chasing live where they already worked; this is the register.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Skeleton, Tab, Tabs, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import ClassAttendanceCard from '@/components/attendance/ClassAttendanceCard';
import RegisterGrid from '@/components/attendance/RegisterGrid';
import type { RegisterResponse } from '@/app/api/attendance/register/route';

type ViewKey = 'classes' | 'register';
const RANGES = [14, 30, 90] as const;
type RangeKey = (typeof RANGES)[number];

/** Today in IST as YYYY-MM-DD, and the same date a number of days earlier. */
function istRange(days: number): { from: string; to: string } {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  const to = ist.toISOString().slice(0, 10);
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - days);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

export default function AttendanceRegisterPage() {
  const searchParams = useSearchParams();
  const { activeClassroom } = useNexusAuthContext();

  const initialView = searchParams.get('view') === 'register' ? 'register' : 'classes';
  const initialRange = (RANGES as readonly number[]).includes(Number(searchParams.get('range')))
    ? (Number(searchParams.get('range')) as RangeKey)
    : 30;
  const [view, setViewState] = useState<ViewKey>(initialView);
  const [range, setRangeState] = useState<RangeKey>(initialRange);

  /**
   * The URL is kept in step with replaceState rather than router.replace: this
   * page is entirely client rendered, and router.replace would fetch an RSC
   * payload on every tab press. Same reasoning as the catch-up page.
   */
  const syncUrl = (nextView: ViewKey, nextRange: RangeKey) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', `?view=${nextView}&range=${nextRange}`);
  };
  const setView = (next: ViewKey) => {
    setViewState(next);
    syncUrl(next, range);
  };
  const setRange = (next: RangeKey) => {
    setRangeState(next);
    syncUrl(view, next);
  };

  const { from, to } = useMemo(() => istRange(range), [range]);
  const { data, error, isLoading } = useAuthSWR<RegisterResponse>(
    activeClassroom
      ? `/api/attendance/register?classroom_id=${activeClassroom.id}&from=${from}&to=${to}`
      : null,
  );

  const classHref = (classId: string) => `/teacher/attendance/${classId}?view=${view}&range=${range}`;

  return (
    <Box>
      <PageHeader title="Attendance" subtitle={activeClassroom?.name || 'Classes that have happened'} />

      <Tabs
        value={range}
        onChange={(_, v) => setRange(v as RangeKey)}
        sx={{ minHeight: 44, mb: 1 }}
        aria-label="How far back to look"
      >
        {RANGES.map((r) => (
          <Tab key={r} value={r} label={r === 14 ? '2 weeks' : `${r} days`} sx={{ minHeight: 44, textTransform: 'none' }} />
        ))}
      </Tabs>

      <Tabs
        value={view}
        onChange={(_, v) => setView(v as ViewKey)}
        sx={{ minHeight: 48, mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
        aria-label="Attendance views"
      >
        <Tab value="classes" label="Classes" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }} />
        <Tab value="register" label="Register" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }} />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error.message || 'Could not load the register.'}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={104} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {data && view === 'classes' && (
        data.classes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No classes have finished in this range.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {data.classes.map((cls) => (
              <ClassAttendanceCard key={cls.id} cls={cls} href={classHref(cls.id)} />
            ))}
          </Box>
        )
      )}

      {data && view === 'register' && (
        <RegisterGrid data={data} classHref={classHref} />
      )}
    </Box>
  );
}
```

- [ ] **Step 7: Check it compiles once Task 5 exists**

`RegisterGrid` arrives in Task 5. Until then `pnpm type-check` reports a missing module; that is expected. Run the card test again and move on.

Run: `pnpm test:run apps/nexus/src/components/attendance/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/nexus/src/components/attendance apps/nexus/src/app/\(teacher\)/teacher/attendance/page.tsx
git commit -m "feat(nexus): attendance register page shell and classes view"
```

---

### Task 5: The register grid

**Files:**
- Create: `apps/nexus/src/components/attendance/RegisterGrid.tsx`
- Create: `apps/nexus/src/components/attendance/RegisterGrid.test.tsx`

**Interfaces:**
- Consumes: `RegisterResponse` (Task 3), `GROUP_LETTER`, `GROUP_LABEL`, `GROUP_TONE` (Task 1), `formatClassDate` (Task 4), `useStudentListView` and `StudentListToolbar`, `PausedFootnote` from `@/components/students/list/`, `StudentStageAvatar`, `stageKeyOf` from `@/lib/student-stage`.
- Produces: `<RegisterGrid data={RegisterResponse} classHref={(classId: string) => string} />`.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/attendance/RegisterGrid.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegisterGrid from './RegisterGrid';
import type { RegisterResponse } from '@/app/api/attendance/register/route';

const DATA: RegisterResponse = {
  classroom_id: 'c1',
  range: { from: '2026-09-01', to: '2026-09-16' },
  classes: [
    {
      id: 'class-1',
      title: 'Basic 3D Shape Composition',
      scheduled_date: '2026-09-15',
      start_time: '19:00:00',
      end_time: '20:30:00',
      held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
      measured: true,
      sync_status: 'ok',
      counts: { whole: 1, partly: 1, reason: 0, noReason: 1, joinedLater: 0 },
    },
  ],
  students: [
    { id: 's1', name: 'Student A', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 1, counted: 1, rate: 100 },
    { id: 's2', name: 'Student B', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 1, counted: 1, rate: 100 },
    { id: 's3', name: 'Student C', avatar_url: null, study_stage: null, enrolled_at: '2026-06-01T00:00:00Z', present: 0, counted: 1, rate: 0 },
  ],
  cells: {
    'class-1': {
      s1: { g: 'whole', min: 70 },
      s2: { g: 'partly', min: 45, early: 25 },
      s3: { g: 'no_reason' },
    },
  },
  paused_hidden: 2,
};

describe('RegisterGrid', () => {
  it('marks each student with a letter, not colour alone', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    // Inside the table only: the legend below it prints the same letters.
    const grid = within(screen.getByRole('table'));
    expect(grid.getByText('F')).toBeTruthy();
    expect(grid.getByText('P')).toBeTruthy();
    expect(grid.getByText('X')).toBeTruthy();
  });

  it('spells out each mark for a screen reader', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    const cell = screen.getByLabelText(/Student B, Tue 15 Sep: partly there, 45 min, left 25 min early/i);
    expect(cell.getAttribute('href')).toBe('/teacher/attendance/class-1?student=s2');
  });

  it('shows each attendance percentage', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    expect(screen.getAllByText('100%').length).toBe(2);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('explains how many paused students are hidden', () => {
    render(<RegisterGrid data={DATA} classHref={(id) => `/teacher/attendance/${id}`} />);
    expect(screen.getByText(/2 paused/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/attendance/RegisterGrid.test.tsx`
Expected: FAIL, "Failed to resolve import ./RegisterGrid".

- [ ] **Step 3: Write the grid**

Create `apps/nexus/src/components/attendance/RegisterGrid.tsx`:

```tsx
'use client';

/**
 * The paper register: students down the side, class dates across.
 *
 * Newest class on the left, against the convention of a paper book, because a
 * phone shows the leftmost columns first and the class a teacher asks about is
 * almost always the last one. The grid is the one place in this app allowed to
 * scroll sideways, and it does so inside its own container with the name column
 * pinned, so the page itself never does.
 */
import Link from 'next/link';
import { Box, Typography, useTheme } from '@neram/ui';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { stageKeyOf } from '@/lib/student-stage';
import type { ListAccessors } from '@/lib/student-list-view';
import { GROUP_LABEL, GROUP_LETTER, type RegisterGroup } from '@/lib/attendance-register';
import type { RegisterCell, RegisterResponse, RegisterStudent } from '@/app/api/attendance/register/route';
import { formatClassDate } from './attendance-format';

const ACCESSORS: ListAccessors<RegisterStudent> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
};

const NAME_COL = { xs: 132, sm: 180 };
const CELL_W = 48;

const TONE_COLOR: Record<RegisterGroup, string> = {
  whole: 'success.main',
  partly: 'warning.main',
  reason: 'info.main',
  no_reason: 'error.main',
  joined_later: 'text.disabled',
};

/** "partly there, 45 min, left 25 min early" */
function describeCell(cell: RegisterCell | undefined): string {
  if (!cell) return 'nothing recorded';
  const bits = [GROUP_LABEL[cell.g].toLowerCase()];
  if (cell.min != null) bits.push(`${cell.min} min`);
  if (cell.late) bits.push(`joined ${cell.late} min late`);
  if (cell.early) bits.push(`left ${cell.early} min early`);
  if (cell.out) bits.push(`stepped out ${cell.out} min`);
  return bits.join(', ');
}

export default function RegisterGrid({
  data,
  classHref,
}: {
  data: RegisterResponse;
  classHref: (classId: string) => string;
}) {
  const theme = useTheme();

  const view = useStudentListView<RegisterStudent, 'suggested'>({
    rows: data.students,
    accessors: ACCESSORS,
    extraSorts: [
      {
        key: 'suggested',
        label: 'Lowest attendance first',
        compare: (a: RegisterStudent, b: RegisterStudent) => (a.rate ?? 101) - (b.rate ?? 101),
      },
    ],
    defaultSort: 'suggested',
    urlKeys: false,
    storageKey: 'nexus:attendance-register:sort',
  });

  return (
    <Box>
      <StudentListToolbar view={view} searchLabel="Find a student" />

      <Box
        sx={{
          overflowX: 'auto',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'table', borderCollapse: 'collapse', minWidth: '100%' }} role="table">
          <Box sx={{ display: 'table-row' }} role="row">
            <Box
              role="columnheader"
              sx={{
                display: 'table-cell',
                position: 'sticky',
                left: 0,
                zIndex: 2,
                bgcolor: 'background.paper',
                borderBottom: `1px solid ${theme.palette.divider}`,
                p: 1,
                width: NAME_COL,
                minWidth: NAME_COL,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Student
              </Typography>
            </Box>
            {data.classes.map((cls) => (
              <Box
                key={cls.id}
                role="columnheader"
                sx={{
                  display: 'table-cell',
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  p: 0.5,
                  width: CELL_W,
                  minWidth: CELL_W,
                  textAlign: 'center',
                }}
              >
                <Box
                  component={Link}
                  href={classHref(cls.id)}
                  sx={{
                    display: 'block',
                    py: 0.75,
                    color: 'text.secondary',
                    textDecoration: 'none',
                    borderRadius: 1,
                    minHeight: 44,
                    '&:hover': { color: 'text.primary' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                  }}
                >
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, lineHeight: 1.2 }}>
                    {formatClassDate(cls.scheduled_date).split(' ')[1]}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
                    {formatClassDate(cls.scheduled_date).split(' ')[0]}
                  </Typography>
                </Box>
              </Box>
            ))}
            <Box
              role="columnheader"
              sx={{
                display: 'table-cell',
                borderBottom: `1px solid ${theme.palette.divider}`,
                p: 1,
                textAlign: 'right',
                minWidth: 56,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                %
              </Typography>
            </Box>
          </Box>

          {view.shown.map((student) => (
            <Box key={student.id} sx={{ display: 'table-row' }} role="row">
              <Box
                role="rowheader"
                sx={{
                  display: 'table-cell',
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  bgcolor: 'background.paper',
                  borderTop: `1px solid ${theme.palette.divider}`,
                  p: 1,
                  width: NAME_COL,
                  minWidth: NAME_COL,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <StudentStageAvatar
                    userId={student.id}
                    name={student.name}
                    src={student.avatar_url}
                    stage={stageKeyOf(student.study_stage)}
                    size={26}
                    tapToView={false}
                  />
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {student.name}
                  </Typography>
                </Box>
              </Box>

              {data.classes.map((cls) => {
                const cell = data.cells[cls.id]?.[student.id];
                return (
                  <Box
                    key={cls.id}
                    role="cell"
                    sx={{
                      display: 'table-cell',
                      borderTop: `1px solid ${theme.palette.divider}`,
                      textAlign: 'center',
                      width: CELL_W,
                      minWidth: CELL_W,
                    }}
                  >
                    <Box
                      component={Link}
                      href={`${classHref(cls.id)}${classHref(cls.id).includes('?') ? '&' : '?'}student=${student.id}`}
                      aria-label={`${student.name}, ${formatClassDate(cls.scheduled_date)}: ${describeCell(cell)}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 44,
                        textDecoration: 'none',
                        fontWeight: 800,
                        color: cell ? TONE_COLOR[cell.g] : 'text.disabled',
                        '&:hover': { bgcolor: 'action.hover' },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                      }}
                    >
                      {cell ? GROUP_LETTER[cell.g] : '?'}
                    </Box>
                  </Box>
                );
              })}

              <Box
                role="cell"
                sx={{
                  display: 'table-cell',
                  borderTop: `1px solid ${theme.palette.divider}`,
                  p: 1,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {student.rate == null ? '–' : `${student.rate}%`}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
        {(['whole', 'partly', 'reason', 'no_reason', 'joined_later'] as RegisterGroup[]).map((g) => (
          <Typography key={g} variant="caption" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 800, color: TONE_COLOR[g], mr: 0.5 }}>
              {GROUP_LETTER[g]}
            </Box>
            {GROUP_LABEL[g]}
          </Typography>
        ))}
      </Box>

      <PausedFootnote count={data.paused_hidden} />
    </Box>
  );
}
```

- [ ] **Step 4: Run the grid test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/attendance/RegisterGrid.test.tsx`
Expected: PASS. If `PausedFootnote` words its line differently, match the test to the component's real wording rather than changing the shared component.

- [ ] **Step 5: Type check the page and the grid together**

Run: `pnpm type-check --force --filter=@neram/nexus`
Expected: no errors. Fix the `extraSorts` shape here if `suggestedOrder` in `@/lib/student-list-view` expects a different literal; read that file and follow it.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/components/attendance/RegisterGrid.tsx apps/nexus/src/components/attendance/RegisterGrid.test.tsx
git commit -m "feat(nexus): register grid of students by class dates"
```

---

### Task 6: The presence strip

**Files:**
- Create: `apps/nexus/src/components/attendance/PresenceStrip.tsx`
- Create: `apps/nexus/src/components/attendance/PresenceStrip.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks except types.
- Produces: `<PresenceStrip held={{ start: string; end: string }} segments={Array<{ start: string; end: string }>} tone="success" | "warning" label={string} />`.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/attendance/PresenceStrip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PresenceStrip from './PresenceStrip';

const HELD = { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z' };

describe('PresenceStrip', () => {
  it('draws one block per stretch in the room', () => {
    const { container } = render(
      <PresenceStrip
        held={HELD}
        segments={[
          { start: '2026-09-15T13:34:00.000Z', end: '2026-09-15T13:37:00.000Z' },
          { start: '2026-09-15T13:56:00.000Z', end: '2026-09-15T14:40:00.000Z' },
        ]}
        tone="warning"
        label="45 of 70 min. Stepped out 19 min."
      />,
    );
    expect(container.querySelectorAll('[data-segment]').length).toBe(2);
  });

  it('places a block where it happened', () => {
    const { container } = render(
      <PresenceStrip
        held={HELD}
        segments={[{ start: '2026-09-15T14:05:00.000Z', end: '2026-09-15T14:40:00.000Z' }]}
        tone="warning"
        label="35 of 70 min"
      />,
    );
    const seg = container.querySelector('[data-segment]') as HTMLElement;
    // 35 minutes into a 70 minute class, running to the end.
    expect(seg.style.left).toBe('50%');
    expect(seg.style.width).toBe('50%');
  });

  it('carries the spoken description', () => {
    render(<PresenceStrip held={HELD} segments={[]} tone="warning" label="No time recorded" />);
    expect(screen.getByLabelText('No time recorded')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/attendance/PresenceStrip.test.tsx`
Expected: FAIL, "Failed to resolve import ./PresenceStrip".

- [ ] **Step 3: Write the strip**

Create `apps/nexus/src/components/attendance/PresenceStrip.tsx`:

```tsx
'use client';

/**
 * One student's time in one class, drawn to scale.
 *
 * The track is the class itself, start to real end. A filled block is a stretch
 * they were in the room, a gap is a stretch they were not, so joining late,
 * leaving early and stepping out are all the same picture read in three places.
 * Plain boxes, no chart library: this renders in a list of forty rows at 375px.
 */
import { Box, useTheme } from '@neram/ui';

export default function PresenceStrip({
  held,
  segments,
  tone,
  label,
}: {
  held: { start: string; end: string };
  segments: Array<{ start: string; end: string }>;
  tone: 'success' | 'warning';
  label: string;
}) {
  const theme = useTheme();
  const startMs = Date.parse(held.start);
  const endMs = Date.parse(held.end);
  const span = Math.max(1, endMs - startMs);
  const color = tone === 'success' ? theme.palette.success.main : theme.palette.warning.main;

  const pct = (ms: number) => `${Math.max(0, Math.min(100, ((ms - startMs) / span) * 100))}%`;

  return (
    <Box
      role="img"
      aria-label={label}
      sx={{
        position: 'relative',
        height: 10,
        borderRadius: 99,
        bgcolor: theme.palette.action.hover,
        border: `1px solid ${theme.palette.divider}`,
        overflow: 'hidden',
      }}
    >
      {segments.map((s) => {
        const left = pct(Date.parse(s.start));
        const right = pct(Date.parse(s.end));
        return (
          <Box
            key={`${s.start}-${s.end}`}
            data-segment
            style={{
              left,
              width: `${parseFloat(right) - parseFloat(left)}%`,
            }}
            sx={{ position: 'absolute', top: 0, bottom: 0, bgcolor: color }}
          />
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/attendance/PresenceStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/nexus/src/components/attendance/PresenceStrip.tsx apps/nexus/src/components/attendance/PresenceStrip.test.tsx
git commit -m "feat(nexus): presence strip drawn to the class's own clock"
```

---

### Task 7: The class screen

**Files:**
- Modify (replace contents): `apps/nexus/src/app/(teacher)/teacher/attendance/[classId]/page.tsx`
- Create: `apps/nexus/src/components/attendance/ClassRegisterList.tsx`
- Create: `apps/nexus/src/components/attendance/ClassRegisterList.test.tsx`

**Interfaces:**
- Consumes: `Insights`, `StudentInsight` from `@/components/timetable/attendance/types` (extended in Task 2); `PresenceStrip` (Task 6); `StudentStatFilters`, `StatFilterTile` from `@/components/tests/StudentStatFilters`; `GROUP_LABEL`, `GROUP_ORDER`, `describePresence` (Task 1); `RSVP_REASONS` / `reasonShortLabel` from `@/lib/rsvp-reasons`; `ClassAttendanceDialog` from `@/components/timetable/attendance/ClassAttendanceDialog`.
- Produces: `<ClassRegisterList insights={Insights} highlightStudentId={string | null} />`.

- [ ] **Step 1: Write the failing test**

Create `apps/nexus/src/components/attendance/ClassRegisterList.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ClassRegisterList from './ClassRegisterList';
import type { Insights } from '@/components/timetable/attendance/types';

function student(over: Record<string, unknown>) {
  return {
    id: 'x',
    name: 'Student',
    avatar_url: null,
    phone: null,
    study_stage: null,
    dormant: false,
    enrolled_at: '2026-06-01T00:00:00Z',
    joinedAfterClass: false,
    rsvp: 'attending',
    reason: null,
    attended: false,
    joined_at: null,
    left_at: null,
    duration_minutes: null,
    joinedLate: false,
    leftEarly: false,
    droppedMidClass: false,
    barelyAttended: false,
    minutesIn: 0,
    lateByMin: 0,
    leftEarlyByMin: 0,
    outMin: 0,
    segments: [],
    absence: null,
    catchup: null,
    bucket: 'missed_no_reason',
    group: 'no_reason',
    ...over,
  };
}

const INSIGHTS = {
  class: {
    id: 'class-1',
    title: 'Basic 3D Shape Composition',
    scheduled_date: '2026-09-15',
    start_time: '19:00:00',
    end_time: '20:30:00',
  },
  summary: {
    held: { start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z', source: 'observed', minutes: 70 },
  },
  students: [
    student({ id: 'a', name: 'Student A', attended: true, minutesIn: 70, group: 'whole', segments: [{ start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:40:00.000Z' }] }),
    student({ id: 'b', name: 'Student B', attended: true, minutesIn: 45, leftEarlyByMin: 25, group: 'partly', segments: [{ start: '2026-09-15T13:30:00.000Z', end: '2026-09-15T14:15:00.000Z' }] }),
    student({ id: 'c', name: 'Student C', group: 'no_reason' }),
    student({ id: 'd', name: 'Student D', group: 'reason', absence: { reason_code: 'unwell', reason_note: 'had fever', reason_source: 'student' } }),
    student({ id: 'e', name: 'Student E', group: 'joined_later' }),
  ],
} as unknown as Insights;

describe('ClassRegisterList', () => {
  it('counts each group on its tile', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByTestId('stat-tile-whole').textContent).toContain('1');
    expect(screen.getByTestId('stat-tile-partly').textContent).toContain('1');
    expect(screen.getByTestId('stat-tile-no_reason').textContent).toContain('1');
  });

  it('shows how long a partly present student was there and why that is the group', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByText('45 of 70 min')).toBeTruthy();
    expect(screen.getByText(/Left 25 min early/)).toBeTruthy();
  });

  it('shows a missed student their own words', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByText(/had fever/)).toBeTruthy();
  });

  it('filters to one group when its tile is pressed', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    fireEvent.click(screen.getByTestId('stat-tile-no_reason'));
    expect(screen.queryByText('Student A')).toBe(null);
    expect(screen.getByText('Student C')).toBeTruthy();
  });

  it('keeps students who joined later out of the groups and names them apart', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    expect(screen.getByText(/1 joined the course after this class/)).toBeTruthy();
  });

  it('narrows every group with the shared search, across sections', () => {
    render(<ClassRegisterList insights={INSIGHTS} highlightStudentId={null} />);
    fireEvent.change(screen.getByLabelText(/Find a student/i), { target: { value: 'Student C' } });
    expect(screen.getByText('Student C')).toBeTruthy();
    expect(screen.queryByText('Student A')).toBe(null);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/components/attendance/ClassRegisterList.test.tsx`
Expected: FAIL, "Failed to resolve import ./ClassRegisterList".

- [ ] **Step 3: Write the list**

Create `apps/nexus/src/components/attendance/ClassRegisterList.tsx`:

```tsx
'use client';

/**
 * Everyone in one class, in four groups, with the time each was in the room.
 *
 * The numbers are the filters: a teacher who reads "Missed, no reason 16" wants
 * those sixteen, so the tile that says it is the button that shows them. One
 * level, no tabs inside tabs.
 */
import { useMemo, useState } from 'react';
import { Box, Collapse, Stack, Typography } from '@neram/ui';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import StudentStatFilters, { type StatFilterTile } from '@/components/tests/StudentStatFilters';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { suggestedOrder, type ListAccessors } from '@/lib/student-list-view';
import { stageKeyOf } from '@/lib/student-stage';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { GROUP_LABEL, describePresence, type RegisterGroup } from '@/lib/attendance-register';
import type { Insights, StudentInsight } from '@/components/timetable/attendance/types';
import PresenceStrip from './PresenceStrip';
import { formatClock } from './attendance-format';

type TileKey = RegisterGroup | 'all';
const SECTIONS: RegisterGroup[] = ['whole', 'partly', 'reason', 'no_reason'];

const ACCESSORS: ListAccessors<StudentInsight> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
  dormant: (s) => s.dormant,
};

/** What a missed student told us, and who told us. */
function missedLine(s: StudentInsight): string {
  const absence = s.absence;
  if (absence?.excused_at) return 'Excused by a teacher.';
  const code = absence?.reason_code || (s.rsvp === 'not_attending' ? s.reason : null);
  if (!code && !absence?.reason_note) return 'No reason given.';
  const who = absence?.reason_source === 'parent' ? 'Parent said' : 'Said';
  const when = s.rsvp === 'not_attending' ? 'in advance' : 'afterwards';
  const label = code ? reasonShortLabel(code) : 'Reason given';
  return `${who} ${when}: ${label}.`;
}

/** How far a missed student has got with making it up. */
function catchupLine(s: StudentInsight): string {
  if (s.absence?.caught_up_at) return 'Caught up.';
  if (s.absence?.recording_watched_at) return 'Watched the recording.';
  return 'Recording not watched.';
}

export default function ClassRegisterList({
  insights,
  highlightStudentId,
}: {
  insights: Insights;
  highlightStudentId: string | null;
}) {
  const [active, setActive] = useState<TileKey>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);

  const held = insights.summary.held;

  /**
   * The shared list: ranked search, the stage filter that matches the avatar
   * rings, and the sort menu, exactly as every other full list of students in
   * this app. The sections below group whatever survives it, so a search for one
   * name still shows which group that student is in.
   */
  const view = useStudentListView<StudentInsight, 'suggested'>({
    rows: insights.students,
    accessors: ACCESSORS,
    extraSorts: [suggestedOrder<StudentInsight>('Group order')],
    defaultSort: 'suggested',
    urlKeys: false,
    storageKey: 'nexus:class-register:sort',
  });

  const byGroup = useMemo(() => {
    const map: Record<RegisterGroup, StudentInsight[]> = {
      whole: [], partly: [], reason: [], no_reason: [], joined_later: [],
    };
    for (const s of view.shown) map[s.group].push(s);
    // Shortest time in the room first: the people who were barely there head the
    // list a teacher reads.
    map.partly.sort((a, b) => a.minutesIn - b.minutesIn);
    return map;
  }, [view.shown]);

  /**
   * The tiles count the whole class, never the search results. "Missed, no
   * reason 16" is a fact about the night, and a number that shrank as someone
   * typed a name would stop being one.
   */
  const classTally = useMemo(() => {
    const t: Record<RegisterGroup, number> = { whole: 0, partly: 0, reason: 0, no_reason: 0, joined_later: 0 };
    for (const s of insights.students) t[s.group]++;
    return t;
  }, [insights.students]);

  const tiles: StatFilterTile<TileKey>[] = [
    { key: 'whole', label: 'Whole class', value: classTally.whole, hint: 'Stayed throughout', tone: 'success' },
    { key: 'partly', label: 'Partly there', value: classTally.partly, hint: 'Late, early or stepped out', tone: 'warning' },
    { key: 'reason', label: 'Missed, reason', value: classTally.reason, hint: 'Told us why', tone: 'info' },
    { key: 'no_reason', label: 'Missed, no reason', value: classTally.no_reason, hint: 'Nothing said', tone: 'error' },
  ];

  const sections = SECTIONS.filter((g) => (active === 'all' || active === g) && byGroup[g].length > 0);

  return (
    <Box>
      <StudentStatFilters<TileKey>
        tiles={tiles}
        active={active}
        onChange={setActive}
        allKey="all"
        phoneLayout="grid"
      />

      <StudentListToolbar view={view} searchLabel="Find a student" />

      {classTally.joined_later > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => setShowLater((v) => !v)}
            sx={{
              appearance: 'none',
              border: 'none',
              bgcolor: 'transparent',
              font: 'inherit',
              color: 'text.secondary',
              p: 0,
              minHeight: 44,
              cursor: 'pointer',
              textAlign: 'left',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
            }}
          >
            <Typography variant="caption">
              {classTally.joined_later} joined the course after this class
            </Typography>
          </Box>
          <Collapse in={showLater}>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {byGroup.joined_later.map((s) => (
                <Typography key={s.id} variant="caption" color="text.secondary">
                  {s.name}
                </Typography>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}

      {sections.map((group) => (
        <Box key={group} sx={{ mb: 2.5 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'text.secondary' }}
          >
            {GROUP_LABEL[group]}, {byGroup[group].length}
          </Typography>

          <Stack spacing={1} sx={{ mt: 1 }}>
            {byGroup[group].map((s) => {
              const present = group === 'whole' || group === 'partly';
              // The same sentence the rules module writes everywhere else, so
              // the register and the panel cannot word the same night differently.
              const description = present
                ? describePresence({
                    minutesIn: s.minutesIn,
                    segments: [],
                    lateByMin: s.lateByMin,
                    leftEarlyByMin: s.leftEarlyByMin,
                    outMin: s.outMin,
                    barelyThere: s.barelyAttended,
                    timesKnown: s.segments.length > 0,
                  })
                : `${missedLine(s)} ${catchupLine(s)}`;

              return (
                <Box
                  key={s.id}
                  id={`student-${s.id}`}
                  onClick={() => present && setExpanded(expanded === s.id ? null : s.id)}
                  sx={{
                    p: 1.5,
                    borderRadius: RADIUS.card,
                    border: '1px solid',
                    borderColor: highlightStudentId === s.id ? 'primary.main' : 'divider',
                    bgcolor: 'background.paper',
                    cursor: present ? 'pointer' : 'default',
                    minHeight: 64,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      flexWrap: { xs: 'wrap', md: 'nowrap' },
                    }}
                  >
                    <StudentStageAvatar
                      userId={s.id}
                      name={s.name}
                      src={s.avatar_url}
                      stage={stageKeyOf(s.study_stage)}
                      size={32}
                      tapToView={false}
                    />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', flex: 1, minWidth: 120 }} noWrap>
                      {s.name}
                    </Typography>
                    {present && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {s.minutesIn} of {held.minutes} min
                      </Typography>
                    )}
                  </Box>

                  {present && (
                    <Box sx={{ mt: 1 }}>
                      <PresenceStrip
                        held={held}
                        segments={s.segments}
                        tone={group === 'whole' ? 'success' : 'warning'}
                        label={`${s.name}, ${s.minutesIn} of ${held.minutes} min. ${description || 'Stayed the whole class.'}`}
                      />
                    </Box>
                  )}

                  {description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                      {description}
                    </Typography>
                  )}

                  {present && (
                    <Collapse in={expanded === s.id}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {s.segments.length
                          ? s.segments.map((seg) => `in ${formatClock(seg.start)} to ${formatClock(seg.end)}`).join(', ')
                          : 'Marked present by hand, no times.'}
                      </Typography>
                    </Collapse>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}

      {sections.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          Nobody matches this filter.
        </Typography>
      )}

      <PausedFootnote count={view.pausedHidden} />
    </Box>
  );
}
```

- [ ] **Step 4: Run the list test to verify it passes**

Run: `pnpm test:run apps/nexus/src/components/attendance/ClassRegisterList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Replace the class page**

Replace the whole contents of `apps/nexus/src/app/(teacher)/teacher/attendance/[classId]/page.tsx`:

```tsx
'use client';

/**
 * One class, read only.
 *
 * This replaces the Reconcile page, which had two faults beyond its looks: its
 * GET wrote absence rows, so opening a class changed the data, and its follow up
 * sent messages outside sendNudge. Correcting the register and chasing students
 * both live on, one menu item away, on the surfaces that already do them right.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Stack,
  Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import ClassAttendanceDialog from '@/components/timetable/attendance/ClassAttendanceDialog';
import ClassRegisterList from '@/components/attendance/ClassRegisterList';
import { formatClassDate, formatClock, formatWallClock } from '@/components/attendance/attendance-format';
import type { Insights } from '@/components/timetable/attendance/types';
import type { RegisterResponse } from '@/app/api/attendance/register/route';

export default function ClassRegisterPage() {
  const { classId } = useParams<{ classId: string }>();
  const searchParams = useSearchParams();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const view = searchParams.get('view') === 'register' ? 'register' : 'classes';
  const range = searchParams.get('range') || '30';
  const highlight = searchParams.get('student');
  const backHref = `/teacher/attendance?view=${view}&range=${range}`;

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const { data, error, isLoading } = useAuthSWR<Insights>(
    activeClassroom
      ? `/api/timetable/class-insights?class_id=${classId}&classroom_id=${activeClassroom.id}`
      : null,
  );

  // The same key the register page uses, so arriving from it costs nothing and
  // a cold open (a shared link) fetches it once.
  const { data: register } = useAuthSWR<RegisterResponse>(
    activeClassroom ? `/api/attendance/register?classroom_id=${activeClassroom.id}` : null,
  );

  const neighbours = useMemo(() => {
    const list = register?.classes || [];
    const index = list.findIndex((c) => c.id === classId);
    if (index < 0) return { prev: null as string | null, next: null as string | null, index: -1, total: list.length };
    return {
      // Newest first, so "previous" is the class before this one in time.
      prev: list[index + 1]?.id ?? null,
      next: list[index - 1]?.id ?? null,
      index,
      total: list.length,
    };
  }, [register, classId]);

  const stepHref = (id: string) => `/teacher/attendance/${id}?view=${view}&range=${range}`;

  if (isLoading || !data) {
    return (
      <Box>
        <Skeleton variant="text" width={180} height={32} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mt: 2 }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: 2 }}>
        {error.message || 'Could not load this class.'}
      </Alert>
    );
  }

  const cls = data.class;
  const held = data.summary.held;

  return (
    <Box sx={{ pb: 4 }}>
      <Button
        component={Link}
        href={backHref}
        startIcon={<ArrowBackIcon />}
        sx={{ textTransform: 'none', minHeight: 44, ml: -1 }}
      >
        Attendance
      </Button>

      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mt: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
            {cls.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatClassDate(cls.scheduled_date)},{' '}
            {held.source === 'observed'
              ? `held ${formatClock(held.start)} to ${formatClock(held.end)} (booked to ${formatWallClock(cls.end_time, cls.scheduled_date)})`
              : `booked ${formatWallClock(cls.start_time, cls.scheduled_date)} to ${formatWallClock(cls.end_time, cls.scheduled_date)}`}
          </Typography>
        </Box>
        <IconButton
          aria-label="More about this class"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ width: 44, height: 44 }}
        >
          <MoreVertIcon />
        </IconButton>
      </Stack>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setRegisterOpen(true);
          }}
          sx={{ minHeight: 44 }}
        >
          Correct attendance
        </MenuItem>
        <MenuItem component={Link} href="/teacher/catch-up?tab=classes" sx={{ minHeight: 44 }}>
          Follow up in Catch-up
        </MenuItem>
      </Menu>

      {neighbours.total > 1 && (
        <Stack direction="row" alignItems="center" spacing={1} sx={{ my: 1.5 }}>
          <IconButton
            component={neighbours.prev ? Link : 'button'}
            href={neighbours.prev ? stepHref(neighbours.prev) : undefined}
            disabled={!neighbours.prev}
            aria-label="Previous class"
            sx={{ width: 44, height: 44 }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="caption" color="text.secondary">
            class {neighbours.index + 1} of {neighbours.total}
          </Typography>
          <IconButton
            component={neighbours.next ? Link : 'button'}
            href={neighbours.next ? stepHref(neighbours.next) : undefined}
            disabled={!neighbours.next}
            aria-label="Next class"
            sx={{ width: 44, height: 44 }}
          >
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      )}

      {data.class.attendance_sync_message && (
        <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>
          {data.class.attendance_sync_message}
        </Alert>
      )}

      <ClassRegisterList insights={data} highlightStudentId={highlight} />

      {activeClassroom && (
        <ClassAttendanceDialog
          open={registerOpen}
          onClose={() => setRegisterOpen(false)}
          classId={classId}
          classTitle={cls.title}
          classroomId={activeClassroom.id}
          teamsMeetingId={data.class.teams_meeting_id}
          getToken={getToken}
          initialTab="register"
        />
      )}
    </Box>
  );
}
```

- [ ] **Step 6: Run every attendance test and the type check**

Run: `pnpm test:run apps/nexus/src/components/attendance/ apps/nexus/src/lib/attendance-register.test.ts apps/nexus/src/app/api/attendance/`
Expected: PASS.

Run: `pnpm type-check --force --filter=@neram/nexus`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/nexus/src/components/attendance apps/nexus/src/app/\(teacher\)/teacher/attendance
git commit -m "feat(nexus): read-only class register screen with time in class"
```

---

### Task 8: The parent view reads the same rules

Parents currently read a copy of the booked-end rule, so they see the same wrong "partly attended".

**Files:**
- Modify: `apps/nexus/src/lib/parent-attendance.ts` (the derivations at :279-289)
- Modify: `apps/nexus/src/lib/parent-data.ts:126-132` and `:163-166`
- Test: `apps/nexus/src/lib/parent-attendance.test.ts` (create if absent)

**Interfaces:**
- Consumes: `sessionWindow`, `presenceOf`, `SessionWindow` from Task 1.
- Produces: `buildClassAttendanceViews` gains a fifth optional parameter,
  `sessionWindows?: Map<string, SessionWindow>` keyed by class id. Callers that
  omit it keep today's behaviour (the booked end), so `api/parent/overview` and
  `api/students/[id]/performance` compile untouched. `ClassAttendanceView` keeps
  every field name it has.

**Why a new parameter:** `buildClassAttendanceViews` receives only this one
child's attendance rows (`parent-data.ts:133-142`), and when the class ended can
only be read from the whole room's leave times. `loadChildAttendance` already
queries the roster-wide rows to decide which classes were measured, so the end
times come from a query that is already being made.

- [ ] **Step 1: Write the failing test**

Create or extend `apps/nexus/src/lib/parent-attendance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildClassAttendanceViews } from './parent-attendance';

const ist = (hhmm: string) => `2026-09-15T${hhmm}:00+05:30`;

describe('buildClassAttendanceViews', () => {
  it('does not tell a parent their child left early when the class ended', () => {
    const classes = [
      { id: 'class-1', title: 'Basic 3D', scheduled_date: '2026-09-15', start_time: '19:00:00', end_time: '20:30:00' },
    ];
    const attendance = [
      { scheduled_class_id: 'class-1', student_id: 'child', attended: true, joined_at: ist('19:02'), left_at: ist('20:10'), attendance_intervals: [{ joinDateTime: ist('19:02'), leaveDateTime: ist('20:10') }] },
      { scheduled_class_id: 'class-1', student_id: 'other-1', attended: true, left_at: ist('20:10'), attendance_intervals: [{ joinDateTime: ist('19:00'), leaveDateTime: ist('20:10') }] },
      { scheduled_class_id: 'class-1', student_id: 'other-2', attended: true, left_at: ist('20:10'), attendance_intervals: [{ joinDateTime: ist('19:00'), leaveDateTime: ist('20:10') }] },
    ];
    const windows = new Map([['class-1', sessionWindow(classes[0], attendance)]]);
    const [view] = buildClassAttendanceViews(
      classes as never,
      // The child's own row only, which is all the caller ever passes.
      [attendance[0]] as never,
      new Set(['class-1']),
      [],
      windows,
    );
    expect(view.leftEarly).toBe(false);
    expect(view.label).toBe('attended');
  });

  it('still reads a genuine early leaver as one', () => {
    const classes = [
      { id: 'class-1', title: 'Basic 3D', scheduled_date: '2026-09-15', start_time: '19:00:00', end_time: '20:30:00' },
    ];
    const room = [
      { scheduled_class_id: 'class-1', student_id: 'child', attended: true, joined_at: ist('19:02'), left_at: ist('19:30'), attendance_intervals: [{ joinDateTime: ist('19:02'), leaveDateTime: ist('19:30') }] },
      { scheduled_class_id: 'class-1', student_id: 'other-1', attended: true, left_at: ist('20:10'), attendance_intervals: [{ joinDateTime: ist('19:00'), leaveDateTime: ist('20:10') }] },
      { scheduled_class_id: 'class-1', student_id: 'other-2', attended: true, left_at: ist('20:10'), attendance_intervals: [{ joinDateTime: ist('19:00'), leaveDateTime: ist('20:10') }] },
    ];
    const windows = new Map([['class-1', sessionWindow(classes[0], room)]]);
    const [view] = buildClassAttendanceViews(classes as never, [room[0]] as never, new Set(['class-1']), [], windows);
    expect(view.leftEarly).toBe(true);
  });

  it('falls back to the booked end when no windows are passed', () => {
    const classes = [
      { id: 'class-1', title: 'Basic 3D', scheduled_date: '2026-09-15', start_time: '19:00:00', end_time: '20:30:00' },
    ];
    const mine = [
      { scheduled_class_id: 'class-1', attended: true, joined_at: ist('19:02'), left_at: ist('20:10'), attendance_intervals: [{ joinDateTime: ist('19:02'), leaveDateTime: ist('20:10') }] },
    ];
    const [view] = buildClassAttendanceViews(classes as never, mine as never, new Set(['class-1']), []);
    expect(view.leftEarly).toBe(true);
  });
});
```

Add the import at the top of the test file:

```ts
import { sessionWindow } from './attendance-register';
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run apps/nexus/src/lib/parent-attendance.test.ts`
Expected: FAIL, `leftEarly` is true, because the current rule measures against 8:30 PM.

- [ ] **Step 3: Take the window in `parent-attendance.ts`**

Add the import:

```ts
import { presenceOf, sessionWindow, type SessionWindow } from './attendance-register';
```

Add the fifth parameter to `buildClassAttendanceViews` (:213-218):

```ts
export function buildClassAttendanceViews(
  classes: ScheduledClassRow[],
  attendanceRows: AttendanceRow[],
  measuredClassIds: Set<string> | string[],
  absenceRows: AbsenceRow[] = [],
  /**
   * When each class really ended, keyed by class id, built by the caller from
   * the whole room's leave times. Without it the booked end is used, which is
   * what every caller did before and what flagged a whole cohort as leaving
   * early on a class that simply finished 20 minutes ahead of its booking.
   */
  sessionWindows?: Map<string, SessionWindow>
): ClassAttendanceView[] {
```

Replace the `late` / `leftEarly` / `droppedMidClass` derivations (:279-289) with:

```ts
    const window: SessionWindow =
      sessionWindows?.get(cls.id) ??
      sessionWindow(cls, [{ attended: true, left_at: null }]);
    const presence = presenceOf(
      {
        attended,
        joined_at: att?.joined_at ?? null,
        left_at: att?.left_at ?? null,
        attendance_intervals: (att?.attendance_intervals as never) ?? null,
      },
      window
    );

    const late = attended && presence.lateByMin > 0;
    const leftEarly = attended && presence.leftEarlyByMin > 0;
    const droppedMidClass = attended && presence.outMin > 0;
```

`parseSegments` stays: `ClassAttendanceView.segments` is the parent-facing shape (`joinedAt`, `leftAt`, `durationMinutes`) and other screens read it.

- [ ] **Step 4: Build the windows in `parent-data.ts`**

Widen the roster-wide query (:126-132) so it carries the leave times it needs:

```ts
    (async (): Promise<{ scheduled_class_id: string; attended: boolean | null; left_at: string | null }[]> => {
      const { data } = await supabase
        .from('nexus_attendance')
        // attended and left_at cost nothing here and are what tell us when each
        // class actually ended, which no single student's row can say.
        .select('scheduled_class_id, attended, left_at')
        .in('scheduled_class_id', classIds);
      return (data || []) as { scheduled_class_id: string; attended: boolean | null; left_at: string | null }[];
    })(),
```

Then, after `measuredClassIds` is built (:159-161):

```ts
  const rowsByClass = new Map<string, { attended: boolean | null; left_at: string | null }[]>();
  for (const r of measuredRows) {
    const list = rowsByClass.get(r.scheduled_class_id) || [];
    list.push({ attended: r.attended, left_at: r.left_at });
    rowsByClass.set(r.scheduled_class_id, list);
  }
  const sessionWindows = new Map(
    classes.map((c) => [c.id, sessionWindow(c, rowsByClass.get(c.id) || [])])
  );

  return {
    classes,
    views: buildClassAttendanceViews(classes, mineRows, measuredClassIds, absenceRows, sessionWindows),
  };
```

with `import { sessionWindow } from './attendance-register';` at the top.

- [ ] **Step 5: Run the test and its consumers**

Run: `pnpm test:run apps/nexus/src/lib/`
Expected: PASS, including any existing catch-up and standing tests.

Run: `pnpm type-check --force --filter=@neram/nexus`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/nexus/src/lib/parent-attendance.ts apps/nexus/src/lib/parent-attendance.test.ts apps/nexus/src/lib/parent-data.ts
git commit -m "fix(nexus): parents read attendance against the class's real end"
```

---

### Task 9: Retire the old surfaces, add the E2E spec, verify

**Files:**
- Delete: `apps/nexus/src/app/api/timetable/[classId]/followup/route.ts`
- Create: `tests/e2e/attendance-register-nexus.spec.ts`
- Check: `apps/nexus/src/lib/nav-config.tsx:195` and `:204`, `apps/nexus/src/lib/feature-flags.ts:169` (no change expected)

**Interfaces:**
- Consumes: `APP_URLS`, `injectAuthForPage` from `tests/utils/credentials.ts`; `assertNoHorizontalOverflow`, `assertTouchTargetSize` from `tests/utils/mobile-helpers.ts`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Prove the follow-up route has no callers left**

Run: `grep -rn "followup" apps/nexus/src --include=*.tsx --include=*.ts | grep -v "followup_sent"`
Expected: only the route file itself and `catchup-nudge` references to the `followup_sent_at` column. If any page still calls `/api/timetable/[classId]/followup`, stop and report it rather than deleting.

- [ ] **Step 2: Delete the route**

```bash
git rm apps/nexus/src/app/api/timetable/\[classId\]/followup/route.ts
```

- [ ] **Step 3: Write the E2E spec**

Create `tests/e2e/attendance-register-nexus.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The attendance register, read only. The screen it replaced wrote absence rows
 * on open, so "does not write" is part of what these tests protect.
 */
test.describe('Attendance register', () => {
  test.beforeEach(async ({ page }) => {
    await injectAuthForPage(page, 'teacher');
  });

  test('lists past classes with their counts', async ({ page }) => {
    await page.goto(`${APP_URLS.nexus}/teacher/attendance`);
    await expect(page.getByRole('tab', { name: 'Classes' })).toBeVisible();
    await expect(page.getByRole('link').first()).toBeVisible();
  });

  test('the register grid scrolls inside itself, the page does not', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=30`);
    await expect(page.getByRole('table')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('a cell opens that class with the student highlighted, and back returns to the grid', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?view=register&range=30`);
    const cell = page.getByRole('cell').locator('a').first();
    await cell.click();
    await expect(page).toHaveURL(/\/teacher\/attendance\/[^/?]+\?.*student=/);
    await page.getByRole('link', { name: 'Attendance' }).click();
    await expect(page).toHaveURL(/view=register/);
  });

  test('class screen targets are big enough to tap', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/attendance?range=30`);
    await page.getByRole('link').first().click();
    await assertTouchTargetSize(page, 'button', 44);
    await assertNoHorizontalOverflow(page);
  });
});
```

- [ ] **Step 4: Run the E2E spec**

Run: `pnpm test:e2e tests/e2e/attendance-register-nexus.spec.ts --project=nexus-chrome`
Expected: PASS. Entra now forces MFA for these accounts, so the login step may fail outright. If it does, report that the spec could not run and why. Do not delete or skip the spec, and do not claim it passed.

- [ ] **Step 5: Full verification**

Run each, and paste the real output when reporting:

```bash
pnpm test:run apps/nexus
pnpm type-check --force
pnpm lint
```

Expected: all pass. Do not run a production build while `pnpm dev` is running.

- [ ] **Step 6: Design review**

Start the app (`pnpm dev:nexus`), open `/teacher/attendance` and one class, and review both at 375, 768, 1024 and 1440px against the ui-ux-pro-max checklist: touch targets 44px and 8px apart, visible focus rings, 4.5:1 text contrast, no page-level horizontal scroll, skeletons while loading, SVG icons only, and the same reading in light and dark mode. Fix what it finds before calling the work done.

- [ ] **Step 7: Commit**

```bash
git add -A apps/nexus tests/e2e/attendance-register-nexus.spec.ts
git commit -m "chore(nexus): retire the reconcile page and its write-on-read route"
```

---

## Notes for the executor

- **Do not deploy and do not push.** The user deploys on their own schedule with `pnpm deploy:staging` or `pnpm deploy:prod`.
- **Nothing under `/teacher/attendance` may write.** If a task seems to need a write, stop and ask.
- **The working tree is shared with other sessions.** Never run `git stash`. Stage only the files a task names.
- **If a rule in the spec turns out to be wrong against real data** (for instance the 80% end rule on a class where the teacher left first), stop and report it rather than tuning the constant silently.
