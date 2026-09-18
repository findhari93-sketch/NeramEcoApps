import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { listExamDrawings } from '@neram/database/queries/nexus';
import { requireExamStaff } from '@/lib/exam-access';

/**
 * GET /api/exams/[examId]/drawings   (staff)
 *
 * Every drawing on this exam, unmarked first, with the student's name, so the
 * results sheet can list what is left to mark and link each one to the review
 * screen. Test drawings used to be reachable only from the Drawing Reviews
 * queue, which is retired.
 */
export async function GET(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const rows = await listExamDrawings(params.examId);
    const ids = [...new Set(rows.map((r) => r.student_id))];
    const { data: people } = ids.length
      ? await getSupabaseAdminClient().from('users').select('id, name, avatar_url').in('id', ids)
      : { data: [] };
    const byId = new Map(
      ((people ?? []) as Array<{ id: string; name: string | null; avatar_url: string | null }>).map((p) => [p.id, p]),
    );

    const drawings = rows
      .map((r) => ({
        ...r,
        student_name: byId.get(r.student_id)?.name || 'Student',
        avatar_url: byId.get(r.student_id)?.avatar_url ?? null,
      }))
      .sort((a, b) => Number(a.awarded != null) - Number(b.awarded != null) || a.student_name.localeCompare(b.student_name));

    return NextResponse.json({ drawings }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load the drawings';
    console.error('[Exam drawings] GET failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
