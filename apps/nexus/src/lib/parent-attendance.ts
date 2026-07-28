/**
 * Turning raw attendance rows into something a parent can be shown honestly.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 * --------------------------------------
 * Attendance sync runs on a DELEGATED Microsoft token (see
 * lib/attendance-sync.ts), so a cron job cannot refresh it: a human has to be
 * signed in. A class nobody ever synced therefore has NO nexus_attendance rows
 * at all, which is byte-for-byte indistinguishable from "the entire roster was
 * absent". The same limitation is documented at lib/inactivity-score.ts:25-31
 * and worked around at api/students/inactivity/route.ts.
 *
 * For a teacher-facing screen that ambiguity is an annoyance. For a parent it is
 * the single worst failure this portal can have: telling a parent their child
 * missed every class because an admin did not click Sync. So every metric here
 * has THREE states, never two, and anything unmeasured is excluded from every
 * count rather than being silently counted as an absence.
 *
 * Pure and DB-free on purpose, so all of the above is unit-testable.
 *
 * The `late` / `leftEarly` / `droppedMidClass` derivations are ported verbatim
 * from api/timetable/class-insights/route.ts so the parent and the teacher can
 * never see a different verdict about the same class, and the grace window is
 * imported from lib/class-absences.ts rather than redeclared.
 */

import { LATE_THRESHOLD_MINUTES } from './class-absences';

export type ClassMeasurement = 'measured' | 'not_measured';

/**
 * How a single class reads to a parent. Deliberately neutral wording: this is a
 * support tool, not a disciplinary record. "partly_attended" rather than
 * "dropped out", "missed" rather than "absent without leave".
 */
export type AttendanceLabel =
  | 'attended'
  | 'joined_late'
  | 'left_early'
  | 'partly_attended'
  | 'missed'
  | 'missed_with_reason'
  | 'not_recorded';

export const ATTENDANCE_LABEL_TEXT: Record<AttendanceLabel, string> = {
  attended: 'Attended',
  joined_late: 'Joined late',
  left_early: 'Left early',
  partly_attended: 'Partly attended',
  missed: 'Missed',
  missed_with_reason: 'Missed (reason given)',
  not_recorded: 'Not recorded',
};

export interface ScheduledClassRow {
  id: string;
  title: string | null;
  /** 'YYYY-MM-DD' */
  scheduled_date: string;
  /** 'HH:MM:SS' */
  start_time: string;
  end_time: string;
  status?: string | null;
}

/** A nexus_attendance row for one student. */
export interface AttendanceRow {
  scheduled_class_id: string;
  attended: boolean | null;
  joined_at: string | null;
  left_at: string | null;
  duration_minutes: number | null;
  /** Raw Teams payload: [{ joinDateTime, leaveDateTime, durationInSeconds }] */
  attendance_intervals?: unknown;
}

/** A nexus_class_absences row for one student, if one was detected. */
export interface AbsenceRow {
  scheduled_class_id: string;
  kind?: string | null;
  reason_code?: string | null;
  reason_note?: string | null;
  reason_source?: string | null;
}

/** One continuous stretch of presence. More than one means they rejoined. */
export interface AttendanceSegment {
  joinedAt: string | null;
  leftAt: string | null;
  durationMinutes: number | null;
}

export interface ClassAttendanceView {
  classId: string;
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  startTime: string;
  endTime: string;
  /** Scheduled length in minutes, for the "present 73 of 90 min" line. */
  scheduledMinutes: number | null;

  measurement: ClassMeasurement;
  label: AttendanceLabel;

  /**
   * Every field below is null when measurement is 'not_measured'. That is the
   * type-level expression of the rule: there is no way to render a number for a
   * class we never measured, because there is no number to render.
   */
  attended: boolean | null;
  joinedAt: string | null;
  leftAt: string | null;
  durationMinutes: number | null;
  late: boolean | null;
  leftEarly: boolean | null;
  droppedMidClass: boolean | null;
  segments: AttendanceSegment[];

  /** Present only when the child missed the class and someone explained why. */
  reasonCode: string | null;
  reasonNote: string | null;
  reasonSource: string | null;
}

