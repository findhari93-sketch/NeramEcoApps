/**
 * Planning core for "Backfill from Teams": decide, without touching Graph or
 * Supabase, which past meetings should become Nexus classes.
 *
 * Deliberately NOT built on `syncClassroomMeetings`. That reconciler cancels any
 * class whose matched event is `isCancelled`, silently rewrites titles and times
 * on rows it already knows, and inserts without `publish_state`. Over a month
 * wide window those are a mass-cancel with student notifications attached. The
 * backfill borrows only `fetchGroupCalendarView` and does its own import, and it
 * never cancels on its own initiative: a Nexus class with no matching Teams event
 * is reported as an orphan and left alone, and mirroring a real Teams
 * cancellation onto a Nexus row happens only when the operator ticks it.
 *
 * It does plan the opposite repair, because that is the one an automatic sync can
 * never make. A class marked cancelled in Nexus whose Teams event is alive is a
 * false cancel, and until it is restored the class, its recording and its
 * attendance are missing from every student's timeline.
 *
 * Two discovery sources, because the calendar alone is not enough. A class
 * started with "Meet now" in the channel never produces a calendar event, and
 * `fetchGroupCalendarView` also drops any event without a join URL. What such a
 * class does leave behind is an mp4 in the channel's Recordings folder whose
 * filename carries the subject and the start time.
 */

import type { TeamsCalendarEvent } from './teams-meeting-sync';
import {
  parseRecordingFileName,
  classStartMs,
  type RecordingFile,
} from './channel-recordings';
import { parseChannelJoinUrl } from './teams-attendance-probe';

/** A recording with no calendar event is assumed to run this long. */
export const DEFAULT_DURATION_MIN = 90;

/** How close a recording must start to a known class before it is the same class. */
const SAME_CLASS_TOLERANCE_MS = 2 * 60 * 60 * 1000;

export type RowSource = 'calendar' | 'recording';

export type RowAction =
  | 'import'
  | 'exists_by_event_id'
  | 'exists_by_join_url'
  | 'exists_by_slot'
  | 'skip_cancelled';

/**
 * A disagreement between the Nexus row's status and the Teams event's.
 *
 * `restore` is the safe direction and the reason this exists: the class ran, and
 * only a stale `cancelled` flag is hiding it. `cancel_in_nexus` is the other way
 * round and is never applied unless the operator asks for it by name.
 */
export type StatusFix = 'restore' | 'cancel_in_nexus';

export interface ExistingClassRow {
  id: string;
  title: string;
  teams_meeting_id: string | null;
  teams_meeting_join_url: string | null;
  teams_meeting_url: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  publish_state: string | null;
  recording_url: string | null;
  attendance_sync_status: string | null;
  attendance_sync_attempts: number | null;
  attendance_synced_at: string | null;
  teacher_id: string | null;
  organizer_ms_oid: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
}

export interface PlannedRow {
  /** Stable client-side key: the event id, or `rec:<filename>`. */
  key: string;
  source: RowSource;
  event_id: string | null;
  join_url: string | null;
  subject: string;
  /** IST wall clock, exactly as the timetable stores it. */
  scheduled_date: string;
  start_time: string;
  end_time: string;
  /** True when end_time is a guess because only a recording was found. */
  duration_estimated: boolean;
  /** Teams' own verdict on the event. */
  is_cancelled: boolean;
  action: RowAction;
  existing_class_id: string | null;
  /** The matched Nexus row's status, so the two can be shown side by side. */
  existing_status: string | null;
  /** Set only when Nexus and Teams disagree about whether the class is on. */
  status_fix: StatusFix | null;
  matched_on: 'event_id' | 'join_url' | 'slot' | null;
  organizer_name: string | null;
  organizer_email: string | null;
  /**
   * Read off THIS row's own join URL, never shared across the window. Meetings in
   * one channel can be organized by different people, and stamping one row's
   * organizer onto another sends the attendance lookup to the wrong mailbox.
   */
  organizer_oid: string | null;
  body_content: string | null;
  /** Set only for rows discovered through the Recordings folder. */
  recording_name: string | null;
  recording_url: string | null;
}

export interface BackfillPlan {
  rows: PlannedRow[];
  orphans: ExistingClassRow[];
}

/**
 * Reduce a Teams join URL to something two sources can be compared on.
 *
 * The same meeting reaches us percent-encoded from Graph and half-decoded from
 * the database, with a `?context={"Tid":…,"Oid":…}` tail that is not part of the
 * meeting's identity. The epoch segment at the end of the path IS part of it:
 * two channel meetings in the same thread differ only there.
 */
