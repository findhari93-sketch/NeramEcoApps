import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  listExamRecallThreads,
  createExamRecallThread,
} from '@neram/database/queries';

/**
 * GET /api/exam-recall/threads?classroom_id=...&exam_date=...&session_number=...&section=...&topic_category=...&status=...&question_type=...&search=...&page=1&pageSize=20
 *
 * List exam recall threads with pagination and filters.
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

    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = parseInt(params.get('pageSize') || '20', 10);
    const sessionNumber = params.get('session_number');

    const result = await listExamRecallThreads(
      {
        classroom_id: classroomId,
        exam_date: params.get('exam_date') || undefined,
        session_number: sessionNumber != null ? parseInt(sessionNumber, 10) : undefined,
        section: (params.get('section') as any) || undefined,
        topic_category: (params.get('topic_category') as any) || undefined,
        status: (params.get('status') as any) || undefined,
        question_type: (params.get('question_type') as any) || undefined,
        search: params.get('search') || undefined,
      },
      user.id,
      page,
      pageSize,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list exam recall threads';
    console.error('[exam-recall/threads] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/exam-recall/threads
 *
 * Create a new exam recall thread with its first version.
 * Body: { classroom_id, exam_year, exam_date, session_number, question_type, section, topic_category?, has_image?, initial_version: {...} }
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
      question_type,
      section,
      topic_category,
      has_image,
      initial_version,
    } = body;

    if (!classroom_id || !exam_year || !exam_date || session_number == null || !question_type || !section) {
      return NextResponse.json(
        { error: 'Missing required fields: classroom_id, exam_year, exam_date, session_number, question_type, section' },
        { status: 400 },
      );
    }

    if (!initial_version?.recall_text || !initial_version?.clarity) {
      return NextResponse.json(
        { error: 'Missing required initial_version fields: recall_text, clarity' },
        { status: 400 },
      );
    }

    // Determine author_role from user_type
    const authorRoleMap: Record<string, string> = {
      student: 'student',
      teacher: 'teacher',
      admin: 'admin',
    };
    const authorRole = authorRoleMap[user.user_type ?? ''] || 'student';

    const result = await createExamRecallThread({
      classroom_id,
      exam_year,
      exam_date,
      session_number,
      question_type,
      section,
      topic_category: topic_category || null,
      has_image: has_image || false,
      created_by: user.id,
      initial_version: {
        ...initial_version,
        author_role: authorRole as any,
      },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create exam recall thread';
    console.error('[exam-recall/threads] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
