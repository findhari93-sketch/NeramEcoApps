/**
 * Plan-flow engine: the single source of truth for how a teaching plan's
 * ordered entry queue rolls out onto real class days.
 *
 * Model:
 *  - Entries are an ordered queue (entry.position). Dates are NOT stored per
 *    entry; they are computed here from the plan's start date.
 *  - Class days = every day from start_date onward except Sundays, Saturdays
 *    when the plan has saturday_classes off, and explicit holidays.
 *  - Any entry with a pinned date sits on that date (a multi-session topic
 *    also takes the class days after it); the rest flow around them in queue
 *    order, each consuming `sessionSpan` consecutive class days ("day k of N").
 *  - self_learning and skipped entries consume zero class days (that is the
 *    payoff of converting or skipping when a plan drifts).
 *  - Entries that have started on or before `today` are locked: they cannot
 *    be reordered or removed, and nothing may be inserted before them.
 *
 * Used by the Builder, Schedule, Class Day and Health screens, and by the
 * teaching-plans API routes for server-side validation. Pure and framework
 * free; all dates are YYYY-MM-DD strings, "today" is IST.
 */

export type FlowEntryType = 'live_class' | 'self_learning' | 'test' | 'task';

export interface FlowEntryInput {
  id: string;
  entryType: FlowEntryType;
  position: number;
  /** Pinned calendar date (any entry type). NULL for auto-flow entries. */
  pinnedDate: string | null;
  /** Resolved span: entry.session_span ?? topic.estimated_sessions ?? 1. */
  sessionSpan: number;
  completedSessions: number;
  status: string;
}

export interface FlowOptions {
  startDate: string;
  saturdayClasses: boolean;
  /** YYYY-MM-DD in IST; use istToday(). */
  today: string;
  /** Dropped class days (holidays + cancelled classes): the queue skips them. */
  holidays?: string[];
  /** Makeup days: treated as class days even on a Sunday / off Saturday. */
  extraDays?: string[];
  /**
   * Draft plans are still being assembled, so nothing is locked: past-dated
   * rows stay removable, reorderable and re-datable. Active / completed plans
   * keep their history locked. Defaults to false (locking on).
   */
  draft?: boolean;
  /** Safety cap on generated class days. */
  maxDays?: number;
}

export interface FlowDay {
  date: string;
  /** null = a free class day after the queue ran out (before the last pinned test). */
  entryId: string | null;
  /** 0-based session index within the entry. */
  sessionIndex: number;
  sessionCount: number;
  isTest: boolean;
  isToday: boolean;
  isPast: boolean;
  /** This session has been logged as taught (or the test entry is done). */
  isCovered: boolean;
  /** Past or today: the day can no longer be re-planned. */
  locked: boolean;
}

export interface FlowResult {
  days: FlowDay[];
  /** entryId -> computed dates (empty for self_learning / skipped entries). */
  entryDates: Map<string, string[]>;
  /** Last date that consumes a flowing session (null when nothing flows). */
  computedEndDate: string | null;
  /** Entries that have started on or before today (no reorder / remove). */
  lockedEntryIds: Set<string>;
  /**
   * Queue index (into the position-sorted entry list) of the first entry that
   * may still be edited. Inserts must land at or after this index.
   */
  minInsertIndex: number;
  /** Past live-class sessions that were never logged as covered. */
  behindBy: number;
  /** Per pinned test: entries queued before it whose dates land after it. */
  wontFit: { testEntryId: string; entryIds: string[] }[];
  /** Pinned entries bumped off their exact date by an overlapping pin. */
  pinConflicts: { entryId: string; wantedDate: string; placedDate: string }[];
}

const DAY_MS = 86400000;

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return toUtc(date).getUTCDay();
}