export function canonicalJoinUrl(url?: string | null): string | null {
  if (!url) return null;
  let decoded = url.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Leave a malformed escape sequence as-is rather than losing the URL.
  }
  const noQuery = decoded.split('?')[0].split('#')[0].replace(/\/+$/, '');
  const m = noQuery.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  if (!m) return noQuery || null;
  return `${m[1].toLowerCase()}${m[2] ?? ''}`;
}

const hhmm = (t: string) => (t || '').substring(0, 5);

/** Add minutes to an `HH:MM` wall clock, clamping at 23:59 rather than wrapping. */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = hhmm(time).split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface Match {
  row: ExistingClassRow;
  on: 'event_id' | 'join_url' | 'slot';
}

function findExisting(
  existing: ExistingClassRow[],
  opts: { eventId?: string | null; joinUrl?: string | null; date: string; startTime: string },
): Match | null {
  if (opts.eventId) {
    const byId = existing.find((r) => r.teams_meeting_id === opts.eventId);
    if (byId) return { row: byId, on: 'event_id' };
  }

  const canon = canonicalJoinUrl(opts.joinUrl);
  if (canon) {
    const byUrl = existing.find(
      (r) =>
        canonicalJoinUrl(r.teams_meeting_join_url) === canon ||
        canonicalJoinUrl(r.teams_meeting_url) === canon,
    );
    if (byUrl) return { row: byUrl, on: 'join_url' };
  }

  // Last key, and the one that actually stops duplicates. Event ids returned by
  // calendarView are collection-scoped and need not equal the AAMk…/AQMk… id
  // stored when the meeting was created, so id and URL can both miss a class
  // that is plainly already on the timetable.
  const bySlot = existing.find(
    (r) => r.scheduled_date === opts.date && hhmm(r.start_time) === hhmm(opts.startTime),
  );
  if (bySlot) return { row: bySlot, on: 'slot' };

  return null;
}

/**
 * Work out what a backfill over one window would do.
 *
 * `rows` is ordered by start time and covers everything discovered, including
 * what already exists, because the operator needs to tick an existing class to
 * pull its recording or attendance. `orphans` is reported, never acted on.
 */
export function planBackfill(
  events: TeamsCalendarEvent[],
  recordings: RecordingFile[],
  existing: ExistingClassRow[],
): BackfillPlan {
  const rows: PlannedRow[] = [];
  const matchedExistingIds = new Set<string>();

  for (const event of events) {
    if (!event.start || !event.end) continue;

    const scheduledDate = event.start.substring(0, 10);
    const startTime = event.start.substring(11, 16);
    const endTime = event.end.substring(11, 16);

    const match = findExisting(existing, {
      eventId: event.id,
      joinUrl: event.joinUrl,
      date: scheduledDate,
      startTime,
    });
    if (match) matchedExistingIds.add(match.row.id);

    let action: RowAction;
    if (match) {
      action =
        match.on === 'event_id'
          ? 'exists_by_event_id'
          : match.on === 'join_url'
            ? 'exists_by_join_url'
            : 'exists_by_slot';
    } else {
      action = event.isCancelled ? 'skip_cancelled' : 'import';
    }

    const existingStatus = match?.row.status ?? null;
    let statusFix: StatusFix | null = null;
    if (match) {
      if (existingStatus === 'cancelled' && !event.isCancelled) statusFix = 'restore';
      else if (existingStatus === 'scheduled' && event.isCancelled) statusFix = 'cancel_in_nexus';
    }

    rows.push({
      key: event.id,
      source: 'calendar',
      event_id: event.id,
      join_url: event.joinUrl,
      subject: event.subject || 'Teams Meeting',
      scheduled_date: scheduledDate,
      start_time: startTime,
      end_time: endTime,
      duration_estimated: false,
      is_cancelled: event.isCancelled,
      action,
      existing_class_id: match?.row.id ?? null,
      existing_status: existingStatus,
      status_fix: statusFix,
      matched_on: match?.on ?? null,
      organizer_name: event.organizerName,
      organizer_email: event.organizerEmail,
      organizer_oid: event.joinUrl ? parseChannelJoinUrl(event.joinUrl).organizerOid : null,
      body_content: event.bodyContent,
      recording_name: null,
      recording_url: null,
    });
  }

  // Second source: recordings with no calendar event and no Nexus row behind
  // them. These are the "Meet now" classes, the ones the nightly sync can never
  // see. They get a recording but no meeting id, so no attendance.
  for (const file of recordings) {
    const parsed = parseRecordingFileName(file.name);
    if (!parsed) continue;

    const scheduledDate = parsed.startedAt.substring(0, 10);
    const startTime = parsed.startedAt.substring(11, 16);
    const startMs = classStartMs(scheduledDate, startTime);

    const nearAnEvent = rows.some((r) => {
      const rowMs = classStartMs(r.scheduled_date, r.start_time);
      return Math.abs(rowMs - startMs) <= SAME_CLASS_TOLERANCE_MS;
    });
    if (nearAnEvent) continue;

    const nearAnExistingRow = existing.some((r) => {
      const rowMs = classStartMs(r.scheduled_date, r.start_time);
      return Math.abs(rowMs - startMs) <= SAME_CLASS_TOLERANCE_MS;
    });
    if (nearAnExistingRow) continue;

    rows.push({
      key: `rec:${file.name}`,
      source: 'recording',
      event_id: null,
      join_url: null,
      subject: parsed.subject,
      scheduled_date: scheduledDate,
      start_time: startTime,
      end_time: addMinutes(startTime, DEFAULT_DURATION_MIN),
      duration_estimated: true,
      is_cancelled: false,
      action: 'import',
      existing_class_id: null,
      existing_status: null,
      status_fix: null,
      matched_on: null,
      organizer_name: null,
      organizer_email: null,
      organizer_oid: null,
      body_content: null,
      recording_name: file.name,
      recording_url: file.webUrl,
    });
  }

  rows.sort((a, b) =>
    `${a.scheduled_date}T${a.start_time}`.localeCompare(`${b.scheduled_date}T${b.start_time}`),
  );

  const orphans = existing.filter((r) => !matchedExistingIds.has(r.id));

  return { rows, orphans };
}

