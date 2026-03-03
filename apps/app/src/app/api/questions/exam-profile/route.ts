export const dynamic = 'force-dynamic';

/**
 * Question Bank API - Exam Profile
 *
 * GET  /api/questions/exam-profile  — Get current user's exam profile
 * POST /api/questions/exam-profile  — Create/update exam profile (onboarding)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getUserByFirebaseUid,
  getSupabaseAdminClient,
  getUserExamProfile,
  createExamProfile,
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

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const adminClient = getSupabaseAdminClient();
    const profile = await getUserExamProfile(auth.userId, adminClient);

    return NextResponse.json({ data: profile });
  } catch (error) {
    console.error('Error fetching exam profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { nataStatus, attemptCount, nextExamDate, planningYear, attempts } = body;

    if (!nataStatus || !['attempted', 'applied_waiting', 'planning_to_apply', 'not_interested'].includes(nataStatus)) {
      return NextResponse.json({ error: 'Valid NATA status is required' }, { status: 400 });
    }

    const adminClient = getSupabaseAdminClient();
    const profile = await createExamProfile(auth.userId, {
      nata_status: nataStatus,
      attempt_count: attemptCount || 0,
      next_exam_date: nextExamDate || undefined,
      planning_year: planningYear || undefined,
      attempts: attempts || [],
    }, adminClient);

    return NextResponse.json({ data: profile }, { status: 201 });
  } catch (error) {
    console.error('Error creating exam profile:', error);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }
}