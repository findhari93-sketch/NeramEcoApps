import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  listTopicDumps,
  createTopicDump,
} from '@neram/database/queries';

/**
 * GET /api/exam-recall/topic-dumps?classroom_id=...&exam_date=...&session_number=...
 *
 * List topic dumps for a session.
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
    const examDate = params.get('exam_date');
    const sessionNumber = params.get('session_number');

    if (!classroomId || !examDate || sessionNumber == null) {
      return NextResponse.json(
        { error: 'Missing required params: classroom_id, exam_date, session_number' },
        { status: 400 },
      );
    }

    const dumps = await listTopicDumps(classroomId, examDate, parseInt(sessionNumber, 10));

    return NextResponse.json({ topic_dumps: dumps });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list topic dumps';
    console.error('[exam-recall/topic-dumps] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/exam-recall/topic-dumps
 *
 * Create a topic dump.
 * Body: { classroom_id, exam_year, exam_date, session_number, topic_category, estimated_count?, brief_details? }
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
      topic_category,
      estimated_count,
      brief_details,
    } = body;

    if (!classroom_id || !exam_year || !exam_date || session_number == null || !topic_category) {
      return NextResponse.json(
        { error: 'Missing required fields: classroom_id, exam_year, exam_date, session_number, topic_category' },
        { status: 400 },
      );
    }

    const dump = await createTopicDump({
      user_id: user.id,
      classroom_id,
      exam_year,
      exam_date,
      session_number,
      topic_category,
      estimated_count: estimated_count ?? null,
      brief_details: brief_details || null,
    });

    return NextResponse.json(dump, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create topic dump';
    console.error('[exam-recall/topic-dumps] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
