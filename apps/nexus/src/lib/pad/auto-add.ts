/**
 * Which class meetings get the Answer Pad added for them, and when.
 *
 * meeting-tab.ts knows how to put the pad into one meeting. This decides which
 * meetings, and runs it at two moments: when Nexus creates a class meeting, and
 * from the pad-meeting-tabs sweep near class time, because a new meeting's chat
 * often refuses Graph until somebody joins.
 *
 * Three switches must all be on, checked cheapest first:
 *   - PAD_AUTO_ADD_CLASSROOMS lists the classroom, or says `all`. Empty means
 *     off, so a pilot puts the button in its own classes and nobody else's.
 *   - A Teams app catalog id and a tab origin are configured.
 *   - The staff Answer Pad flag is on, the same switch the console obeys.
 */

import { padFeatureEnabled } from './caller';
import { istDate } from './meeting-binding';
import {
  ensureAnswerPadInMeeting,
  meetingChatIdFromJoinUrl,
  type MeetingTabDeps,
  type MeetingTabOutcome,
  type MeetingTabResult,
} from './meeting-tab';

export interface AutoAddConfig {
  classrooms: 'all' | ReadonlySet<string>;
  catalogAppId: string | null;
  origin: string | null;
}

export interface AutoAddClass {
  id: string;
  classroom_id: string;
  /** YYYY-MM-DD, IST. */
  scheduled_date: string;
  /** HH:MM or HH:MM:SS, IST. */
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  teams_meeting_join_url: string | null;
  teams_meeting_url: string | null;
}

export const AUTO_ADD_COLUMNS =
  'id, classroom_id, scheduled_date, start_time, end_time, status, teams_meeting_join_url, teams_meeting_url';

/** Start adding the pad this long before class, when teachers open the meeting to set up. */
export const LEAD_MINUTES = 30;
/** Classes per sweep run, and Graph calls at a time within it. Well inside Graph's throttles. */
export const SWEEP_MAX_CLASSES = 40;
const SWEEP_CONCURRENCY = 5;

const IST_OFFSET_MS = 330 * 60_000;

export type AutoAddOutcome = MeetingTabOutcome | 'not_listed' | 'not_configured' | 'switched_off' | 'timed_out';

/** How long scheduling a class waits for the pad before carrying on without it. */
export const SCHEDULING_BUDGET_MS = 8_000;

export interface AutoAddResult {
  outcome: AutoAddOutcome;
  chatId: string | null;
  reason?: string;
}

export function autoAddConfig(env: Record<string, string | undefined> = process.env): AutoAddConfig {
  const listed = (env.PAD_AUTO_ADD_CLASSROOMS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    classrooms: listed.includes('all') ? 'all' : new Set(listed),
    catalogAppId: env.PAD_TEAMS_APP_CATALOG_ID?.trim() || env.TEAMS_APP_CATALOG_ID?.trim() || null,
    origin: env.PAD_TEAMS_TAB_ORIGIN?.trim() || env.NEXT_PUBLIC_NEXUS_URL?.trim() || null,
  };
}

function listed(config: AutoAddConfig, classroomId: string): boolean {
  return config.classrooms === 'all' || config.classrooms.has(classroomId);
}

