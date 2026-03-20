import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { createQBReport } from '@neram/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { report_type, description, classroom_id } = body;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroom_id || null);
    if (!access.ok) return access.response;
    const caller = access.caller;

    if (!report_type) {
      return NextResponse.json({ error: 'report_type is required' }, { status: 400 });
    }

    const validTypes = ['wrong_answer', 'no_correct_option', 'question_error', 'missing_solution', 'unclear_question', 'other'];
    if (!validTypes.includes(report_type)) {
      return NextResponse.json({ error: `Invalid report_type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const { id: questionId } = await params;

    const report = await createQBReport({
      question_id: questionId,
      student_id: caller.id,
      report_type,
      description: description || undefined,
    });

    return NextResponse.json({ data: report }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Report creation error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
