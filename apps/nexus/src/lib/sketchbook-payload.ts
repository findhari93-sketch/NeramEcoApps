import { getSupabaseAdminClient } from '@neram/database';
import {
  countSketches, firstAndLatestSketch, firstSeenBy, getDrawingSharingOptOut, getFeatureOptOut, getSketchbookGoalHistory,
  getQBHelpUsed, getQBPracticeOrigins, listLiveFeatures, listSketchbookMonth,
  type QBPracticeOrigin, type SketchbookFeatureFact, type SketchbookSketchRow, type SketchbookViewer,
} from '@neram/database/queries/nexus';
import { computeRhythm, daysBetween, istDate, practiceDate, type Rhythm } from '@/lib/sketchbook-rhythm';
import { clampDates, proratedGoal, trackingStart } from '@/lib/sketchbook-status';
import {
  loadDrawingDays, loadStudentRhythmContext, loadStudentTimeZones, type StudentRhythmContext,
} from '@/lib/drawing-activity-store';
import { reviewKindOf, summarizeReview, type ReviewKind, type ReviewSummary } from '@/lib/drawing-source';
import { heldIdsFrom, isReleasedForStudent } from '@/lib/student-drawing-payload';
import { loadManualEvaluations } from '@/lib/student-drawing-payload-server';

/** Launch day of the sketchbook, the floor for a student with no live classroom. */
const SKETCHBOOK_LAUNCH = '2026-09-12';

/** One drawing on its sketchbook date, with what the viewer may know about its review. */
export interface SketchbookEntry extends SketchbookSketchRow {
  seenBy: { name: string | null; at: string } | null;
  featured: SketchbookFeatureFact[];
  kind: ReviewKind;
  review: ReviewSummary;
  /** The bank question this was practised from, when it came from the Question Bank. */
  practisedFrom: QBPracticeOrigin | null;
  /**
   * What the student had open while they drew it: 'solution', 'peers', or both.
   *
   * Never hidden from the student and never editable by them, because the point
   * of recording it is that the teacher can always tell, and a record only the
   * teacher can see would be a record the student cannot argue with.
   */
  helpUsed: string[];
  /** The day this drawing counts for on the student's clock, the same day its dot is on. */
  practiceDate: string | null;
}

export interface SketchbookPayload {
  rhythm: Rhythm;
  goal: number;
  classroom: { id: string; name: string } | null;
  totalSketches: number;
  thenAndNow: { first: SketchbookSketchRow; latest: SketchbookSketchRow } | null;
  month: string;
  sketches: SketchbookEntry[];
  practiceDaysThisMonth: number;
  featureOptOut: boolean;
  /** The student asked to keep their drawings out of Inspiration. */
  shareOptOut: boolean;
  /** The student's device time zone, null when unknown (then IST). */
  timeZone: string | null;
}

/**
 * The student's rhythm, computed the same way the teacher's Class rhythm screen
 * computes it: any drawing upload is a practice day, nothing before their own
 * tracking start counts, and a week tracking joined part way through has a
 * smaller goal. Shared by the payload and the add-sketch response.
 *
 * "Today" is the student's own practice day (their device time zone, 4 am
 * rollover), so the week the teacher peeks at is the week the student sees.
 */
export async function loadStudentRhythm(
  studentId: string,
  now: Date = new Date(),
): Promise<{
  rhythm: Rhythm; context: StudentRhythmContext | null; dates: string[]; start: string; timeZone: string | null;
}> {
  const [context, zones] = await Promise.all([loadStudentRhythmContext(studentId), loadStudentTimeZones([studentId])]);
  const timeZone = zones[studentId] ?? null;
  const today = practiceDate(now, timeZone);
  const start = context
    ? trackingStart({ classroomStartedOn: context.startedOn, enrolledAt: context.enrolledAt, reactivatedOn: context.reactivatedOn })
    : SKETCHBOOK_LAUNCH;
  const [days, history] = await Promise.all([
    loadDrawingDays([studentId], start),
    context ? getSketchbookGoalHistory(context.classroomId) : Promise.resolve([]),
  ]);
  const dates = clampDates(days[studentId] || [], start, today);
  const rhythm = computeRhythm(dates, today, history, context?.goal ?? 3);
  const goal = proratedGoal(rhythm.week.goal, rhythm.week.start, start);
  if (goal !== rhythm.week.goal) {
    rhythm.week = { ...rhythm.week, goal, met: rhythm.week.count >= goal };
  }
  // Last week is shown only when it overlapped tracking, and judged the same way.
  const last = rhythm.lastWeek;
  if (last && daysBetween(start, last.start) <= -7) {
    rhythm.lastWeek = null;
  } else if (last) {
    const lastGoal = proratedGoal(last.goal, last.start, start);
    if (lastGoal !== last.goal) rhythm.lastWeek = { ...last, goal: lastGoal, met: last.count >= lastGoal };
  }
  return { rhythm, context, dates, start, timeZone };
}

