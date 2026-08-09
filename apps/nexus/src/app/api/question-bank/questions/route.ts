import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  getQBQuestions,
  getTeacherQBQuestions,
  createQBQuestion,
  addQuestionSource,
  syncTagsForNewQuestion,
  setQuestionTags,
} from '@neram/database';
import type { QBQuestionStatus } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    // Both spellings, for the same reason the filter names below accept two: the
    // student builder sent `classroom` while this read `classroom_id`, so every
    // one of its requests was rejected as if no classroom had been named.
    const classroomId = params.get('classroom_id') || params.get('classroom') || null;

    // Verify QB access (enrollment + QB enabled for students)
    const access = await verifyQBAccess(request.headers.get('Authorization'), classroomId);
    if (!access.ok) return access.response;
    const caller = access.caller;

    const page = params.get('page') ? parseInt(params.get('page')!, 10) : 1;
    const pageSize = params.get('page_size') ? parseInt(params.get('page_size')!, 10) : 20;

    const solutionFilter = params.get('solution_filter') || undefined;

    // The student page sends the long names (question_format, search_text) while
    // the teacher page sends the short ones (format, search). Accept both: the
    // student's Format and Search filters silently did nothing for as long as
    // only the short names were read, and old bookmarked URLs use the short form.
    const first = (...names: string[]) => {
      for (const n of names) {
        const v = params.get(n);
        if (v) return v;
      }
      return null;
    };
    const formatParam = first('question_format', 'format');
    const searchParam = first('search_text', 'search');
    const attemptParam = first('attempt_status', 'status');

    const filters: import('@neram/database').QBFilterState = {
      exam_relevance: (params.get('exam_relevance') as any) || undefined,
      exam_years: params.get('years') ? params.get('years')!.split(',').map(Number) : undefined,
      categories: params.get('categories') ? params.get('categories')!.split(',') : undefined,
      tag_ids: params.get('tag_ids') ? params.get('tag_ids')!.split(',') : undefined,
      difficulty: params.get('difficulty') ? params.get('difficulty')!.split(',') as any : undefined,
      question_format: formatParam ? (formatParam.split(',') as any) : undefined,
      attempt_status: (attemptParam as any) || undefined,
      search_text: searchParam || undefined,
      topic_ids: params.get('topic_ids') ? params.get('topic_ids')!.split(',') : undefined,
      // Source-based filters from exam sidebar
      exam_type: (params.get('exam_type') as any) || undefined,
      source_year: params.get('year') ? parseInt(params.get('year')!, 10) : undefined,
      source_session: params.get('session') || undefined,
      // Solution filter
      solution_filter: solutionFilter as any,
      // Recalled paper filters
      confidence_tier: params.get('confidence_tier')
        ? params.get('confidence_tier')!.split(',').map(Number) as any
        : undefined,
      paper_source: (params.get('paper_source') as any) || undefined,
      origin: params.get('origin') ? (params.get('origin')!.split(',') as any) : undefined,
    };

    // Teachers see all statuses; students only see active questions
    const isTeacher = ['teacher', 'admin'].includes(caller.user_type ?? '');
    let data;
    if (isTeacher) {
      const statusFilter = params.get('question_status')
        ? params.get('question_status')!.split(',') as QBQuestionStatus[]
        : undefined;
      // Opt-in: the test wizard's picker wants the "used in N tests" chip, the
      // browse list does not and should not pay for the extra query.
      const includeUsage = params.get('include_usage') === '1';
      data = await getTeacherQBQuestions(
        { ...filters, status: statusFilter, includeUsage },
        page,
        pageSize,
      );
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
    const { sources, tag_ids, ...questionData } = body;

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

    // Tag write-through: explicit tag_ids if provided, else derive from categories + exam.
    if (Array.isArray(tag_ids) && tag_ids.length > 0) {
      await setQuestionTags(question.id, tag_ids, caller.id);
    } else {
      await syncTagsForNewQuestion(question.id, {
        categories: questionData.categories,
        examRelevance: questionData.exam_relevance,
        createdBy: caller.id,
      });
    }

    return NextResponse.json({ data: question }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
