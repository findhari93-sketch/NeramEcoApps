import {
  countSketches, firstAndLatestSketch, firstSeenBy, getFeatureOptOut, getSketchbookGoalHistory,
  getStudentPrimaryClassroom, listLiveFeatures, listPracticeDates, listSketchbookMonth,
  type SketchbookFeatureFact, type SketchbookSketchRow,
} from '@neram/database/queries/nexus';
import { computeRhythm, daysBetween, istDate, type Rhythm } from '@/lib/sketchbook-rhythm';

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

/** One assembly for the student's own view and the teacher's peek, so they never drift. */
export async function buildSketchbookPayload(
  studentId: string,
  month: string,
  opts: { summaryOnly: boolean; today: string },
): Promise<SketchbookPayload> {
  const [classroom, practiceDates, total, optOut] = await Promise.all([
    getStudentPrimaryClassroom(studentId),
    listPracticeDates(studentId),
    countSketches(studentId),
    getFeatureOptOut(studentId),
  ]);
  const history = classroom ? await getSketchbookGoalHistory(classroom.id) : [];
  const goal = classroom?.sketchbook_weekly_goal ?? 3;
  const rhythm = computeRhythm(practiceDates, opts.today, history, goal);

  const base: SketchbookPayload = {
    rhythm,
    goal: rhythm.week.goal,
    classroom: classroom ? { id: classroom.id, name: classroom.name } : null,
    totalSketches: total,
    thenAndNow: null,
    month,
    sketches: [],
    practiceDaysThisMonth: practiceDates.filter((d) => d.startsWith(month)).length,
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
