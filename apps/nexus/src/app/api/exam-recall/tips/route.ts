import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  listExamRecallTips,
  createExamRecallTip,
} from '@neram/database/queries';

/**
 * GET /api/exam-recall/tips?classroom_id=...&exam_date=...
 *
 * List exam recall tips, ordered by upvotes.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id parameter' }, { status: 400 });
    }

    const examDate = params.get('exam_date') || undefined;

    const tips = await listExamRecallTips(classroomId, examDate);

    return NextResponse.json({ tips });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list tips';
    console.error('[exam-recall/tips] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/exam-recall/tips
 *
 * Create an exam recall tip.
 * Body: { classroom_id, exam_year, exam_date, session_number, insights_text, topic_distribution?, difficulty?, time_pressure? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      classroom_id,
      exam_year,
      exam_date,
      session_number,
      insights_text,
      topic_distribution,
      difficulty,
      time_pressure,
    } = body;

    if (!classroom_id || !exam_year || !exam_date || session_number == null || !insights_text) {
      return NextResponse.json(
        { error: 'Missing required fields: classroom_id, exam_year, exam_date, session_number, insights_text' },
        { status: 400 },
      );
    }

    const tip = await createExamRecallTip({
      user_id: user.id,
      classroom_id,
      exam_year,
      exam_date,
      session_number,
      insights_text,
      topic_distribution: topic_distribution || null,
      difficulty: difficulty || null,
      time_pressure: time_pressure || null,
    } as any);

    return NextResponse.json(tip, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create tip';
    console.error('[exam-recall/tips] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
