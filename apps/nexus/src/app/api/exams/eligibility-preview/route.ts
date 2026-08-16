import { NextRequest, NextResponse } from 'next/server';
import { loadEligibilityFactsForPreview } from '@neram/database';
import { resolveExamCaller, isStaff } from '@/lib/exam-access';
import { buildExamEligibilityRoster, summariseEligibilityRoster } from '@/lib/exam-eligibility-roster';

/**
 * POST /api/exams/eligibility-preview
 * body { classroom_id, scheduled_class_ids: string[] }
 *
 * The "who is this mandatory for" preview inside ExamScheduleDialog, BEFORE
 * the exam exists -- so there is no exam_id to key overrides on yet. Once the
 * exam is actually created, GET /api/exams/[examId]/eligibility takes over
 * and additionally reflects any teacher overrides.
 */
export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveExamCaller(request.headers.get('Authorization'));
    if (!resolved.ok) return resolved.response;
    if (!isStaff(resolved.caller)) {
      return NextResponse.json({ error: 'Staff only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const classroomId = typeof body?.classroom_id === 'string' ? body.classroom_id : '';
    const scheduledClassIds: string[] = Array.isArray(body?.scheduled_class_ids)
      ? body.scheduled_class_ids.filter((x: unknown) => typeof x === 'string')
      : [];

    if (!classroomId) {
      return NextResponse.json({ error: 'classroom_id is required' }, { status: 400 });
    }

    const facts = await loadEligibilityFactsForPreview(classroomId, scheduledClassIds);
    const rows = buildExamEligibilityRoster({ ...facts, overrides: new Map() });

    return NextResponse.json({
      data: { covered_classes: facts.coveredClasses, rows, summary: summariseEligibilityRoster(rows) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Eligibility Preview API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
