import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getSectionQuizQuestions,
  submitQuizAttempt,
} from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/sections/[id]/quiz
 *
 * Returns quiz questions for a section (without correct answers).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));
    const { id: sectionId } = await params;

    const questions = await getSectionQuizQuestions(sectionId, false);

    return NextResponse.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load quiz';
    console.error('Foundation quiz GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/foundation/sections/[id]/quiz
 *
 * Submit quiz answers and get graded result.
 * Body: { answers: { question_id: "a"|"b"|"c"|"d", ... } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id: sectionId } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    if (!body.answers || typeof body.answers !== 'object') {
      return NextResponse.json({ error: 'Missing answers object' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const result = await submitQuizAttempt(user.id, sectionId, body.answers);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit quiz';
    console.error('Foundation quiz POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
