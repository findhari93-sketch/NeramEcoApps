/**
 * Realistic payloads for the teacher Catch-up page (2026-10 redesign).
 *
 * The E2E classroom on staging has no absences at all, so the Students view and
 * the Calendar can only be exercised against these. Shapes:
 *   /api/catchup/overview  apps/nexus/src/components/catchup/types.ts (Payload)
 *   /api/catchup/calendar  apps/nexus/src/lib/catchup-calendar.ts (CalendarClass)
 *
 * The overview carries 35 students across all eight diagnosis states. `stopped`
 * holds 17 on purpose, so a group has more rows than the 15 it renders before
 * offering "Show all". Every reason source is represented (before class, an
 * away window, afterwards) plus unexplained classes, so the reason chips and
 * the student sheet both have something to show.
 */

type Diagnosis =
  | 'stuck'
  | 'stopped'
  | 'not_started'
  | 'over_time'
  | 'work_left'
  | 'on_track'
  | 'waiting_on_us'
  | 'all_clear';

const DIAGNOSIS_ORDER: Diagnosis[] = [
  'stuck',
  'stopped',
  'not_started',
  'over_time',
  'work_left',
  'on_track',
  'waiting_on_us',
  'all_clear',
];

/** How many students sit in each state. */
const MIX: Record<Diagnosis, number> = {
  stuck: 3,
  stopped: 17,
  not_started: 3,
  over_time: 2,
  work_left: 2,
  on_track: 2,
  waiting_on_us: 2,
  all_clear: 4,
};

const BUCKET: Record<Diagnosis, string> = {
  stuck: 'run_over',
  stopped: 'behind',
  not_started: 'not_started',
  over_time: 'run_over',
  work_left: 'in_progress',
  on_track: 'in_progress',
  waiting_on_us: 'waiting_on_us',
  all_clear: 'all_clear',
};

const SENTENCE: Record<Diagnosis, string> = {
  stuck: 'Failed the section 2 check twice on "Colour theory and harmony"',
  stopped: 'Stopped on "Perspective drawing: two point" at 40% watched, last active 5 days ago',
  not_started: 'Owes 3 classes and has not opened any of them',
  over_time: '2 days over on "Memory drawing, street scene", still watching',
  work_left: 'Watched "Isometric views practice". The assignment is not in yet',
  on_track: 'Working on "NATA mock paper review", active yesterday',
  waiting_on_us: 'Waiting on us for the recap of "Building materials quiz"',
  all_clear: 'Nothing left to catch up on',
};

const NAMES = [
  'Hari Heera', 'Nethra Ranjith', 'Pranava Sakthi', 'Rakshana Rajagopal', 'Ridhusha Prawin Rajan',
  'Sowmiya Lakshmi Narayanan', 'Arun Kumar', 'Deepika Venkatesh', 'Karthikeyan Subramaniam', 'Meera Iyer',
  'Kavin Raj', 'Priyadharshini Balasubramanian', 'Sanjay Ram', 'Harini Suresh', 'Vishnu Prasad',
  'Aishwarya Mohan', 'Gokul Krishnan', 'Divya Bharathi', 'Tharun Vel', 'Janani Sekar',
  'Mohammed Irfan', 'Swetha Anand', 'Lokesh Babu', 'Keerthana Devi', 'Rahul Menon',
  'Nivetha Senthil', 'Bala Murugan', 'Anitha Raman', 'Surya Prakash', 'Yamini Rao',
  'Pooja Natarajan', 'Vignesh Kannan', 'Lavanya Ganesh', 'Dinesh Pandian', 'Shruthi Hariharan',
];

const CLASS_TITLES = [
  'Perspective drawing: two point',
  'Basic 3D Shape Composition',
  'Memory drawing, street scene',
  'Aptitude: mental ability set 4',
  'Colour theory and harmony',
  'NATA mock paper review',
  'Building materials quiz',
  'Isometric views practice',
];

const classes = CLASS_TITLES.map((title, i) => ({
  id: `cl${i}`,
  title,
  scheduled_date: new Date(Date.UTC(2026, 8, 20 - i * 3)).toISOString().slice(0, 10),
}));

/**
 * One reason per slot, cycling. Covers every place a student can tell us, and
 * a class nobody explained. The note on "other" is the student's own words.
 */
