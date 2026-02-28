/**
 * GET /api/onboarding/prefill
 * Get pre-fill data from user's onboarding responses mapped to application form fields
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getSupabaseAdminClient, getOnboardingPrefillData } from '@neram/database';

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

export async function GET(req: NextRequest) {
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
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const prefillData = await getOnboardingPrefillData(user.id, adminClient);

    return NextResponse.json({ prefill: prefillData });
  } catch (error) {
    console.error('Error fetching onboarding prefill:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
