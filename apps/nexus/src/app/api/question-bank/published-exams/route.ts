import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser } from '@/lib/study-materials';
import { describeError } from '@/lib/api-errors';

/**
 * GET /api/question-bank/published-exams
 *
 * Which exams have at least one paper published to students, so the student
 * sidebar can leave an exam out until there is something in it.
 *
 * Not scoped to a classroom: publishing a paper publishes it to every student.
 * Held for five minutes in the browser, since it changes only when a teacher
 * publishes the first paper of an exam.
 *
 * Replaces the old classroom-link route, which also answered a per-classroom
 * switch that Features could not see. See qb-auth.ts for why it was retired.
 */
export async function GET(request: NextRequest) {
  try {
    await getRequestUser(request.headers.get('Authorization'));
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    return message === 'User not found'
      ? NextResponse.json({ error: 'User not found' }, { status: 404 })
      : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // `as any`: the generated types predate is_student_visible (see qb-papers.ts).
    const { data, error } = await getSupabaseAdminClient()
      .from('nexus_qb_original_papers' as any)
      .select('exam_type')
      .eq('is_student_visible', true);
    if (error) throw error;

    const published_exams = Array.from(
      new Set(((data ?? []) as unknown as { exam_type: string }[]).map((p) => p.exam_type)),
    );

    return NextResponse.json(
      { data: { published_exams } },
      { status: 200, headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  } catch (err) {
    console.error('[QB API] published-exams:', describeError(err));
    return NextResponse.json({ error: 'Could not load the Question Bank exams' }, { status: 500 });
  }
}
