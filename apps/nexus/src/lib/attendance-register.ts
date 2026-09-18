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
  // Last, because it is a summary judgement about the total ("barely there"
  // at all) rather than a fact about one edge of the window the way the three
  // above are. Computed by the rules but never printed anywhere until now.
  if (presence.barelyThere) parts.push('Barely there');
  return parts.length ? `${parts.join('. ')}.` : '';
}
