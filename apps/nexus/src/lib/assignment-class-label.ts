/**
 * Resolving the timetable class an assignment belongs to, for display.
 *
 * Deliberately here rather than in packages/database's assignment queries:
 * touching that package rebuilds all four apps for a label only Nexus renders.
 * Same reasoning the assignments list route already carried inline, now stated
 * once so the hub, the detail page and anything after them agree on the shape.
 */

import { getSupabaseAdminClient } from '@neram/database';

export interface ScheduledClassLabel {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string | null;
}

const CLASS_LABEL_COLS = 'id, title, scheduled_date, start_time';

/**
 * One batched lookup for the class titles, whatever the assignment count.
 * Rows without a linked class are returned untouched.
 */
export async function attachClassLabels<T extends { scheduled_class_id?: string | null }>(
  rows: T[],
): Promise<Array<T & { scheduled_class?: ScheduledClassLabel }>> {
  const ids = [...new Set(rows.map((a) => a.scheduled_class_id).filter(Boolean))] as string[];
  if (ids.length === 0) return rows;

  const supabase = getSupabaseAdminClient() as any;
  const { data } = await supabase.from('nexus_scheduled_classes').select(CLASS_LABEL_COLS).in('id', ids);

  const byId = new Map<string, ScheduledClassLabel>((data || []).map((c: any) => [c.id, c]));
  return rows.map((a) =>
    a.scheduled_class_id && byId.has(a.scheduled_class_id)
      ? { ...a, scheduled_class: byId.get(a.scheduled_class_id)! }
      : a,
  );
}

/** The single-row form, for an assignment detail response. */
export async function attachClassLabel<T extends { scheduled_class_id?: string | null }>(
  row: T,
): Promise<T & { scheduled_class?: ScheduledClassLabel }> {
  const [withLabel] = await attachClassLabels([row]);
  return withLabel;
}
