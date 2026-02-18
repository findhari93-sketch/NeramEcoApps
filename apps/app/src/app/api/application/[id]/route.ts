import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getApplicationById, deleteApplication } from '@neram/database/queries';
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/application/[id]
 *
 * Get a specific application by ID.
 * Requires authentication and ownership.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApplicationResponse>> {
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
    const application = await getApplicationById(supabase, id);

    if (!application) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (application.user_id !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: application });
  } catch (error) {
    console.error('Get application error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch application' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/application/[id]
 *
 * Soft delete an application.
 * Requires authentication and ownership.
 * Only draft and submitted applications can be deleted.
 *
 * Request body: { reason: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ApplicationResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'User requested deletion';

    const supabase = createAdminClient();
    const application = await getApplicationById(supabase, id);

    if (!application) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (application.user_id !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Check if application can be deleted
    const deletableStatuses = ['draft', 'submitted'];
    if (!deletableStatuses.includes(application.status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'This application cannot be deleted. Please contact support for assistance.',
        },
        { status: 400 }
      );
    }

    // Soft delete the application
    await deleteApplication(supabase, id, reason, 'user_requested', auth.userId);

    return NextResponse.json({
      success: true,
      data: { message: 'Application deleted successfully' },
    });
  } catch (error) {
    console.error('Delete application error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete application' },
      { status: 500 }
    );
  }
}
