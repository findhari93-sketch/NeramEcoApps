import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import {
  getApplicationById,
  updateApplication,
  deleteApplication,
  type UpdateApplicationInput,
} from '@neram/database/queries';
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
    // App might already be initialized
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
async function verifyToken(request: NextRequest): Promise<{ userId: string; email: string | null } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await getAuth().verifyIdToken(token);

    const supabase = createAdminClient();
    const { data: user } = await (supabase
      .from('users') as any)
      .select('id, email')
      .eq('firebase_uid', decodedToken.uid)
      .single() as { data: { id: string; email: string | null } | null };

    if (!user) {
      return null;
    }

    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

/**
 * GET /api/application/[id]
 *
 * Get a specific application by ID.
 * User can only access their own applications.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApplicationResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
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
        { success: false, error: 'Access denied' },
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
 * PATCH /api/application/[id]
 *
 * Update a specific application.
 * User can only update their own applications in draft or submitted status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApplicationResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
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
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if application can be edited
    const editableStatuses = ['draft', 'submitted'];
    if (!editableStatuses.includes(application.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Applications with status '${application.status}' cannot be edited. Please contact support.`,
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Prepare update data (exclude sensitive fields)
    const updateData: UpdateApplicationInput = {
      father_name: body.father_name,
      country: body.country,
      city: body.city,
      state: body.state,
      district: body.district,
      pincode: body.pincode,
      address: body.address,
      latitude: body.latitude,
      longitude: body.longitude,
      location_source: body.location_source,
      applicant_category: body.applicant_category,
      academic_data: body.academic_data,
      caste_category: body.caste_category,
      target_exam_year: body.target_exam_year,
      interest_course: body.interest_course,
      selected_course_id: body.selected_course_id,
      selected_center_id: body.selected_center_id,
      hybrid_learning_accepted: body.hybrid_learning_accepted,
    };

    // Remove undefined values
    Object.keys(updateData).forEach((key) => {
      if (updateData[key as keyof UpdateApplicationInput] === undefined) {
        delete updateData[key as keyof UpdateApplicationInput];
      }
    });

    const updated = await updateApplication(supabase, id, updateData);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update application error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update application' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/application/[id]
 *
 * Soft delete an application with a reason.
 * User can only delete their own applications.
 *
 * Request body:
 * - reason: string (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApplicationResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
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
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Check if already deleted
    if (application.status === 'deleted') {
      return NextResponse.json(
        { success: false, error: 'Application is already deleted' },
        { status: 400 }
      );
    }

    // Get deletion reason from body
    let reason = 'User requested deletion';
    try {
      const body = await request.json();
      if (body.reason) {
        reason = body.reason;
      }
    } catch {
      // Body might be empty, use default reason
    }

    await deleteApplication(supabase, id, reason, 'user_requested');

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
