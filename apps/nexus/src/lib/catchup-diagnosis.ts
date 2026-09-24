/**
 * Why a student is behind on catch-up, in one sentence a teacher can act on.
 *
 * The old screen sorted students into Run over / Not started / Behind pace /
 * In progress. Those say WHAT the clock thinks, never WHY, so the teacher could
 * see "Run over" and do nothing with it. This reads how the student is actually
 * working (see catchup-activity.ts) and picks the one state that suggests the
 * next move:
 *
 *   stuck        a checkpoint or the class test keeps beating them   → help
 *   stopped      started, then nothing for STALL_DAYS or more        → nudge / call
 *   not_started  owes classes and has never opened any of them       → nudge
 *   over_time    still working, but past the days they were given    → watch
 *   work_left    watched it, the assignment or test is not in yet    → remind
 *   on_track     working, recently, within time                      → nothing
 *   waiting_on_us nothing they can do: we owe a recording or a recap → publish
 *   all_clear    nothing left                                        → celebrate
 *
 * A student works one class at a time (one clock), so a queue of unopened
 * classes behind the one they are working on is normal, not a problem. The
 * diagnosis therefore looks at the class they are on, and only when there is
 * none does it ask whether they ever started anything.
 *
 * Pure. The overview route feeds it; the tests pin every branch.
 */

import { formatDay } from './away-windows';

export type Diagnosis =
  | 'stuck'
  | 'stopped'
  | 'not_started'
  | 'over_time'
  | 'work_left'
  | 'on_track'
  | 'waiting_on_us'
  | 'all_clear';

/** Most in need of a person first. This is also the tile order. */
export const DIAGNOSIS_ORDER: Diagnosis[] = [
  'stuck',
  'stopped',
  'not_started',
  'over_time',
  'work_left',
  'on_track',
  'waiting_on_us',
  'all_clear',
];

export const DIAGNOSIS_META: Record<
  Diagnosis,
  { label: string; hint: string; tone: 'error' | 'warning' | 'info' | 'success' | 'neutral'; nudge: boolean }
> = {
  stuck: { label: 'Stuck', hint: 'A check or test keeps beating them. They may need help, not a reminder.', tone: 'error', nudge: true },
  stopped: { label: 'Stopped', hint: 'Started, then nothing for a few days.', tone: 'error', nudge: true },
  not_started: { label: 'Not started', hint: 'Owes classes and has not opened any of them.', tone: 'warning', nudge: true },
  over_time: { label: 'Over time', hint: 'Still working, but past the days they were given.', tone: 'warning', nudge: true },
  work_left: { label: 'Work left', hint: 'Watched it. The assignment or test is not in yet.', tone: 'info', nudge: true },
  on_track: { label: 'On track', hint: 'Working on it recently, within their time.', tone: 'success', nudge: false },
  waiting_on_us: { label: 'Waiting on us', hint: 'Nothing they can do until we publish a recap or add a recording.', tone: 'neutral', nudge: false },
  all_clear: { label: 'All clear', hint: 'Nothing left to catch up on.', tone: 'success', nudge: false },
};

/** No activity for this many days means stopped. */
export const STALL_DAYS = 3;

/** Two failed tries in a row on one checkpoint is when a reminder stops helping. */
export const STUCK_FAILS = 2;

export interface DiagItem {
  id: string;
  status: 'done' | 'active' | 'waiting' | 'excused' | 'blocked' | 'pending_teacher';
  active: boolean;
  overdue: boolean;
  days_left: number | null;
  /** The IST date the clock started on this class, when it has. */
  activated_on?: string | null;
  watched: boolean;
  assignments_outstanding: number;
  has_test: boolean;
  test_passed: boolean;
  title: string | null;
  scheduled_date: string;
  activity?: {
    watchedPct: number | null;
    startedAt: string | null;
    lastActiveAt: string | null;
    activeDays: number | null;
    checkpoint: { sectionNo: number; fails: number } | null;
  } | null;
  test?: { attempts: number; lastPct: number | null; bestPct: number | null } | null;
}

