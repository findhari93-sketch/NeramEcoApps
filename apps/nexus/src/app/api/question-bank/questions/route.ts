import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  getQBQuestions,
  getTeacherQBQuestions,
  createQBQuestion,
  addQuestionSource,
} from '@neram/database';
import type { QBQuestionStatus } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const classroomId = params.get('classroom_id') || null;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;
    const caller = access.caller;

    const page = params.get('page') ? parseInt(params.get('page')!, 10) : 1;
    const pageSize = params.get('page_size') ? parseInt(params.get('page_size')!, 10) : 20;

    const solutionFilter = params.get('solution_filter') || undefined;

    const filters: import('@neram/database').QBFilterState = {
      exam_relevance: (params.get('exam_relevance') as any) || undefined,
      exam_years: params.get('years') ? params.get('years')!.split(',').map(Number) : undefined,
      categories: params.get('categories') ? params.get('categories')!.split(',') : undefined,
      difficulty: params.get('difficulty') ? params.get('difficulty')!.split(',') as any : undefined,
      question_format: params.get('format') ? params.get('format')!.split(',') as any : undefined,
      attempt_status: (params.get('status') as any) || undefined,
      search_text: params.get('search') || undefined,
      topic_ids: params.get('topic_ids') ? params.get('topic_ids')!.split(',') : undefined,
      // Source-based filters from exam sidebar
      exam_type: (params.get('exam_type') as any) || undefined,
      source_year: params.get('year') ? parseInt(params.get('year')!, 10) : undefined,
      source_session: params.get('session') || undefined,
      // Solution filter
      solution_filter: solutionFilter as any,
    };

    // Teachers see all statuses; students only see active questions
    const isTeacher = ['teacher', 'admin'].includes(caller.user_type ?? '');
    let data;
    if (isTeacher) {
      const statusFilter = params.get('question_status')
        ? params.get('question_status')!.split(',') as QBQuestionStatus[]
        : undefined;
      data = await getTeacherQBQuestions({ ...filters, status: statusFilter }, page, pageSize);
    } else {
      data = await getQBQuestions(filters, page, pageSize, caller.id);
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
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
    const { sources, ...questionData } = body;

    // Create the question
    const question = await createQBQuestion({
      ...questionData,
      created_by: caller.id,
    });

    // Add sources if provided
    if (sources && Array.isArray(sources) && sources.length > 0) {
      for (const source of sources) {
        await addQuestionSource({
          question_id: question.id,
          ...source,
        });
      }
    }

    return NextResponse.json({ data: question }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
