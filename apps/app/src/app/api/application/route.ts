import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getApplicationsByUserId } from '@neram/database/queries';
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

interface ApplicationResponse {
  success: boolean;
  data?: unknown;
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
 * GET /api/application
 *
 * Get all applications for the authenticated user.
 * Requires authentication.
 *
 * Response:
 * - 200: { success: true, data: LeadProfile[] }
 * - 401: { success: false, error: 'Unauthorized' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function GET(request: NextRequest): Promise<NextResponse<ApplicationResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Please log in to view your applications.' },
      { status: 401 }
    );
  }

  try {
    const supabase = createAdminClient();
    const applications = await getApplicationsByUserId(supabase, auth.userId);

    return NextResponse.json({ success: true, data: applications });
  } catch (error) {
    console.error('Get applications error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch applications.' },
      { status: 500 }
    );
  }
}
