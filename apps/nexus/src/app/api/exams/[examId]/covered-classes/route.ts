import { NextRequest, NextResponse } from 'next/server';
import { linkExamToClasses, listCoveredClasses } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';

/**
 * PATCH /api/exams/[examId]/covered-classes
 * body { scheduled_class_ids: string[] }
 *
 * Edit what an exam covers after it was scheduled. Locked once results have
 * moved off 'unpublished', same guard updateExam already uses for the paper
 * and the window -- changing what a test is meant to cover after results
 * exist would retroactively change who was ever mandatory for it.
 */
export async function PATCH(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    if (access.exam.results_state !== 'unpublished') {
      return NextResponse.json(
        { error: 'Results are already published. Unpublish before changing what this exam covers.' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const scheduledClassIds: string[] = Array.isArray(body?.scheduled_class_ids)
      ? body.scheduled_class_ids.filter((x: unknown) => typeof x === 'string')
      : [];

    await linkExamToClasses(params.examId, access.exam.classroom_id, scheduledClassIds);
    const coveredClasses = await listCoveredClasses(params.examId);

    return NextResponse.json({ data: { covered_classes: coveredClasses } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Covered Classes API] Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