/**
 * One drawing as the viewer may see it. A student sees a review only once it is
 * handed back (lib/student-drawing-payload): until then the grade, the reaction
 * and the review time are blank, and the gallery flag never leaves the server.
 * Staff see the row as stored.
 */
export function entryFor(
  row: SketchbookSketchRow,
  viewer: SketchbookViewer,
  heldIds: ReadonlySet<string>,
  seenBy: SketchbookEntry['seenBy'],
  featured: SketchbookFeatureFact[],
  practice: { origin?: QBPracticeOrigin | null; helpUsed?: string[]; timeZone?: string | null } = {},
): SketchbookEntry {
  const released = viewer === 'staff' || isReleasedForStudent(row, heldIds);
  const visible = released ? row : { ...row, tutor_rating: null, tutor_marks: null, reaction: null, reviewed_at: null };
  const safe = viewer === 'student' ? { ...visible, is_gallery_visible: false } : visible;
  return {
    ...safe,
    seenBy,
    featured,
    kind: reviewKindOf(row),
    review: summarizeReview(row, released),
    practisedFrom: practice.origin ?? null,
    helpUsed: practice.helpUsed ?? [],
    practiceDate: row.submitted_at ? practiceDate(row.submitted_at, practice.timeZone) : null,
  };
}

/**
 * May the student delete this drawing themselves? Only their own sketchbook
 * upload, before a teacher has reviewed it and while no class is showing it.
 * The server enforces the same rule (DELETE /api/sketchbook/entries/[id]
 * answers 409), so this only decides whether the button is offered.
 */
export function canDeleteOwnSketch(entry: SketchbookEntry): boolean {
  return entry.source_type === 'sketchbook' && entry.review.state === 'none' && entry.featured.length === 0;
}

/** One assembly for the student's own view and the teacher's peek, so they never drift. */
export async function buildSketchbookPayload(
  studentId: string,
  month: string,
  opts: { summaryOnly: boolean; viewer: SketchbookViewer; now?: Date },
): Promise<SketchbookPayload> {
  const [{ rhythm, context, dates, timeZone }, total, optOut, shareOptOut] = await Promise.all([
    loadStudentRhythm(studentId, opts.now),
    countSketches(studentId, opts.viewer),
    getFeatureOptOut(studentId),
    getDrawingSharingOptOut(studentId),
  ]);

  const base: SketchbookPayload = {
    rhythm,
    goal: rhythm.week.goal,
    classroom: context ? { id: context.classroomId, name: context.classroomName } : null,
    totalSketches: total,
    thenAndNow: null,
    month,
    sketches: [],
    practiceDaysThisMonth: dates.filter((d) => d.startsWith(month)).length,
    featureOptOut: optOut,
    shareOptOut,
    timeZone,
  };
  if (opts.summaryOnly) return base;

  const [rows, edges] = await Promise.all([
    listSketchbookMonth(studentId, month, opts.viewer),
    firstAndLatestSketch(studentId),
  ]);
  const ids = rows.map((r) => r.id);
  // Any drawing with a practice question behind it, not only one uploaded
  // through the bank: a teacher can file an older sketch under the question it
  // answers, and that sketch keeps being a sketch.
  const qbRows = rows.filter((r) => !!r.question_id);
  const [seen, features, evaluations, origins, help] = await Promise.all([
    firstSeenBy(ids),
    listLiveFeatures(ids),
    // Only a student's own view needs to know which reviews are still held.
    opts.viewer === 'student' ? loadManualEvaluations(getSupabaseAdminClient(), ids) : Promise.resolve([]),
    // Best effort, both of them. A missing caption is a caption; a sketchbook
    // that will not open because a label lookup failed is a month of a
    // student's work they cannot reach.
    getQBPracticeOrigins(qbRows.map((r) => r.question_id || '')).catch(
      () => ({}) as Record<string, QBPracticeOrigin>,
    ),
    getQBHelpUsed(qbRows.map((r) => r.id)).catch(() => ({}) as Record<string, string[]>),
  ]);
  const heldIds = heldIdsFrom(evaluations);

  base.sketches = rows.map((r) =>
    entryFor(r, opts.viewer, heldIds, seen[r.id] ?? null, features[r.id] ?? [], {
      origin: (r.question_id && origins[r.question_id]) || null,
      helpUsed: help[r.id] ?? [],
      timeZone,
    }),
  );
  // Same rule as thenAndNow() in the engine (8+ drawings, 30+ days apart), but
  // from the two edge rows instead of the whole list, which we never load here.
  if (edges && total >= 8 && daysBetween(istDate(edges.first.submitted_at), istDate(edges.latest.submitted_at)) >= 30) {
    base.thenAndNow = edges;
  }
  return base;
}
