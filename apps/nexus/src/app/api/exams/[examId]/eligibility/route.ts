import { NextRequest, NextResponse } from 'next/server';
import { loadExamEligibilityFacts } from '@neram/database';
import { requireExamStaff } from '@/lib/exam-access';
import { buildExamEligibilityRoster, summariseEligibilityRoster } from '@/lib/exam-eligibility-roster';

/**
 * GET /api/exams/[examId]/eligibility
 *
 * The live "who is this mandatory for" roster for an exam that already
 * exists, overrides included. Feeds EligibilityRosterPanel in ongoing
 * (non-preview) mode, and the classroom's invigilation roster (which folds
 * this into buildExamRoster so an excused student shows as `excused` rather
 * than `not_started`/`absent`).
 */
export async function GET(request: NextRequest, { params }: { params: { examId: string } }) {
  try {
    const access = await requireExamStaff(request.headers.get('Authorization'), params.examId);
    if (!access.ok) return access.response;

    const facts = await loadExamEligibilityFacts(params.examId, access.exam.classroom_id);
    const rows = buildExamEligibilityRoster(facts);

    return NextResponse.json({
      data: { covered_classes: facts.coveredClasses, rows, summary: summariseEligibilityRoster(rows) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Exam Eligibility API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
