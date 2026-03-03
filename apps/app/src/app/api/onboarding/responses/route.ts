export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/responses
 * Save batch onboarding responses and mark session as complete
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import {
  getSupabaseAdminClient,
  getUserByFirebaseUid,
  saveOnboardingResponses,
} from '@neram/database';
import { notifyOnboardingCompleted } from '@neram/database';

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

    const { responses, source_app } = await req.json();

    if (!Array.isArray(responses) || responses.length === 0) {
      return NextResponse.json(
        { error: 'Responses array is required' },
        { status: 400 }
      );
    }

    // Save responses and update session
    const result = await saveOnboardingResponses(
      {
        user_id: user.id,
        responses,
        source_app: source_app || 'app',
      },
      adminClient
    );

    // Extract key response values for notification
    const responseMap = new Map(
      responses.map((r: { question_id: string; response: any }) => [r.question_id, r.response])
    );

    // Fire notifications
    try {
      await notifyOnboardingCompleted({
        userId: user.id,
        userName: user.name || user.email || 'Unknown',
        phone: user.phone || '',
        sourceApp: source_app || 'app',
      }, adminClient);
    } catch (err) {
      console.error('Notification error:', err);
    }

    return NextResponse.json({
      success: true,
      session: result.session,
    });
  } catch (error) {
    console.error('Error saving onboarding responses:', error);
    return NextResponse.json(
      { error: 'Failed to save responses' },
      { status: 500 }
    );
  }
}