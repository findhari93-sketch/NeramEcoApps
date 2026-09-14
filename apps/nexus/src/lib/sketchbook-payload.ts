import {
  countSketches, firstAndLatestSketch, firstSeenBy, getFeatureOptOut, getSketchbookGoalHistory,
  listLiveFeatures, listSketchbookMonth,
  type SketchbookFeatureFact, type SketchbookSketchRow,
} from '@neram/database/queries/nexus';
import { computeRhythm, daysBetween, istDate, type Rhythm } from '@/lib/sketchbook-rhythm';
import { clampDates, proratedGoal, trackingStart } from '@/lib/sketchbook-status';
import { loadDrawingDays, loadStudentRhythmContext, type StudentRhythmContext } from '@/lib/drawing-activity-store';

/** Launch day of the sketchbook, the floor for a student with no live classroom. */
const SKETCHBOOK_LAUNCH = '2026-09-12';

export interface SketchbookPayload {
  rhythm: Rhythm;
  goal: number;
  classroom: { id: string; name: string } | null;
  totalSketches: number;
  thenAndNow: { first: SketchbookSketchRow; latest: SketchbookSketchRow } | null;
  month: string;
  sketches: Array<SketchbookSketchRow & { seenBy: { name: string | null; at: string } | null; featured: SketchbookFeatureFact[] }>;
  practiceDaysThisMonth: number;
  featureOptOut: boolean;
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

/** One assembly for the student's own view and the teacher's peek, so they never drift. */
export async function buildSketchbookPayload(
  studentId: string,
  month: string,
  opts: { summaryOnly: boolean; today: string },
): Promise<SketchbookPayload> {
  const [{ rhythm, context, dates }, total, optOut] = await Promise.all([
    loadStudentRhythm(studentId, opts.today),
    countSketches(studentId),
    getFeatureOptOut(studentId),
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
  };
  if (opts.summaryOnly) return base;

  const [rows, edges] = await Promise.all([listSketchbookMonth(studentId, month), firstAndLatestSketch(studentId)]);
  const ids = rows.map((r) => r.id);
  const [seen, features] = await Promise.all([firstSeenBy(ids), listLiveFeatures(ids)]);

  base.sketches = rows.map((r) => ({ ...r, seenBy: seen[r.id] ?? null, featured: features[r.id] ?? [] }));
  // Same rule as thenAndNow() in the engine (8+ sketches, 30+ days apart), but
  // from the two edge rows instead of the whole list, which we never load here.
  if (edges && total >= 8 && daysBetween(istDate(edges.first.submitted_at), istDate(edges.latest.submitted_at)) >= 30) {
    base.thenAndNow = edges;
  }
  return base;
}