export function isClassDay(
  date: string,
  opts: Pick<FlowOptions, 'saturdayClasses' | 'holidays' | 'extraDays'>,
): boolean {
  // Precedence: a cancelled/holiday date is never a class day; a makeup date
  // always is (even on a Sunday); otherwise the normal weekday rule applies.
  if (opts.holidays?.includes(date)) return false;
  if (opts.extraDays?.includes(date)) return true;
  const dow = dayOfWeek(date);
  if (dow === 0) return false;
  if (dow === 6 && !opts.saturdayClasses) return false;
  return true;
}

/** Today's date (YYYY-MM-DD) in IST. */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function computeFlow(entries: FlowEntryInput[], opts: FlowOptions): FlowResult {
  const maxDays = opts.maxDays ?? 500;
  const sorted = [...entries].sort((a, b) => a.position - b.position);

  // Partition: off-calendar entries (skipped / self-learning) consume no class
  // days; entries with a pinned date sit on it; the rest flow in queue order.
  const pinned: FlowEntryInput[] = [];
  const flowing: FlowEntryInput[] = [];
  for (const e of sorted) {
    if (e.status === 'skipped' || e.entryType === 'self_learning') {
      // Consumes no class days.
    } else if (e.pinnedDate) {
      pinned.push(e);
    } else {
      flowing.push(e);
    }
  }

  // Reserve the day(s) each pinned entry occupies. Session 0 sits on the exact
  // pinned date (honoured even if it is not a normal class day, e.g. a class
  // held on a Sunday); a multi-session pinned topic takes the following
  // unoccupied class days. When two pins want the same day, the earlier pinned
  // date wins (ties broken by position) and the loser is bumped and flagged.
  const occupied = new Map<string, { entry: FlowEntryInput; sessionIndex: number; sessionCount: number }>();
  const pinConflicts: FlowResult['pinConflicts'] = [];
  const nextFreeClassDay = (from: string): string => {
    let d = from;
    let guard = 0;
    while ((occupied.has(d) || !isClassDay(d, opts)) && guard < maxDays) {
      d = addDays(d, 1);
      guard += 1;
    }
    return d;
  };
  const pinnedSorted = [...pinned].sort((a, b) =>
    a.pinnedDate! < b.pinnedDate! ? -1 : a.pinnedDate! > b.pinnedDate! ? 1 : a.position - b.position,
  );
  for (const e of pinnedSorted) {
    const span = e.entryType === 'test' ? 1 : Math.max(1, e.sessionSpan);
    let cursor = e.pinnedDate!;
    if (occupied.has(cursor)) {
      const placed = nextFreeClassDay(cursor);
      pinConflicts.push({ entryId: e.id, wantedDate: cursor, placedDate: placed });
      cursor = placed;
    }
    occupied.set(cursor, { entry: e, sessionIndex: 0, sessionCount: span });
    for (let s = 1; s < span; s++) {
      cursor = nextFreeClassDay(addDays(cursor, 1));
      occupied.set(cursor, { entry: e, sessionIndex: s, sessionCount: span });
    }
  }
  const occupiedDates = [...occupied.keys()].sort();
  const lastOccupiedDate = occupiedDates[occupiedDates.length - 1] ?? null;
  const firstOccupiedDate = occupiedDates[0] ?? null;
  // Start the walk early enough to emit a class pinned before the plan start,
  // but only let the auto-flow queue and free days begin at the start date.
  const walkStart =
    firstOccupiedDate && firstOccupiedDate < opts.startDate ? firstOccupiedDate : opts.startDate;

  const days: FlowDay[] = [];
  const entryDates = new Map<string, string[]>();
  for (const e of sorted) entryDates.set(e.id, []);

  let date = walkStart;
  let flowIdx = 0;
  let sessionInEntry = 0;
  let computedEndDate: string | null = null;

  const pushDay = (entry: FlowEntryInput | null, sessionIndex: number, sessionCount: number) => {
    const isTest = entry?.entryType === 'test';
    const isCovered = entry
      ? isTest
        ? entry.status === 'done'
        : sessionIndex < entry.completedSessions
      : false;
    days.push({
      date,
      entryId: entry?.id ?? null,
      sessionIndex,
      sessionCount,
      isTest,
      isToday: date === opts.today,
      isPast: date < opts.today,
      isCovered,
      locked: date <= opts.today,
    });
    if (entry) entryDates.get(entry.id)!.push(date);
  };

  while (days.length < maxDays) {
    const queueDone = flowIdx >= flowing.length;
    const pinsDone = !lastOccupiedDate || date > lastOccupiedDate;
    if (queueDone && pinsDone) break;

    const pin = occupied.get(date);
    if (pin) {
      pushDay(pin.entry, pin.sessionIndex, pin.sessionCount);
      // A pinned content class (topic / task) extends the plan end; a pinned
      // test is an event that does not.
      if (pin.entry.entryType !== 'test') computedEndDate = date;
    } else if (date >= opts.startDate && isClassDay(date, opts)) {
      if (!queueDone) {
        const entry = flowing[flowIdx];
        const span = Math.max(1, entry.sessionSpan);
        pushDay(entry, sessionInEntry, span);
        computedEndDate = date;
        sessionInEntry += 1;
        if (sessionInEntry >= span) {
          flowIdx += 1;
          sessionInEntry = 0;
        }
      } else {
        pushDay(null, 0, 0);
      }
    }
    date = addDays(date, 1);
  }

  // Locking: an entry is locked once its first computed day is not in the
  // future. Draft plans are exempt: the teacher is still assembling them, so
  // every row stays editable regardless of date.
  const lockedEntryIds = new Set<string>();
  let minInsertIndex = 0;
  if (!opts.draft) {
    for (const e of sorted) {
      const dates = entryDates.get(e.id)!;
      if (dates.length && dates[0] <= opts.today) lockedEntryIds.add(e.id);
    }
    for (let i = 0; i < sorted.length; i++) {
      if (lockedEntryIds.has(sorted[i].id)) minInsertIndex = i + 1;
    }
  }

  // Drift: past live-class sessions never logged as covered.
  let behindBy = 0;
  for (const e of sorted) {
    if (e.entryType !== 'live_class' || e.status === 'skipped') continue;
    const pastSessions = entryDates.get(e.id)!.filter((d) => d < opts.today).length;
    behindBy += Math.max(0, pastSessions - e.completedSessions);
  }

  // Won't-fit: entries queued before a pinned test whose dates land after it.
  const wontFit: FlowResult['wontFit'] = [];
  for (const e of sorted) {
    if (e.entryType !== 'test' || !e.pinnedDate) continue;
    const overflow = sorted
      .filter((o) => o.position < e.position && entryDates.get(o.id)!.length > 0)
      .filter((o) => {
        const dates = entryDates.get(o.id)!;
        return dates[dates.length - 1] > e.pinnedDate!;
      })
      .map((o) => o.id);
    if (overflow.length) wontFit.push({ testEntryId: e.id, entryIds: overflow });
  }

  return {
    days,
    entryDates,
    computedEndDate,
    lockedEntryIds,
    minInsertIndex,
    behindBy,
    wontFit,
    pinConflicts,
  };
}

/**
 * Map DB entry rows (as returned by getTeachingPlanWithEntries) to engine
 * inputs. Accepts a loose shape so both API routes and client pages can use it.
 */
export function toFlowEntries(
  entries: {
    id: string;
    entry_type: string;
    position: number;
    planned_date: string | null;
    session_span: number | null;
    completed_sessions: number;
    status: string;
    topic?: { estimated_sessions?: number | null } | null;
  }[],
): FlowEntryInput[] {
  return entries.map((e) => ({
    id: e.id,
    entryType: e.entry_type as FlowEntryType,
    position: e.position,
    // Any entry can be pinned to a date now, not just tests.
    pinnedDate: e.planned_date ?? null,
    sessionSpan: Math.max(1, e.session_span ?? e.topic?.estimated_sessions ?? 1),
    completedSessions: e.completed_sessions ?? 0,
    status: e.status,
  }));
}
