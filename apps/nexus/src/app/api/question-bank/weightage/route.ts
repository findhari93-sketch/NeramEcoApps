import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import type { QBExamType } from '@neram/database';
import { getCachedQBWeightage } from '@/lib/qb-weightage-cache';
import { describeError } from '@/lib/api-errors';

// Inline rather than from lib/qb-exam-routes, which pulls in a client hook.
const EXAMS: readonly QBExamType[] = ['JEE_PAPER_2', 'NATA'];
const isExam = (v: string | null): v is QBExamType => !!v && (EXAMS as readonly string[]).includes(v);

/**
 * Chapter weightage counts for one exam: papers per year, section sizes, and
 * questions per chapter per year. The student page derives everything else
 * (shares, trends, the top 10) in lib/qb-weightage.ts.
 *
 * Same access rule as every other student QB read: enrolled in the classroom,
 * or staff.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const access = await verifyQBAccess(request.headers.get('Authorization'), params.get('classroom_id'));
    if (!access.ok) return access.response;

    const exam = params.get('exam');
    if (!isExam(exam)) {
      return NextResponse.json({ error: 'exam must be JEE_PAPER_2 or NATA' }, { status: 400 });
    }

    const data = await getCachedQBWeightage(exam);
    return NextResponse.json(
      { data },
      { status: 200, headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    console.error('[QB API] Weightage error:', describeError(err));
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
