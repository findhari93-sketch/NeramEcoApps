/**
 * Plan-flow engine: the single source of truth for how a teaching plan's
 * ordered entry queue rolls out onto real class days.
 *
 * Model:
 *  - Entries are an ordered queue (entry.position). Dates are NOT stored per
 *    entry; they are computed here from the plan's start date.
 *  - Class days = every day from start_date onward except Sundays, Saturdays
 *    when the plan has saturday_classes off, and explicit holidays.
 *  - Test entries with a pinned date sit on that exact date; topic entries
 *    flow around them in queue order, each consuming `sessionSpan`
 *    consecutive class days ("day k of N").
 *  - self_learning and skipped entries consume zero class days (that is the
 *    payoff of converting or skipping when a plan drifts).
 *  - Entries that have started on or before `today` are locked: they cannot
 *    be reordered or removed, and nothing may be inserted before them.
 *
 * Used by the Builder, Schedule, Class Day and Health screens, and by the
 * teaching-plans API routes for server-side validation. Pure and framework
 * free; all dates are YYYY-MM-DD strings, "today" is IST.
 */

export type FlowEntryType = 'live_class' | 'self_learning' | 'test';

export interface FlowEntryInput {
  id: string;
  entryType: FlowEntryType;
  position: number;
  /** Pinned date; tests only. NULL for auto-flow topic entries. */
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
  holidays?: string[];
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
  opts: Pick<FlowOptions, 'saturdayClasses' | 'holidays'>,
): boolean {
  const dow = dayOfWeek(date);
  if (dow === 0) return false;
  if (dow === 6 && !opts.saturdayClasses) return false;
  if (opts.holidays?.includes(date)) return false;
  return true;
}

/** Today's date (YYYY-MM-DD) in IST. */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function computeFlow(entries: FlowEntryInput[], opts: FlowOptions): FlowResult {
  const maxDays = opts.maxDays ?? 500;
  const sorted = [...entries].sort((a, b) => a.position - b.position);

  const pinnedByDate = new Map<string, FlowEntryInput>();
  const flowing: FlowEntryInput[] = [];
  for (const e of sorted) {
    if (e.entryType === 'test' && e.pinnedDate) {
      pinnedByDate.set(e.pinnedDate, e);
    } else if (e.status === 'skipped' || e.entryType === 'self_learning') {
      // Consumes no class days.
    } else {
      flowing.push(e);
    }
  }
  const lastPinnedDate = [...pinnedByDate.keys()].sort().pop() ?? null;

  const days: FlowDay[] = [];
  const entryDates = new Map<string, string[]>();
  for (const e of sorted) entryDates.set(e.id, []);

  let date = opts.startDate;
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
    const pinsDone = !lastPinnedDate || date > lastPinnedDate;
    if (queueDone && pinsDone) break;

    if (isClassDay(date, opts) || pinnedByDate.has(date)) {
      const pinned = pinnedByDate.get(date);
      if (pinned) {
        pushDay(pinned, 0, 1);
      } else if (!queueDone) {
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

  // Locking: an entry is locked once its first computed day is not in the future.
  const lockedEntryIds = new Set<string>();
  for (const e of sorted) {
    const dates = entryDates.get(e.id)!;
    if (dates.length && dates[0] <= opts.today) lockedEntryIds.add(e.id);
  }
  let minInsertIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (lockedEntryIds.has(sorted[i].id)) minInsertIndex = i + 1;
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
    pinnedDate: e.entry_type === 'test' ? e.planned_date : null,
    sessionSpan: Math.max(1, e.session_span ?? e.topic?.estimated_sessions ?? 1),
    completedSessions: e.completed_sessions ?? 0,
    status: e.status,
  }));
}
