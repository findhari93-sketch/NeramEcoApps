/**
 * POST /api/onboarding/skip
 * Mark onboarding as skipped for the user
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getSupabaseAdminClient,
  getUserByFirebaseUid,
  skipOnboarding,
} from '@neram/database';
import { notifyOnboardingSkipped } from '@neram/database';

export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();
    const user = await getUserByFirebaseUid(decodedToken.uid, adminClient);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { source_app } = await req.json().catch(() => ({ source_app: 'app' }));

    const session = await skipOnboarding(user.id, source_app || 'app', adminClient);

    // Fire skip notification
    try {
      await notifyOnboardingSkipped({
        userId: user.id,
        userName: user.name || user.email || 'Unknown',
        phone: user.phone || '',
      }, adminClient);
    } catch (err) {
      console.error('Skip notification error:', err);
    }

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Error skipping onboarding:', error);
    return NextResponse.json(
      { error: 'Failed to skip onboarding' },
      { status: 500 }
    );
  }
}
