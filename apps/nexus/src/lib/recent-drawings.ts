import { getSupabaseAdminClient } from '@neram/database';

/**
 * A student's most recent drawings, from every source (sketchbook, assignment,
 * question bank, exam), newest first. What a manager looks across to decide a
 * drawing level, and what the snapshot shows under the Drawing row.
 *
 * Lives in the nexus app rather than packages/database on purpose: a change to
 * the shared package redeploys all four apps, and only Nexus reads this.
 */

export interface RecentDrawing {
  id: string;
  studentId: string;
  /** thumbnail_url when the upload made one, else the original photo. */
  thumbUrl: string;
  imageUrl: string;
  submittedAt: string;
  sourceType: string;
}

interface Row {
  id: string;
  student_id: string;
  thumbnail_url: string | null;
  original_image_url: string | null;
  submitted_at: string;
  source_type: string;
}

const PAGE = 1000;

function toDrawing(row: Row): RecentDrawing | null {
  const imageUrl = row.original_image_url || row.thumbnail_url;
  if (!imageUrl) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    thumbUrl: row.thumbnail_url || imageUrl,
    imageUrl,
    submittedAt: row.submitted_at,
    sourceType: row.source_type,
  };
}

/**
 * The last `perStudent` drawings for each student, within `sinceDays`.
 *
 * Pages past PostgREST's 1,000-row cap instead of trusting one response: a busy
 * class can upload more than that in 90 days, and a silent cut would hide the
 * students whose rows sorted last.
 */
export async function loadRecentDrawings(
  studentIds: readonly string[],
  { perStudent, sinceDays }: { perStudent: number; sinceDays: number },
): Promise<Record<string, RecentDrawing[]>> {
  const out: Record<string, RecentDrawing[]> = {};
  if (studentIds.length === 0) return out;
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const supabase = getSupabaseAdminClient() as any;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('drawing_submissions')
      .select('id, student_id, thumbnail_url, original_image_url, submitted_at, source_type')
      .in('student_id', studentIds as string[])
      .gte('submitted_at', since)
      .order('submitted_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    for (const row of rows) {
      const list = (out[row.student_id] ??= []);
      if (list.length >= perStudent) continue;
      const drawing = toDrawing(row);
      if (drawing) list.push(drawing);
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** One student's last `limit` drawings, any age. For the snapshot. */
export async function loadStudentRecentDrawings(studentId: string, limit: number): Promise<RecentDrawing[]> {
  const { data, error } = await (getSupabaseAdminClient() as any)
    .from('drawing_submissions')
    .select('id, student_id, thumbnail_url, original_image_url, submitted_at, source_type')
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false })
    .limit(limit * 2);
  if (error) throw error;
  return ((data ?? []) as Row[])
    .map(toDrawing)
    .filter((d): d is RecentDrawing => d !== null)
    .slice(0, limit);
}
