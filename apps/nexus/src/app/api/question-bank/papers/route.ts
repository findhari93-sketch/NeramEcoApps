import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  listOriginalPapers,
  listOriginalPapersWithBreakdown,
  getOrCreateOriginalPaper,
  bulkCreateDraftQuestions,
} from '@neram/database';
import type { QBExamType, QBShift, NTAParsedQuestion } from '@neram/database';

import { describeError } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    // The management list needs per paper counts; the hub does not. Opt in, so
    // the cheaper callers keep the cheaper query.
    const withBreakdown = request.nextUrl.searchParams.get('breakdown') === '1';
    const papers = withBreakdown
      ? await listOriginalPapersWithBreakdown()
      : await listOriginalPapers();
    return NextResponse.json({ data: papers }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Papers API] GET Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const caller = access.caller;

    const body = await request.json();
    const { exam_type, year, session, shift, parsed_questions } = body as {
      exam_type: QBExamType;
      year: number;
      session: string | null;
      shift?: QBShift | null;
      parsed_questions: NTAParsedQuestion[];
    };

    if (!exam_type || !year || !parsed_questions?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get or create paper (handles duplicate detection)
    const { paper, isNew } = await getOrCreateOriginalPaper(
      exam_type, year, session, caller.id, shift || null
    );

    if (!isNew) {
      return NextResponse.json({
        data: paper,
        message: 'Paper already exists',
        isNew: false,
      }, { status: 200 });
    }

    // Bulk create the questions.
    //
    // "as drafts" is no longer the whole story: a JSON carrying answers lands
    // its questions answer_keyed, so the message reports what actually
    // happened rather than sending a teacher off to an answer-key screen they
    // no longer need.
    const { created, withAnswers } = await bulkCreateDraftQuestions(
      paper.id, exam_type, year, session, parsed_questions, caller.id, shift || null
    );

    return NextResponse.json({
      data: { ...paper, questions_parsed: created, questions_with_answers: withAnswers },
      message: withAnswers
        ? `${created} questions imported, ${withAnswers} with answers`
        : `${created} questions imported as drafts`,
      isNew: true,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Papers API] POST Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