export interface AttendanceSummary {
  totalClasses: number;
  measuredClasses: number;
  notMeasuredClasses: number;
  attended: number;
  missed: number;
  missedWithReason: number;
  late: number;
  leftEarly: number;
  droppedMidClass: number;
  presentMinutes: number;
  /**
   * null when measuredClasses is 0. NEVER 0.
   *
   * "We have not recorded any attendance for this period" and "your child
   * attended none of their classes" are completely different messages to send a
   * parent, and a percentage cannot distinguish them. Callers must branch on
   * null and render the honest sentence.
   */
  attendanceRate: number | null;
}

/**
 * Classes are stored as a local date plus a local time, and Neram runs on IST.
 * Parsing without the offset would shift every class by the server's timezone,
 * which on Vercel (UTC) turns a 6pm class into 11:30pm and makes every student
 * look late. Same construction as class-insights and class-absences.
 */
function istMs(date: string, time: string): number {
  const ms = new Date(`${date}T${time}+05:30`).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Normalise the raw Teams interval payload into something renderable. */
function parseSegments(raw: unknown): AttendanceSegment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      if (!entry || typeof entry !== 'object') return null;
      const joinedAt = entry.joinDateTime ?? entry.joinedAt ?? null;
      const leftAt = entry.leaveDateTime ?? entry.leftAt ?? null;
      const seconds = entry.durationInSeconds ?? entry.duration_in_seconds ?? null;
      const durationMinutes =
        typeof seconds === 'number' && Number.isFinite(seconds)
          ? Math.round(seconds / 60)
          : null;
      if (!joinedAt && !leftAt && durationMinutes === null) return null;
      return { joinedAt, leftAt, durationMinutes };
    })
    .filter((s): s is AttendanceSegment => s !== null)
    .sort((a, b) => (toMs(a.joinedAt) ?? 0) - (toMs(b.joinedAt) ?? 0));
}

function pickLabel(args: {
  attended: boolean;
  late: boolean;
  leftEarly: boolean;
  droppedMidClass: boolean;
  hasReason: boolean;
}): AttendanceLabel {
  if (!args.attended) return args.hasReason ? 'missed_with_reason' : 'missed';
  // Dropping out and rejoining, or both arriving late and leaving early, is
  // better summarised as partial presence than as either single fact.
  if (args.droppedMidClass || (args.late && args.leftEarly)) return 'partly_attended';
  if (args.late) return 'joined_late';
  if (args.leftEarly) return 'left_early';
  return 'attended';
}

/**
 * Build the per-class view a parent sees.
 *
 * @param classes           the classes in the window, in whatever order
 * @param attendanceRows    nexus_attendance rows for THIS student only
 * @param measuredClassIds  ids of classes that have at least one attendance row
 *                          for ANY student. This is the caller's half of the
 *                          honesty rule and it cannot be derived from this
 *                          student's rows alone, which is exactly why it is a
 *                          required argument rather than an inferred one.
 * @param absenceRows       nexus_class_absences rows for THIS student, optional
 */
