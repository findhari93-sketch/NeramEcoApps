import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { verifyQBAccess } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  getQBQuestions,
  getTeacherQBQuestions,
  getBankQuestionAccuracy,
  createQBQuestion,
  addQuestionSource,
  syncTagsForNewQuestion,
  setQuestionTags,
} from '@neram/database';
import type { QBQuestionStatus } from '@neram/database';

import { describeError } from '@/lib/api-errors';

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

    // page_size was uncapped, and the Select-All path asked for 1000 rows to read
    // nothing but the ids off them: roughly 6.5MB of JSON over a phone connection
    // to build a list of UUIDs. Callers that want every matching id ask for
    // fields=id instead, which is answered from the same query without the bodies.
    const idsOnly = params.get('fields') === 'id';
    const MAX_PAGE_SIZE = 100;
    const MAX_ID_PAGE_SIZE = 5000;
    const requestedPageSize = params.get('page_size')
      ? parseInt(params.get('page_size')!, 10)
      : 20;
    const ceiling = idsOnly ? MAX_ID_PAGE_SIZE : MAX_PAGE_SIZE;
    const pageSize = Math.min(
      Math.max(Number.isFinite(requestedPageSize) ? requestedPageSize : 20, 1),
      ceiling,
    );

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
    // Three names existed for one concept: the teacher page sent `search`, this
    // route read `search_text`, and the student page's shareable URL used `q`.
    // Accept all three so a link copied from either page keeps working.
    const searchParam = first('search_text', 'search', 'q');
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
      // The paper detail screen has always put shift in the practice link and
      // nothing has ever read it, so a forenoon/afternoon paper practised both
      // sittings at once. resolvePaperSourceIds has handled source_shift the
      // whole time; it was simply never given one.
      source_shift: (params.get('shift') as any) || undefined,
      // Set by the paper detail breakdown, so "Aptitude 1/30" opens those thirty.
      section: params.get('section') ? (params.get('section')!.split(',') as any) : undefined,
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
    let accuracy: Record<string, { answered: number; correct: number }> | undefined;
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
      // The same opt-in carries "% of students got it right", the measured
      // replacement for the hand-set difficulty nobody filled in. Best effort:
      // a failure here drops the chip, never the page of questions.
      if (includeUsage && !idsOnly && data.questions.length > 0) {
        try {
          const map = await getBankQuestionAccuracy(data.questions.map((q: { id: string }) => q.id));
          accuracy = Object.fromEntries(map);
        } catch (accErr) {
          console.error('[QB API] accuracy skipped:', describeError(accErr));
        }
      }
    } else {
      data = await getQBQuestions(filters, page, pageSize, caller.id);
    }

    // Select-All only ever reads q.id off this response. Shedding the bodies
    // here keeps the same filter semantics without shipping the questions.
    if (idsOnly) {
      return NextResponse.json(
        {
          data: {
            question_ids: (data.questions || []).map((q: { id: string }) => q.id),
            total: data.total,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ data: accuracy ? { ...data, accuracy } : data }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[QB API] Error:', describeError(err));
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
    console.error('[QB API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
