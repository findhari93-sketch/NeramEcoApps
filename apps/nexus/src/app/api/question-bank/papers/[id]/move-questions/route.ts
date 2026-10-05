import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  isKnownQBExamType,
  isQBQuestionSection,
  moveQuestionsToPaper,
  Paper2BError,
  type QBMoveTarget,
} from '@neram/database';
import { describeError } from '@/lib/api-errors';

/**
 * Move questions from this paper to a paper in another question bank, for
 * questions uploaded into the wrong exam (B.Planning questions inside a B.Arch
 * paper, say).
 *
 * Body:
 *   question_ids: string[]
 *   target_paper_id?: string      a picked paper, any exam
 *   target_exam_type?: QBExamType the other JEE paper of the same sitting,
 *                                 created when missing
 *   section: QBQuestionSection | null   null keeps each question's own
 *
 * Staff only.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.question_ids)
      ? body.question_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Pick at least one question to move' }, { status: 400 });
    }

    let target: QBMoveTarget;
    if (typeof body?.target_paper_id === 'string' && body.target_paper_id) {
      target = { paperId: body.target_paper_id };
    } else if (isKnownQBExamType(body?.target_exam_type)) {
      target = { examType: body.target_exam_type };
    } else {
      return NextResponse.json({ error: 'Pick where to move them' }, { status: 400 });
    }

    const section = body?.section ?? null;
    if (section !== null && !isQBQuestionSection(section)) {
      return NextResponse.json({ error: 'Unknown section' }, { status: 400 });
    }

    const data = await moveQuestionsToPaper({
      sourcePaperId: params.id,
      questionIds: ids,
      target,
      section,
      callerId: access.caller.id,
    });
    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    if (err instanceof Paper2BError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[QB move questions API] Error:', describeError(err));
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
