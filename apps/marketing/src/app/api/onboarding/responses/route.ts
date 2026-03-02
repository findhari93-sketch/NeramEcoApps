/**
 * POST /api/onboarding/responses
 * Save onboarding responses for authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  getSupabaseAdminClient,
  saveOnboardingResponses,
  notifyOnboardingCompleted,
} from '@neram/database';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {
    // Already initialized
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await getAuth().verifyIdToken(token);
    const adminClient = getSupabaseAdminClient();

    // Look up user
    const { data: user } = await (adminClient
      .from('users') as any)
      .select('id, name, email, phone')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { responses, source_app } = await req.json();

    if (!Array.isArray(responses) || responses.length === 0) {
      return NextResponse.json({ error: 'Responses required' }, { status: 400 });
    }

    const result = await saveOnboardingResponses(
      {
        user_id: user.id,
        responses,
        source_app: source_app || 'marketing',
      },
      adminClient
    );

    // Fire notifications
    try {
      await notifyOnboardingCompleted({
        userId: user.id,
        userName: user.name || user.email || 'Unknown',
        phone: user.phone || '',
        sourceApp: source_app || 'marketing',
      }, adminClient);
    } catch (err) {
      console.error('Notification error:', err);
    }

    return NextResponse.json({ success: true, session: result.session });
  } catch (error) {
    console.error('Error saving onboarding responses:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
