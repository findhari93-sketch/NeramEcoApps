// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, markOnboardingStepComplete } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {}
}

async function verifyToken(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.substring(7));
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    return user ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

// PATCH /api/onboarding-steps/[progressId] - Student marks a step as complete
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ progressId: string }> }
) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { progressId } = await params;
    const supabase = createAdminClient();

    // Verify this progress row belongs to this user
    const { data: progress } = await supabase
      .from('student_onboarding_progress')
      .select('id, user_id')
      .eq('id', progressId)
      .single();

    if (!progress || progress.user_id !== auth.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await markOnboardingStepComplete(
      progressId,
      'student',
      auth.userId,
      supabase
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error marking step complete:', error);
    return NextResponse.json(
      { error: 'Failed to update step' },
      { status: 500 }
    );
  }
}
