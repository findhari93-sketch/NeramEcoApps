// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
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

// PATCH /api/onboarding-steps/[progressId] - Update step status
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
    const body = await request.json();
    const { status } = body;
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

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (status === 'completed') {
      updateData.is_completed = true;
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by_type = 'student';
      updateData.completed_by_user_id = auth.userId;
      updateData.status = 'completed';
    } else if (status === 'need_help') {
      updateData.status = 'need_help';
    } else if (status === 'in_progress') {
      updateData.status = 'in_progress';
    } else if (status === 'pending') {
      updateData.is_completed = false;
      updateData.completed_at = null;
      updateData.completed_by_type = null;
      updateData.completed_by_user_id = null;
      updateData.status = 'pending';
    } else {
      // Legacy toggle: mark as complete (backward compatible)
      updateData.is_completed = true;
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by_type = 'student';
      updateData.completed_by_user_id = auth.userId;
      updateData.status = 'completed';
    }

    const { data: updated, error } = await supabase
      .from('student_onboarding_progress')
      .update(updateData)
      .eq('id', progressId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    return NextResponse.json(
      { error: 'Failed to update step' },
      { status: 500 }
    );
  }
}
