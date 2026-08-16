import { NextRequest, NextResponse } from 'next/server';
import { setExamEligibilityOverride } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * POST /api/exams/[examId]/eligibility-override/bulk
 * body { student_ids: string[], override: 'mandatory' | 'excused', note? }
 *
 * Backs the roster panel's checkbox-select + sticky action bar: "Force
 * mandatory (n)" / "Excuse (n)" on a multi-selection, rather than making a
 * teacher tap into each row for the common case of clearing a whole
 * still-catching-up group at once.
 */
export async function POST(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => ({}));
    const studentIds: string[] = Array.isArray(body?.student_ids)
      ? body.student_ids.filter((x: unknown) => typeof x === 'string')
      : [];
    const override = body?.override === 'mandatory' || body?.override === 'excused' ? body.override : null;
    if (studentIds.length === 0) return NextResponse.json({ error: 'Pick at least one student' }, { status: 400 });
    if (!override) return NextResponse.json({ error: 'override must be "mandatory" or "excused"' }, { status: 400 });

    const note = typeof body?.note === 'string' ? body.note : null;

    // One student's failure must not stop the rest of the batch.
    const results = await Promise.allSettled(
      studentIds.map((studentId) =>
        setExamEligibilityOverride(params.examId, studentId, override, note, access.caller.id),
      ),
    );
    const succeeded = studentIds.filter((_, i) => results[i].status === 'fulfilled');
    const failed = studentIds.filter((_, i) => results[i].status === 'rejected');

    if (succeeded.length > 0) {
      try {
        const subject =
          override === 'mandatory'
            ? `${access.exam.title || 'A test'} is required for you`
            : `You are excused from ${access.exam.title || 'this test'}`;
        const plain =
          override === 'mandatory'
            ? `Your teacher has marked ${access.exam.title || 'this test'} as required for you.`
            : `Your teacher has excused you from ${access.exam.title || 'this test'}.`;
        await sendNudge({
          studentIds: succeeded,
          subject,
          plain,
          eventType: 'exam_eligibility_override_set',
          metadata: { exam_id: params.examId, override },
        });
      } catch (err) {
        console.error('[Exam Eligibility Bulk Override API] could not notify students:', err);
      }
    }

    return NextResponse.json({ data: { updated: succeeded, failed } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Eligibility Bulk Override API] Error:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
