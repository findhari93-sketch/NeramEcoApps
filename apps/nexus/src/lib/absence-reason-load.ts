/**
 * The two batched reads `resolveAbsenceReason` needs, for many rows at once.
 *
 * Kept apart from absence-reason.ts so that file stays pure and testable
 * without a database. Two queries however many rows: one for the RSVP opt-outs
 * of the classes involved, one for the students' away windows over the span of
 * those classes' dates. Never one per row.
 */

import { groupByStudent, loadAwayWindows, type AwayWindow } from './away-windows';
import { resolveAbsenceReason, type AbsenceReasonFields, type ResolvedReason } from './absence-reason';

export interface ReasonRow extends AbsenceReasonFields {
  student_id: string;
  scheduled_class_id: string;
  /** The class's IST date. Rows without one cannot be tested against a window. */
  scheduled_date?: string | null;
}

export interface ReasonContext {
  rsvpByKey: Map<string, { response: string; reason_code: string | null; reason: string | null; responded_at: string | null }>;
  windowsByStudent: Map<string, AwayWindow[]>;
}

const key = (classId: string, studentId: string) => `${classId}:${studentId}`;

/**
 * Same figure as IN_LIST_CHUNK in packages/database/utils/paged-rows.ts: about
 * 400 uuids overflow Node's 16 KB header limit and surface as "fetch failed".
 * Not imported, because that constant is not exported from the package and
 * widening the package's barrel rebuilds all four apps.
 */
const IN_LIST_CHUNK = 200;

export async function loadReasonContext(
  supabase: { from: (t: string) => any },
  rows: ReasonRow[],
): Promise<ReasonContext> {
  const classIds = Array.from(new Set(rows.map((r) => r.scheduled_class_id)));
  const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
  const dates = rows.map((r) => r.scheduled_date).filter((d): d is string => !!d).sort();

  const rsvpByKey: ReasonContext['rsvpByKey'] = new Map();
  if (classIds.length === 0) return { rsvpByKey, windowsByStudent: new Map() };

  const rsvpReads: Promise<void>[] = [];
  for (let i = 0; i < classIds.length; i += IN_LIST_CHUNK) {
    const chunk = classIds.slice(i, i + IN_LIST_CHUNK);
    rsvpReads.push(
      (async () => {
        const { data, error } = await supabase
          .from('nexus_class_rsvp')
          .select('scheduled_class_id, student_id, response, reason_code, reason, responded_at')
          .in('scheduled_class_id', chunk)
          .eq('response', 'not_attending');
        if (error) throw error;
        for (const r of data || []) rsvpByKey.set(key(r.scheduled_class_id, r.student_id), r);
      })(),
    );
  }

  const [windows] = await Promise.all([
    dates.length
      ? loadAwayWindows(supabase, { studentIds, from: dates[0], to: dates[dates.length - 1] })
      : Promise.resolve([] as AwayWindow[]),
    ...rsvpReads,
  ]);

  return { rsvpByKey, windowsByStudent: groupByStudent(windows as AwayWindow[]) };
}

export function resolveFromContext(ctx: ReasonContext, row: ReasonRow): ResolvedReason | null {
  return resolveAbsenceReason({
    absence: row,
    rsvp: ctx.rsvpByKey.get(key(row.scheduled_class_id, row.student_id)) ?? null,
    awayWindows: ctx.windowsByStudent.get(row.student_id) ?? null,
    classDate: row.scheduled_date ?? null,
  });
}
