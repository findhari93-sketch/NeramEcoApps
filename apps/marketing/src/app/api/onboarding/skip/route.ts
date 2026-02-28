/**
 * POST /api/onboarding/skip
 * Mark onboarding as skipped
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  getSupabaseAdminClient,
  skipOnboarding,
  notifyOnboardingSkipped,
} from '@neram/database';

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

    const { data: user } = await (adminClient
      .from('users') as any)
      .select('id, name, email, phone')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { source_app } = await req.json().catch(() => ({ source_app: 'marketing' }));

    const session = await skipOnboarding(user.id, source_app || 'marketing', adminClient);

    notifyOnboardingSkipped({
      userId: user.id,
      userName: user.name || user.email || 'Unknown',
      phone: user.phone || '',
    }, adminClient).catch(err => console.error('Skip notification error:', err));

    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error('Error skipping onboarding:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