const REASONS: Array<{ code: string; note: string | null; source: string; said: string } | null> = [
  { code: 'unwell', note: 'Had fever, will watch the recording tonight', source: 'before_class', said: 'Told us before class' },
  { code: 'family', note: null, source: 'away', said: 'Away 10 Sep to 20 Sep' },
  { code: 'clash', note: 'School exam that day', source: 'after_class', said: 'Told us afterwards' },
  { code: 'other', note: 'Network was down in our area for the whole evening', source: 'after_class', said: 'Told us afterwards' },
  null,
];

function item(i: number, j: number, d: Diagnosis) {
  const r = REASONS[(i + j) % REASONS.length];
  const c = classes[(i + j) % classes.length];
  const active = j === 0 && d !== 'not_started' && d !== 'waiting_on_us';
  const overdue = active && (d === 'over_time' || d === 'stuck');
  return {
    id: `it-${i}-${j}`,
    scheduled_class_id: c.id,
    kind: 'no_show',
    status: d === 'waiting_on_us' ? 'pending_teacher' : active ? 'active' : 'waiting',
    step: 'watch',
    chained: false,
    due_on: active ? '2026-09-22' : null,
    overdue,
    active,
    days_left: active ? (overdue ? -2 : 3) : null,
    recommended: j === 0,
    reason_code: r ? r.code : null,
    reason_note: r ? r.note : null,
    reason_submitted_at: r ? '2026-09-19T10:00:00Z' : null,
    reason_source: r ? 'student' : null,
    reason: r,
    activated_on: active ? '2026-09-15' : null,
    progress: active ? '40% watched, 2 sittings, last active 5 days ago' : 'Not opened yet',
    followup_sent_at: null,
    caught_up_at: null,
    excuse_note: null,
    watched: false,
    assignments_outstanding: 1,
    assignments_total: 1,
    has_test: true,
    test_passed: false,
    excused: false,
    class: { title: c.title, scheduled_date: c.scheduled_date },
  };
}

const states: Diagnosis[] = DIAGNOSIS_ORDER.flatMap((d) => Array.from({ length: MIX[d] }, () => d));

