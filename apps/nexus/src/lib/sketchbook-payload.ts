import { getSupabaseAdminClient } from '@neram/database';
import {
  countSketches, firstAndLatestSketch, firstSeenBy, getDrawingSharingOptOut, getFeatureOptOut, getSketchbookGoalHistory,
  listLiveFeatures, listSketchbookMonth,
  type SketchbookFeatureFact, type SketchbookSketchRow, type SketchbookViewer,
} from '@neram/database/queries/nexus';
import { computeRhythm, daysBetween, istDate, type Rhythm } from '@/lib/sketchbook-rhythm';
import { clampDates, proratedGoal, trackingStart } from '@/lib/sketchbook-status';
import { loadDrawingDays, loadStudentRhythmContext, type StudentRhythmContext } from '@/lib/drawing-activity-store';
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
}

/**
 * The student's rhythm, computed the same way the teacher's Class rhythm screen
 * computes it: any drawing upload is a practice day, nothing before their own
 * tracking start counts, and a week tracking joined part way through has a
 * smaller goal. Shared by the payload and the add-sketch response.
 */
export async function loadStudentRhythm(
  studentId: string,
  today: string,
): Promise<{ rhythm: Rhythm; context: StudentRhythmContext | null; dates: string[]; start: string }> {
  const context = await loadStudentRhythmContext(studentId);
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
  return { rhythm, context, dates, start };
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
): SketchbookEntry {
  const released = viewer === 'staff' || isReleasedForStudent(row, heldIds);
  const visible = released ? row : { ...row, tutor_rating: null, tutor_marks: null, reaction: null, reviewed_at: null };
  const safe = viewer === 'student' ? { ...visible, is_gallery_visible: false } : visible;
  return { ...safe, seenBy, featured, kind: reviewKindOf(row), review: summarizeReview(row, released) };
}

/** One assembly for the student's own view and the teacher's peek, so they never drift. */
export async function buildSketchbookPayload(
  studentId: string,
  month: string,
  opts: { summaryOnly: boolean; today: string; viewer: SketchbookViewer },
): Promise<SketchbookPayload> {
  const [{ rhythm, context, dates }, total, optOut, shareOptOut] = await Promise.all([
    loadStudentRhythm(studentId, opts.today),
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
  };
  if (opts.summaryOnly) return base;

  const [rows, edges] = await Promise.all([
    listSketchbookMonth(studentId, month, opts.viewer),
    firstAndLatestSketch(studentId),
  ]);
  const ids = rows.map((r) => r.id);
  const [seen, features, evaluations] = await Promise.all([
    firstSeenBy(ids),
    listLiveFeatures(ids),
    // Only a student's own view needs to know which reviews are still held.
    opts.viewer === 'student' ? loadManualEvaluations(getSupabaseAdminClient(), ids) : Promise.resolve([]),
  ]);
  const heldIds = heldIdsFrom(evaluations);

  base.sketches = rows.map((r) => entryFor(r, opts.viewer, heldIds, seen[r.id] ?? null, features[r.id] ?? []));
  // Same rule as thenAndNow() in the engine (8+ drawings, 30+ days apart), but
  // from the two edge rows instead of the whole list, which we never load here.
  if (edges && total >= 8 && daysBetween(istDate(edges.first.submitted_at), istDate(edges.latest.submitted_at)) >= 30) {
    base.thenAndNow = edges;
  }
  return base;
}