function istMinutes(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function minutesOf(time: string | null): number | null {
  const match = time ? /^(\d{1,2}):(\d{2})/.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Today's listed class meetings that are about to start or running now, earliest
 * first. `ignoreWindow` drops the date and time test (the cron route's
 * single-class mode) but never the others: a cancelled class, a channel meeting
 * or an unlisted classroom is not due at any time.
 */
export function dueClasses(
  rows: readonly AutoAddClass[],
  now: Date,
  config: AutoAddConfig,
  options: { ignoreWindow?: boolean } = {},
): AutoAddClass[] {
  const today = istDate(now);
  const nowMinutes = istMinutes(now);

  return rows
    .filter((cls) => {
      if (cls.status === 'cancelled' || !listed(config, cls.classroom_id)) return false;
      if (!meetingChatIdFromJoinUrl(cls.teams_meeting_join_url || cls.teams_meeting_url)) return false;
      if (options.ignoreWindow) return true;
      if (cls.scheduled_date !== today) return false;

      const start = minutesOf(cls.start_time);
      if (start === null) return false;
      let end = minutesOf(cls.end_time) ?? start + 60;
      if (end < start) end += 24 * 60; // runs past midnight
      return nowMinutes >= start - LEAD_MINUTES && nowMinutes <= end;
    })
    .sort((a, b) => (minutesOf(a.start_time) ?? 0) - (minutesOf(b.start_time) ?? 0) || a.id.localeCompare(b.id));
}

const staffFlag = () => padFeatureEnabled('staff');

/**
 * Add the pad to one class's meeting, for the moment Nexus creates it. Never
 * throws: the class is scheduled whatever happens here.
 */
export async function addPadToClassMeeting(
  cls: Pick<AutoAddClass, 'classroom_id' | 'teams_meeting_join_url'> & { teams_meeting_url?: string | null },
  options: { config?: AutoAddConfig; flagEnabled?: () => Promise<boolean>; deps?: MeetingTabDeps } = {},
): Promise<AutoAddResult> {
  const config = options.config ?? autoAddConfig();
  if (!listed(config, cls.classroom_id)) return { outcome: 'not_listed', chatId: null };
  if (!config.catalogAppId || !config.origin) return { outcome: 'not_configured', chatId: null };

  try {
    if (!(await (options.flagEnabled ?? staffFlag)())) return { outcome: 'switched_off', chatId: null };
  } catch (err) {
    return { outcome: 'failed', chatId: null, reason: `flags unreadable: ${err instanceof Error ? err.message : 'unknown error'}` };
  }

  return ensureAnswerPadInMeeting(
    { joinUrl: cls.teams_meeting_join_url || cls.teams_meeting_url, catalogAppId: config.catalogAppId, origin: config.origin },
    options.deps,
  );
}

/**
 * addPadToClassMeeting for the scheduling route: stops waiting after `ms`, so a
 * slow Graph never keeps a teacher staring at a spinner. The sweep finishes the
 * job later if this gave up.
 */
export async function addPadWithinBudget(
  cls: Parameters<typeof addPadToClassMeeting>[0],
  ms: number = SCHEDULING_BUDGET_MS,
  options: Parameters<typeof addPadToClassMeeting>[1] = {},
): Promise<AutoAddResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<AutoAddResult>((resolve) => {
    timer = setTimeout(() => resolve({ outcome: 'timed_out', chatId: null }), ms);
  });
  try {
    return await Promise.race([addPadToClassMeeting(cls, options), giveUp]);
  } finally {
    clearTimeout(timer);
  }
}

export interface SweepSummary {
  skipped?: 'not_configured' | 'switched_off';
  considered: number;
  due: number;
  counts: Partial<Record<MeetingTabOutcome, number>>;
  results: Array<{ classId: string; outcome: MeetingTabOutcome; reason?: string }>;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** The sweep: add the pad to every due class meeting that does not have it yet. */
export async function sweepClassMeetings(input: {
  rows: readonly AutoAddClass[];
  now: Date;
  config?: AutoAddConfig;
  flagEnabled?: () => Promise<boolean>;
  deps?: MeetingTabDeps;
  ignoreWindow?: boolean;
}): Promise<SweepSummary> {
  const config = input.config ?? autoAddConfig();
  const summary: SweepSummary = { considered: input.rows.length, due: 0, counts: {}, results: [] };

  const { catalogAppId, origin } = config;
  if (!catalogAppId || !origin) return { ...summary, skipped: 'not_configured' };
  if (!(await (input.flagEnabled ?? staffFlag)())) return { ...summary, skipped: 'switched_off' };

  const due = dueClasses(input.rows, input.now, config, { ignoreWindow: input.ignoreWindow }).slice(0, SWEEP_MAX_CLASSES);
  summary.due = due.length;

  const outcomes = await mapLimit(due, SWEEP_CONCURRENCY, (cls): Promise<MeetingTabResult> =>
    ensureAnswerPadInMeeting(
      { joinUrl: cls.teams_meeting_join_url || cls.teams_meeting_url, catalogAppId, origin },
      input.deps,
    ),
  );

  due.forEach((cls, index) => {
    const { outcome, reason } = outcomes[index];
    summary.counts[outcome] = (summary.counts[outcome] ?? 0) + 1;
    summary.results.push({ classId: cls.id, outcome, ...(reason ? { reason } : {}) });
  });
  return summary;
}
