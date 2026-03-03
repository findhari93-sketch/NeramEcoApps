export const dynamic = 'force-dynamic';

/**
 * Question Bank API - Session Tracking
 *
 * GET  /api/questions/[id]/sessions  — List all session reports
 * POST /api/questions/[id]/sessions  — Report "I got this question too"
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getQuestionSessions,
  createQuestionSession,
} from '@neram/database';

async function requireAuth(
  req: NextRequest,
): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const dbUser = await getUserByFirebaseUid(decoded.uid, adminClient);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return { userId: dbUser.id };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const adminClient = getSupabaseAdminClient();
    const sessions = await getQuestionSessions(id, adminClient);
    return NextResponse.json({ data: sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json();
    const { examYear, examDate, sessionLabel } = body;

    if (!examYear || typeof examYear !== 'number') {
      return NextResponse.json({ error: 'Exam year is required' }, { status: 400 });
    }

    const adminClient = getSupabaseAdminClient();
    const session = await createQuestionSession(auth.userId, {
      question_id: id,
      exam_year: examYear,
      exam_date: examDate || undefined,
      session_label: sessionLabel || undefined,
    }, adminClient);

    return NextResponse.json({ data: session }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create session';
    const status = message.includes('already reported') ? 409 : 500;
    console.error('Error creating session:', error);
    return NextResponse.json({ error: message }, { status });
  }
}