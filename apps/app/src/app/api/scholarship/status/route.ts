import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getScholarshipByUserId } from '@neram/database/queries';
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

interface ScholarshipStatusResponse {
  success: boolean;
  data?: {
    scholarship: unknown | null;
    leadProfile: {
      scholarship_eligible: boolean;
      school_type: string | null;
    } | null;
  };
  error?: string;
}

/**
 * Verify Firebase ID token and get user ID
 */
async function verifyToken(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await getAuth().verifyIdToken(token);

    // Get user from database
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users' as any)
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single() as { data: { id: string } | null };

    if (!user) {
      return null;
    }

    return { userId: user.id };
  } catch {
    return null;
  }
}

/**
 * GET /api/scholarship/status
 *
 * Get scholarship status for the authenticated user.
 * Returns scholarship application (if any) and lead profile scholarship eligibility.
 *
 * Response:
 * - 200: { success: true, data: { scholarship, leadProfile } }
 * - 401: { success: false, error: 'Unauthorized' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function GET(request: NextRequest): Promise<NextResponse<ScholarshipStatusResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Please log in.' },
      { status: 401 }
    );
  }

  try {
    const supabase = createAdminClient();

    // Fetch scholarship application
    const scholarship = await getScholarshipByUserId(auth.userId, supabase);

    // Fetch lead profile for scholarship eligibility info
    const { data: leadProfile } = await supabase
      .from('lead_profiles' as any)
      .select('scholarship_eligible, school_type')
      .eq('user_id', auth.userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        scholarship,
        leadProfile: leadProfile
          ? {
              scholarship_eligible: leadProfile.scholarship_eligible ?? false,
              school_type: leadProfile.school_type ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Get scholarship status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch scholarship status.' },
      { status: 500 }
    );
  }
}