export interface BuildRowContext {
  classroomId: string;
  classroomType: string | null;
  teacherId: string | null;
  organizerOid: string | null;
  channelThreadId: string | null;
  /** ISO instant used for published_at. Passed in so the function stays pure. */
  now: string;
}

/** Strip a Graph HTML body down to a short plain-text description. */
function toDescription(html: string | null): string | null {
  if (!html) return null;
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()
      .substring(0, 500) || null
  );
}

/**
 * The insert payload for one planned row.
 *
 * Times come straight off the Graph strings, which are already IST because of
 * the `Prefer: outlook.timezone` header. Never build a Date and call
 * toISOString() here: the timetable stores naive IST wall clock and a UTC round
 * trip moves a 19:00 class to the previous day.
 */
export function buildBackfillRow(
  row: PlannedRow,
  ctx: BuildRowContext,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    classroom_id: ctx.classroomId,
    title: row.subject,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    end_time: row.end_time,
    teacher_id: ctx.teacherId,
    organizer_name: row.organizer_name,
    organizer_email: row.organizer_email,
    description: toDescription(row.body_content),
    target_scope: ctx.classroomType === 'common' ? 'all' : 'classroom',
    status: 'scheduled',
    // The operator chose to publish on import, so these classes and their
    // recordings are visible to the enrolled students straight away.
    publish_state: 'published',
    published_at: ctx.now,
  };

  if (row.source === 'calendar') {
    payload.teams_meeting_id = row.event_id;
    payload.teams_meeting_url = row.join_url;
    payload.teams_meeting_join_url = row.join_url;
    payload.teams_meeting_scope = 'channel_meeting';
    // This row's own organizer wins; ctx is only the window-wide fallback for a
    // join URL that carried no context tail.
    payload.organizer_ms_oid = row.organizer_oid ?? ctx.organizerOid;
    if (ctx.channelThreadId) payload.teams_channel_id = ctx.channelThreadId;
  } else {
    // No meeting id means no attendance is reachable for this one; the recording
    // is the entire record of the class.
    payload.recording_url = row.recording_url;
    payload.recording_fetched_at = ctx.now;
  }

  return payload;
}

/**
 * Columns on an already-imported class that Teams can fill in and Nexus left null.
 *
 * Only ever fills a null. A row whose organizer or teacher someone set by hand is
 * the better record of who taught the class than anything the calendar can say,
 * so it is left exactly as it is.
 *
 * `organizer_ms_oid` is the one that carries weight beyond display: the attendance
 * lookup decides between the delegated and the app-only identity from it, and a
 * null there means every past class falls back to the app-only path that is
 * currently refused by the tenant.
 */
export interface MetadataRepair {
  organizer_ms_oid?: string;
  organizer_name?: string;
  organizer_email?: string;
  teacher_id?: string;
}

export function planMetadataRepair(
  row: PlannedRow,
  existing: ExistingClassRow,
  opts: { teacherId?: string | null } = {},
): MetadataRepair {
  const repair: MetadataRepair = {};

  if (!existing.organizer_ms_oid && row.organizer_oid) {
    repair.organizer_ms_oid = row.organizer_oid;
  }
  if (!existing.organizer_name && row.organizer_name) {
    repair.organizer_name = row.organizer_name;
  }
  if (!existing.organizer_email && row.organizer_email) {
    repair.organizer_email = row.organizer_email;
  }
  if (!existing.teacher_id && opts.teacherId) {
    repair.teacher_id = opts.teacherId;
  }

  return repair;
}
