import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  listOriginalPapers,
  listOriginalPapersWithBreakdown,
  getOrCreateOriginalPaper,
  bulkCreateDraftQuestions,
} from '@neram/database';
import type { QBExamType, QBShift, NTAParsedQuestion } from '@neram/database';

import { describeError } from '@/lib/api-errors';
import { countPaperSolutions } from '@/lib/qb-paper-solutions';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    // The management list needs per paper counts; the hub does not. Opt in, so
    // the cheaper callers keep the cheaper query.
    const withBreakdown = request.nextUrl.searchParams.get('breakdown') === '1';
    // The exam pages' to-do list also needs solution counts, which cost two
    // more reads, so that is a second opt-in on top of the breakdown.
    const withSolutions = request.nextUrl.searchParams.get('solutions') === '1';
    const papers = withBreakdown || withSolutions
      ? await listOriginalPapersWithBreakdown()
      : await listOriginalPapers();

    if (!withSolutions) return NextResponse.json({ data: papers }, { status: 200 });

    const counts = await countPaperSolutions(
      papers.map((p) => p.id),
      getSupabaseAdminClient(),
    );
    const data = papers.map((p) => {
      const c = counts.get(p.id);
      return { ...p, solvable_count: c?.solvable ?? 0, solution_count: c?.solved ?? 0 };
    });
    return NextResponse.json({ data }, { status: 200 });
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