export interface StudentDiagnosis {
  state: Diagnosis;
  sentence: string;
  /** The class the sentence is about, when there is one. */
  focusItemId: string | null;
  /** The latest sign of life on any open class. */
  lastActiveAt: string | null;
}

export interface DiagnoseInput {
  items: DiagItem[];
  openCount: number;
  blockedOnUs: number;
  /** IST YYYY-MM-DD. */
  today: string;
  pace?: { state: 'on_track' | 'behind' | 'done'; deficit: number } | null;
}

/** IST calendar day of an ISO timestamp. */
export function istYmd(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function ago(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const quote = (title: string | null) => `"${title || 'a class'}"`;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "40% watched, 3 sittings", whatever of it is known. */
export function progressBits(a: DiagItem['activity']): string[] {
  const out: string[] = [];
  if (a?.watchedPct != null) out.push(`${a.watchedPct}% watched`);
  if (a?.activeDays) out.push(plural(a.activeDays, 'sitting'));
  return out;
}

/** One line per class for the student sheet: progress, quiz tries, test. */
export function describeItemProgress(item: DiagItem, today: string): string {
  if (item.status === 'done') return 'Cleared';
  if (item.status === 'excused') return 'Excused';
  if (item.status === 'blocked') return 'No recording yet';
  if (item.status === 'pending_teacher') return 'Recap not published yet';
  const a = item.activity;
  const bits = progressBits(a);
  if (!a?.startedAt && !a?.lastActiveAt && !item.watched) bits.push('Not opened');
  else if (item.watched && bits.length === 0) bits.push('Watched');
  if (a?.checkpoint && a.checkpoint.fails > 0) {
    bits.push(`section ${a.checkpoint.sectionNo} check failed ${plural(a.checkpoint.fails, 'time')}`);
  }
  if (item.watched && item.assignments_outstanding > 0) bits.push('assignment not in');
  if (item.has_test && !item.test_passed) {
    if (item.test?.attempts) bits.push(`test ${item.test.lastPct ?? 0}% (${plural(item.test.attempts, 'try', 'tries')})`);
    else if (item.watched) bits.push('test not taken');
  }
  if (a?.lastActiveAt) bits.push(`last active ${ago(daysBetween(istYmd(a.lastActiveAt), today))}`);
  const s = bits.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lastActive(item: DiagItem): string | null {
  return item.activity?.lastActiveAt ?? null;
}

function everTouched(item: DiagItem): boolean {
  return !!(item.activity?.startedAt || item.activity?.lastActiveAt || item.watched || item.active);
}

export function diagnoseStudent(input: DiagnoseInput): StudentDiagnosis {
  const { items, openCount, blockedOnUs, today, pace } = input;

  if (openCount === 0 && blockedOnUs === 0) {
    return { state: 'all_clear', sentence: 'Nothing left to catch up on.', focusItemId: null, lastActiveAt: null };
  }
  if (openCount === 0) {
    return {
      state: 'waiting_on_us',
      sentence: `Waiting on us: ${plural(blockedOnUs, 'class', 'classes')} with no published recap or recording.`,
      focusItemId: null,
      lastActiveAt: null,
    };
  }

  const open = items
    .filter((i) => i.status === 'active' || i.status === 'waiting')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  const lastActiveAt =
    open.map(lastActive).filter((x): x is string => !!x).sort().pop() ?? null;
  const more = open.length - 1;
  const moreLine = more > 0 ? ` ${plural(more, 'more class', 'more classes')} after this.` : '';
  const paceLine =
    pace?.state === 'behind' && pace.deficit > 0
      ? ` ${plural(pace.deficit, 'class', 'classes')} behind the weekly pace.`
      : '';

  const focus = open.find((i) => i.active) ?? null;

  if (!focus) {
    const touched = open.filter(everTouched);
    if (touched.length === 0) {
      const oldest = open[0];
      const since = oldest ? daysBetween(oldest.scheduled_date, today) : 0;
      const sentence =
        open.length === 1 && oldest
          ? `Has not opened ${quote(oldest.title)} (${formatDay(oldest.scheduled_date)}, ${ago(since)}).`
          : `Has not opened any of ${plural(open.length, 'missed class', 'missed classes')}. Oldest is from ${formatDay(oldest?.scheduled_date)} (${ago(since)}).`;
      return { state: 'not_started', sentence: sentence + paceLine, focusItemId: oldest?.id ?? null, lastActiveAt };
    }
    // Started something once and has nothing running now.
    const recent = [...touched].sort((a, b) => String(lastActive(a) || '').localeCompare(String(lastActive(b) || ''))).pop()!;
    const bits = progressBits(recent.activity);
    const when = lastActive(recent) ? `, last active ${ago(daysBetween(istYmd(lastActive(recent)!), today))}` : '';
    return {
      state: 'stopped',
      sentence: `Stopped on ${quote(recent.title)}${bits.length ? ` at ${bits.join(', ')}` : ''}${when}. ${plural(open.length, 'class', 'classes')} left.${paceLine}`,
      focusItemId: recent.id,
      lastActiveAt,
    };
  }

  const a = focus.activity;
  const cp = a?.checkpoint;
  if (cp && cp.fails >= STUCK_FAILS) {
    return {
      state: 'stuck',
      sentence: `Failed the section ${cp.sectionNo} check on ${quote(focus.title)} ${plural(cp.fails, 'time')} in a row.${moreLine}`,
      focusItemId: focus.id,
      lastActiveAt,
    };
  }
  if (focus.watched && focus.has_test && !focus.test_passed && (focus.test?.attempts ?? 0) > 0) {
    const t = focus.test!;
    return {
      state: 'stuck',
      sentence: `Scored ${t.lastPct ?? 0}% on the ${quote(focus.title)} test after ${plural(t.attempts, 'try', 'tries')}, not a pass yet.${moreLine}`,
      focusItemId: focus.id,
      lastActiveAt,
    };
  }

  // Last sign of life on this class, or the day its clock started.
  const lastSeen = lastActive(focus) ? istYmd(lastActive(focus)!) : focus.activated_on ?? null;
  const quietFor = lastSeen ? daysBetween(lastSeen, today) : 0;
  if (quietFor >= STALL_DAYS) {
    const bits = progressBits(a);
    const what = bits.length ? ` at ${bits.join(', ')}` : ', nothing watched yet';
    return {
      state: 'stopped',
      sentence: `Started ${quote(focus.title)}${what}, no activity for ${quietFor} days.${moreLine}`,
      focusItemId: focus.id,
      lastActiveAt,
    };
  }

  if (focus.overdue) {
    const bits = progressBits(a);
    const over = focus.days_left != null && focus.days_left < 0 ? `, ${plural(-focus.days_left, 'day')} over` : '';
    return {
      state: 'over_time',
      sentence: `Still working on ${quote(focus.title)}${over}${bits.length ? `. ${bits.join(', ')}` : ''}.${moreLine}`,
      focusItemId: focus.id,
      lastActiveAt,
    };
  }

  if (focus.watched && (focus.assignments_outstanding > 0 || (focus.has_test && !focus.test_passed))) {
    const left = focus.assignments_outstanding > 0 ? 'the assignment is not in yet' : 'the test is not taken yet';
    return {
      state: 'work_left',
      sentence: `Watched ${quote(focus.title)}, ${left}.${moreLine}`,
      focusItemId: focus.id,
      lastActiveAt,
    };
  }

  const bits = progressBits(a);
  const left = focus.days_left != null && focus.days_left >= 0 ? `${plural(focus.days_left, 'day')} left` : '';
  const detail = [...bits, left].filter(Boolean).join(', ');
  return {
    state: 'on_track',
    sentence: `Working on ${quote(focus.title)}${detail ? `: ${detail}` : ''}.${moreLine}${paceLine}`,
    focusItemId: focus.id,
    lastActiveAt,
  };
}

export function emptyDiagnosisTally(): Record<Diagnosis, number> {
  return Object.fromEntries(DIAGNOSIS_ORDER.map((d) => [d, 0])) as Record<Diagnosis, number>;
}