export function buildClassAttendanceViews(
  classes: ScheduledClassRow[],
  attendanceRows: AttendanceRow[],
  measuredClassIds: Set<string> | string[],
  absenceRows: AbsenceRow[] = []
): ClassAttendanceView[] {
  const measured =
    measuredClassIds instanceof Set ? measuredClassIds : new Set(measuredClassIds);
  const attByClass = new Map<string, AttendanceRow>(
    (attendanceRows || []).map((a) => [a.scheduled_class_id, a])
  );
  const absByClass = new Map<string, AbsenceRow>(
    (absenceRows || []).map((a) => [a.scheduled_class_id, a])
  );

  return (classes || []).map((cls) => {
    const att = attByClass.get(cls.id);
    const abs = absByClass.get(cls.id);

    // A row for this student proves the class WAS measured, whatever the caller
    // passed. Defensive union rather than trusting one source.
    const isMeasured = measured.has(cls.id) || !!att;

    const startMs = istMs(cls.scheduled_date, cls.start_time);
    const endMs = istMs(cls.scheduled_date, cls.end_time);
    const scheduledMinutes =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 60000)
        : null;

    const base = {
      classId: cls.id,
      title: cls.title || 'Class',
      date: cls.scheduled_date,
      startTime: cls.start_time,
      endTime: cls.end_time,
      scheduledMinutes,
      reasonCode: abs?.reason_code ?? null,
      reasonNote: abs?.reason_note ?? null,
      reasonSource: abs?.reason_source ?? null,
    };

    if (!isMeasured) {
      // The whole point. No attended flag, no times, no derived booleans: we do
      // not know, and the shape says so.
      return {
        ...base,
        measurement: 'not_measured' as const,
        label: 'not_recorded' as const,
        attended: null,
        joinedAt: null,
        leftAt: null,
        durationMinutes: null,
        late: null,
        leftEarly: null,
        droppedMidClass: null,
        segments: [],
      };
    }

    const attended = !!att?.attended;
    const joinedMs = toMs(att?.joined_at);
    const leftMs = toMs(att?.left_at);
    const graceMs = LATE_THRESHOLD_MINUTES * 60 * 1000;
    const segments = parseSegments(att?.attendance_intervals);

    const late =
      attended && joinedMs !== null && Number.isFinite(startMs)
        ? joinedMs - startMs > graceMs
        : false;
    const leftEarly =
      attended && leftMs !== null && Number.isFinite(endMs)
        ? endMs - leftMs > graceMs
        : false;
    // More than one join/leave segment means they dropped out and came back.
    const segmentCount = segments.length || (attended ? 1 : 0);
    const droppedMidClass = segmentCount > 1;

    return {
      ...base,
      measurement: 'measured' as const,
      label: pickLabel({
        attended,
        late,
        leftEarly,
        droppedMidClass,
        hasReason: !!(abs?.reason_code || abs?.reason_note),
      }),
      attended,
      joinedAt: att?.joined_at ?? null,
      leftAt: att?.left_at ?? null,
      durationMinutes: att?.duration_minutes ?? null,
      late,
      leftEarly,
      droppedMidClass,
      segments,
    };
  });
}

/**
 * Roll the per-class views into the numbers on the parent's home screen.
 *
 * Unmeasured classes are counted separately and excluded from everything else,
 * so a period with no sync yields `attendanceRate: null` rather than 0%.
 */
export function summarise(views: ClassAttendanceView[]): AttendanceSummary {
  const list = views || [];
  const measured = list.filter((v) => v.measurement === 'measured');

  const attended = measured.filter((v) => v.attended).length;
  const missedViews = measured.filter((v) => v.attended === false);

  const presentMinutes = measured.reduce(
    (sum, v) => sum + (typeof v.durationMinutes === 'number' ? v.durationMinutes : 0),
    0
  );

  return {
    totalClasses: list.length,
    measuredClasses: measured.length,
    notMeasuredClasses: list.length - measured.length,
    attended,
    missed: missedViews.length,
    missedWithReason: missedViews.filter((v) => v.label === 'missed_with_reason').length,
    late: measured.filter((v) => v.late).length,
    leftEarly: measured.filter((v) => v.leftEarly).length,
    droppedMidClass: measured.filter((v) => v.droppedMidClass).length,
    presentMinutes,
    attendanceRate: measured.length
      ? Math.round((attended / measured.length) * 100)
      : null,
  };
}

/**
 * The one-line sentence under the headline number.
 * Exists so no caller has to decide how to phrase the unmeasured case, and so
 * "0 of 0" or "0%" can never reach a parent's screen.
 */
export function describeAttendance(summary: AttendanceSummary): string {
  if (summary.measuredClasses === 0) {
    return summary.totalClasses === 0
      ? 'No classes scheduled in this period.'
      : "Attendance for this period hasn't been recorded yet.";
  }

  const headline = `Attended ${summary.attended} of ${summary.measuredClasses} ${
    summary.measuredClasses === 1 ? 'class' : 'classes'
  }.`;

  if (summary.notMeasuredClasses > 0) {
    return `${headline} ${summary.notMeasuredClasses} more ${
      summary.notMeasuredClasses === 1 ? 'class has' : 'classes have'
    } no attendance recorded.`;
  }
  return headline;
}
