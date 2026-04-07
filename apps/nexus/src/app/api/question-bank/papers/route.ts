import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  listOriginalPapers,
  getOrCreateOriginalPaper,
  bulkCreateDraftQuestions,
} from '@neram/database';
import type { QBExamType, QBShift, NTAParsedQuestion } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const papers = await listOriginalPapers();
    return NextResponse.json({ data: papers }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Papers API] GET Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    // Bulk create draft questions
    const { created } = await bulkCreateDraftQuestions(
      paper.id, exam_type, year, session, parsed_questions, caller.id, shift || null
    );

    return NextResponse.json({
      data: { ...paper, questions_parsed: created },
      message: `${created} questions imported as drafts`,
      isNew: true,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Papers API] POST Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
