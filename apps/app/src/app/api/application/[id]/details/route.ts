export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {
    // App might already be initialized in another module
  }
}

async function verifyToken(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users' as any)
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single() as { data: { id: string } | null };

    if (!user) return null;
    return { userId: user.id };
  } catch {
    return null;
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/application/[id]/details
 *
 * Get full application details including related data
 * (source tracking, scholarship, cashback claims).
 * Used by the View Application dialog.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch lead profile with all columns
    const { data: application, error: appError } = await supabase
      .from('lead_profiles' as any)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (appError && appError.code !== 'PGRST116') throw appError;

    if (!application) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if ((application as any).user_id !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch related data in parallel
    const [sourceResult, scholarshipResult, cashbackResult] = await Promise.all([
      supabase
        .from('source_tracking' as any)
        .select('*')
        .eq('lead_profile_id', id)
        .maybeSingle(),
      supabase
        .from('scholarship_applications' as any)
        .select('*')
        .eq('lead_profile_id', id)
        .maybeSingle(),
      supabase
        .from('cashback_claims' as any)
        .select('*')
        .eq('lead_profile_id', id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        application,
        sourceTracking: sourceResult.data || null,
        scholarship: scholarshipResult.data || null,
        cashbackClaims: cashbackResult.data || [],
      },
    });
  } catch (error) {
    console.error('Get application details error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch application details' },
      { status: 500 }
    );
  }
}