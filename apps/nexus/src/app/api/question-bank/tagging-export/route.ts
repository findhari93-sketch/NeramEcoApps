import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { getUntaggedQuestionsPage, getTeacherQBQuestions } from '@neram/database';

/**
 * GET /api/question-bank/tagging-export   (teacher/admin)
 * Pages of {id, question_text, options} for the external-AI tagging assistant.
 * ?scope=untagged (default) walks active questions with no registry tags;
 * ?scope=filtered honors search / exam_relevance / tag_ids like the teacher list.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can export questions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') === 'filtered' ? 'filtered' : 'untagged';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('page_size') || '100', 10) || 100));

    if (scope === 'untagged') {
      const { questions, total } = await getUntaggedQuestionsPage(page, pageSize);
      return NextResponse.json({ data: { questions, total } });
    }

    const filters: Record<string, unknown> = { status: ['active'] };
    const search = searchParams.get('search');
    if (search) filters.search_text = search;
    const exam = searchParams.get('exam_relevance');
    if (exam) filters.exam_relevance = exam;
    const tagIds = searchParams.get('tag_ids');
    if (tagIds) filters.tag_ids = tagIds.split(',').filter(Boolean);

    const { questions, total } = await getTeacherQBQuestions(filters as any, page, pageSize);
    return NextResponse.json({
      data: {
        questions: questions.map((q) => ({ id: q.id, question_text: q.question_text, options: q.options })),
        total,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export questions';
    console.error('QB tagging-export error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
