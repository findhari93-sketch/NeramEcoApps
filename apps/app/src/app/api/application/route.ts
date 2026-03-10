export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import {
  createApplication,
  getApplicationsByUserId,
  submitApplication,
  hasExistingApplication,
  deleteApplication,
  type CreateApplicationInput,
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

/**
 * POST /api/application
 *
 * Create or update an application (draft save or submission).
 * Requires authentication.
 */
export async function POST(request: NextRequest): Promise<NextResponse<ApplicationResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Please log in to submit an application.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Validate phone verification for final submission
    if (!body.phone_verified && body.status === 'submitted') {
      return NextResponse.json(
        { success: false, error: 'Phone verification is required to submit an application.' },
        { status: 400 }
      );
    }

    const isSubmitting = body.status === 'submitted';

    if (isSubmitting) {
      const requiredFields = ['applicant_category', 'interest_course'];
      const missingFields = requiredFields.filter((field) => !body[field]);
      if (missingFields.length > 0) {
        return NextResponse.json(
          { success: false, error: `Missing required fields: ${missingFields.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Sanitize enum values
    const VALID_APPLICANT_CATEGORIES = ['school_student', 'diploma_student', 'college_student', 'working_professional'];
    const APPLICANT_CATEGORY_MAP: Record<string, string> = {
      '8th': 'school_student', '9th': 'school_student', '10th': 'school_student',
      '11th': 'school_student', '12th': 'school_student',
      'college': 'college_student', 'working': 'working_professional',
    };
    const VALID_COURSE_TYPES = ['nata', 'jee_paper2', 'both', 'not_sure'];

    let sanitizedCategory = body.applicant_category;
    if (sanitizedCategory && !VALID_APPLICANT_CATEGORIES.includes(sanitizedCategory)) {
      sanitizedCategory = APPLICANT_CATEGORY_MAP[sanitizedCategory] || undefined;
    }

    let sanitizedCourse = body.interest_course;
    if (sanitizedCourse && !VALID_COURSE_TYPES.includes(sanitizedCourse)) {
      sanitizedCourse = undefined;
    }

    // Prepare application data
    const raw: CreateApplicationInput = {
      user_id: auth.userId,
      father_name: body.father_name,
      country: body.country || 'IN',
      city: body.city,
      state: body.state,
      district: body.district,
      pincode: body.pincode,
      address: body.address,
      latitude: body.latitude ? Number(body.latitude) : undefined,
      longitude: body.longitude ? Number(body.longitude) : undefined,
      location_source: body.location_source || undefined,
      applicant_category: sanitizedCategory,
      academic_data: body.academic_data,
      caste_category: body.caste_category || undefined,
      target_exam_year: body.target_exam_year ? Number(body.target_exam_year) : undefined,
      interest_course: sanitizedCourse,
      selected_course_id: body.selected_course_id || undefined,
      selected_center_id: body.selected_center_id || undefined,
      hybrid_learning_accepted: body.hybrid_learning_accepted || false,
      learning_mode: body.learning_mode || 'hybrid',
      school_type: body.school_type || undefined,
      status: isSubmitting ? 'submitted' : 'draft',
      phone_verified: body.phone_verified,
      phone_verified_at: body.phone_verified_at || undefined,
      source: 'app',
      utm_source: body.utm_source || undefined,
      utm_medium: body.utm_medium || undefined,
      utm_campaign: body.utm_campaign || undefined,
      referral_code: body.referral_code || undefined,
      form_step_completed: body.form_step_completed ? Number(body.form_step_completed) : undefined,
      detected_location: body.detected_location || undefined,
    };

    // Remove undefined keys
    const applicationData = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined)
    ) as CreateApplicationInput;

    // Check for existing application
    const hasExisting = await hasExistingApplication(supabase, auth.userId);
    let application;

    if (hasExisting) {
      const existing = await getApplicationsByUserId(supabase, auth.userId);
      const draftApplication = existing.find((a) => a.status === 'draft');

      if (draftApplication) {
        // Update existing draft
        const { data, error } = await (supabase
          .from('lead_profiles') as any)
          .update(applicationData)
          .eq('id', draftApplication.id)
          .select()
          .single();

        if (error) throw error;
        application = data;

        if (isSubmitting) {
          application = await submitApplication(supabase, draftApplication.id);
        }
      } else {
        // Create additional application
        application = await createApplication(supabase, applicationData);
        if (isSubmitting) {
          application = await submitApplication(supabase, application.id);
        }
      }
    } else {
      // Create new application
      application = await createApplication(supabase, applicationData);
      if (isSubmitting) {
        application = await submitApplication(supabase, application.id);
      }
    }

    // Update user's first_name if provided
    if (body.first_name) {
      await (supabase.from('users') as any).update({ first_name: body.first_name }).eq('id', auth.userId);
    }

    return NextResponse.json(
      { success: true, data: application },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[Application API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process application. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/application?id={applicationId}
 *
 * Soft-delete an application.
 * Requires authentication and ownership.
 * Only draft and submitted applications can be deleted.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<ApplicationResponse>> {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized.' },
      { status: 401 }
    );
  }

  const applicationId = request.nextUrl.searchParams.get('id');
  if (!applicationId) {
    return NextResponse.json(
      { success: false, error: 'Application ID is required.' },
      { status: 400 }
    );
  }

  try {
    const supabase = createAdminClient();

    // Verify ownership
    const { data: existing, error: fetchError } = await (supabase
      .from('lead_profiles') as any)
      .select('id, user_id, status')
      .eq('id', applicationId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: 'Application not found.' },
        { status: 404 }
      );
    }

    if (existing.user_id !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'You can only delete your own applications.' },
        { status: 403 }
      );
    }

    const deletableStatuses = ['draft', 'submitted'];
    if (!deletableStatuses.includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: 'This application cannot be deleted. Please contact support.' },
        { status: 400 }
      );
    }

    await deleteApplication(supabase, applicationId, 'User requested deletion', 'user_requested', auth.userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Application API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete application.' },
      { status: 500 }
    );
  }
}