const students = states.map((d, i) => {
  const name = NAMES[i];
  const clear = d === 'all_clear';
  const k = clear ? 0 : 2 + (i % 3);
  const items = clear ? [] : Array.from({ length: k }, (_, j) => item(i, j, d));
  return {
    journey_id: `j${i}`,
    student: {
      id: `s${i}`,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@neramclasses.com`,
      phone: `+9190000000${String(i).padStart(2, '0')}`,
      avatar_url: null,
    },
    diagnosis: {
      state: d,
      sentence: SENTENCE[d],
      focusItemId: items[0]?.id ?? null,
      lastActiveAt: '2026-09-19T10:00:00Z',
    },
    bucket: BUCKET[d],
    openCount: d === 'waiting_on_us' || clear ? 0 : k,
    blockedOnUs: d === 'waiting_on_us' ? k : 0,
    totals: { total: k, completed: 1, blocked: 0, pendingTeacher: d === 'waiting_on_us' ? k : 0 },
    missedTotals: { total: k, completed: 1, open: k, overdue: d === 'over_time' ? 1 : 0, waiting: k },
    clock: {
      active: items.some((x) => x.active),
      waiting: k,
      overdue: d === 'over_time',
      daysLeft: d === 'on_track' ? 3 : -2,
      stalled: d === 'not_started',
    },
    pace: { state: clear ? 'done' : 'on_track', deficit: 0, remaining: k },
    standing: {
      clearedTotal: clear ? 3 : i % 4,
      ownOpen: k,
      lateJoinerOpen: 0,
      oldestOpenDays: clear ? null : 10 + i,
      lastClearedAt: clear ? '2026-09-18T10:00:00Z' : null,
      medianDaysToClear: 4,
      chasedAt: i % 2 ? '2026-09-15T10:00:00Z' : null,
      // Only a few, so "Needs a call" stays short and does not dominate a phone.
      unresponsive: !clear && i % 11 === 1,
    },
    // Two of the four all-clear students were congratulated automatically, so
    // the wall has both a "not congratulated yet" and an "already" section.
    celebration:
      clear && i % 2 === 0
        ? { state: 'congratulated', source: 'auto', count: 1, lastAt: '2026-09-18T12:00:00Z' }
        : null,
    items,
  };
});

const byDiagnosis = Object.fromEntries(DIAGNOSIS_ORDER.map((d) => [d, MIX[d]])) as Record<Diagnosis, number>;
const byBucket: Record<string, number> = {
  run_over: 0,
  not_started: 0,
  behind: 0,
  in_progress: 0,
  waiting_on_us: 0,
  all_clear: 0,
};
for (const s of students) byBucket[s.bucket] += 1;

const reasonTally: Record<string, number> = { unwell: 0, family: 0, clash: 0, other: 0, none: 0 };
for (const s of students) for (const it of s.items) reasonTally[it.reason ? it.reason.code : 'none'] += 1;

const allItems = students.flatMap((s) => s.items);

export const CATCHUP_FIXTURE_COUNTS = {
  students: students.length,
  byDiagnosis,
  /** Students (not classes) with at least one open class given this reason. */
  studentsWithReason: (code: string) =>
    students.filter((s) => s.items.some((it) => (it.reason ? it.reason.code : 'none') === code)).length,
};

export const catchupOverviewPayload: any = {
  classroomId: 'x',
  students,
  classes,
  reasonTally,
  noRecording: [],
  pendingRecap: [],
  celebrationsUnavailable: false,
  totals: {
    byBucket,
    byDiagnosis,
    hiddenDormant: 6,
    studentsBehind: students.filter((s) => !['in_progress', 'waiting_on_us', 'all_clear'].includes(s.bucket)).length,
    studentsStalled: byBucket.not_started,
    studentsCatchingUp: students.length - MIX.all_clear,
    outstanding: allItems.length,
    clearedThisMonth: 49,
    explained: allItems.filter((it) => it.reason).length,
    unexplained: allItems.filter((it) => !it.reason).length,
  },
};

/** Names in a given state, in fixture order. */
export function fixtureNames(d: Diagnosis): string[] {
  return students.filter((s) => s.diagnosis.state === d).map((s) => s.student.name);
}

// ── Calendar ─────────────────────────────────────────────────────────────────

const RECAP_STATES = ['published', 'recording_ready', 'draft', 'no_recording', 'published', 'published'] as const;

/**
 * Six taught classes in whatever month a /api/catchup/calendar request covers,
 * one in every health state. The month is read off the request's `from`, which
 * is the start of the month grid (it can fall in the previous month), so the
 * middle of the range is used.
 *
 * `today` is fixed at 2026-09-24 so September has past and upcoming classes.
 */
export function catchupCalendarPayload(url: string) {
  const u = new URL(url);
  const from = u.searchParams.get('from') || '2026-09-01';
  const to = u.searchParams.get('to') || '2026-09-30';
  const mid = new Date((Date.parse(`${from}T00:00:00Z`) + Date.parse(`${to}T00:00:00Z`)) / 2);
  const y = mid.getUTCFullYear();
  const m = mid.getUTCMonth();
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
  const today = '2026-09-24';
  const days = [3, 8, 11, 15, 22, 28];
  const out = days.map((day, i) => {
    const date = `${ym}-${String(day).padStart(2, '0')}`;
    const recap_state = RECAP_STATES[i];
    const upcoming = date > today;
    const outstanding = upcoming ? 0 : i === 4 ? 0 : 3 + i;
    const blocked = recap_state === 'published' ? 0 : outstanding;
    const not_taught = i === 5 && !upcoming;
    const health = upcoming
      ? 'upcoming'
      : not_taught
        ? 'not_taught'
        : recap_state !== 'published' && blocked > 0
          ? 'recap_missing'
          : outstanding > 0
            ? 'catching_up'
            : 'all_caught_up';
    return {
      id: `cal-${ym}-${i}`,
      title: `${CLASS_TITLES[i]} (${ym})`,
      scheduled_date: date,
      start_time: '19:00:00',
      present: upcoming ? 0 : 20 + i,
      missed: upcoming ? 0 : 4 + i,
      late_joiners: 0,
      caughtUp: upcoming ? 0 : 1,
      outstanding,
      blocked,
      recap_state,
      recap_id: recap_state === 'draft' || recap_state === 'published' ? `rc-${ym}-${i}` : null,
      has_transcript: i % 2 === 0,
      teams_meeting_id: null,
      not_taught,
      health,
    };
  });
  return { classroomId: u.searchParams.get('classroomId'), from, to, today, classes: out };
}
