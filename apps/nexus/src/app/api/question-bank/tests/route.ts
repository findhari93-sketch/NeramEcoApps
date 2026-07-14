import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { composeTest, listRepositoryTests } from '@neram/database';

/**
 * GET /api/question-bank/tests   (teacher/admin)
 * List reusable repository tests (optionally only my own via ?mine=1).
 */
export async function GET(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can view the test repository' }, { status: 403 });
    }
    const mine = new URL(request.url).searchParams.get('mine') === '1';
    const tests = await listRepositoryTests(mine ? { createdBy: access.caller.id } : undefined);
    return NextResponse.json({ data: tests });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load tests';
    console.error('QB tests GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/question-bank/tests   (teacher/admin)
 * Compose a reusable repository test from bank questions.
 * Body: { title, question_ids[], marks?, timer_type?, duration_minutes?,
 *         per_question_seconds?, passing_marks?, shuffle?, is_published? }
 */
export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (!['teacher', 'admin'].includes(access.caller.user_type)) {
      return NextResponse.json({ error: 'Only teachers can build repository tests' }, { status: 403 });
    }

    const body = await request.json();
    const { title, question_ids, marks, timer_type, duration_minutes, per_question_seconds, passing_marks, shuffle, is_published } = body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!Array.isArray(question_ids) || question_ids.length === 0) {
      return NextResponse.json({ error: 'question_ids must be a non-empty array' }, { status: 400 });
    }

    const { id } = await composeTest({
      title,
      questionIds: question_ids,
      marks,
      timerType: timer_type,
      durationMinutes: duration_minutes,
      perQuestionSeconds: per_question_seconds,
      passingMarks: passing_marks ?? null,
      shuffle: Boolean(shuffle),
      isPublished: is_published ?? false,
      isRepository: true,
      createdBy: access.caller.id,
    });

    return NextResponse.json({ data: { test_id: id, question_count: question_ids.length } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create test';
    console.error('QB tests POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
