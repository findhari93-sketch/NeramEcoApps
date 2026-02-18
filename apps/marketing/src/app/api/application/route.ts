import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, sendTemplateEmail, notifyNewApplication } from '@neram/database';
import {
  createApplication,
  getApplicationsByUserId,
  submitApplication,
  hasExistingApplication,
  type CreateApplicationInput,
} from '@neram/database/queries';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
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

// Course type labels
const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both NATA & JEE Paper 2',
  not_sure: 'Not Sure Yet',
};

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  school_student: 'School Student',
  diploma_student: 'Diploma Student',
  college_student: 'College Student',
  working_professional: 'Working Professional',
};

/**
 * Send confirmation emails after successful submission
 */
async function sendSubmissionEmails(
  application: any,
  userEmail: string,
  userName: string
): Promise<void> {
  try {
    const courseLabel = COURSE_LABELS[application.interest_course] || application.interest_course;
    const categoryLabel = CATEGORY_LABELS[application.applicant_category] || application.applicant_category;
    const location = [application.city, application.state].filter(Boolean).join(', ') || 'Not provided';
    const submittedAt = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });

    // Get academic info summary
    let academicInfo = '';
    if (application.academic_data) {
      const data = application.academic_data;
      if (data.school_name) academicInfo += `School: ${data.school_name}<br>`;
      if (data.college_name) academicInfo += `College: ${data.college_name}<br>`;
      if (data.current_class) academicInfo += `Class: ${data.current_class}<br>`;
      if (data.board) academicInfo += `Board: ${data.board}<br>`;
      if (data.department) academicInfo += `Department: ${data.department}<br>`;
    }

    // Send user confirmation email
    await sendTemplateEmail(userEmail, 'application-confirmation', {
      name: userName,
      applicationNumber: application.application_number || 'NERAM-PENDING',
      course: courseLabel,
      category: categoryLabel,
      targetYear: application.target_exam_year?.toString() || 'Not specified',
      phone: application.phone_verified ? '+91 XXXXXXXXXX (Verified)' : 'Not verified',
      location,
    });

    // Send admin notification email
    await sendTemplateEmail(process.env.ADMIN_EMAIL || 'admin@neramclasses.com', 'admin-application-notification', {
      applicationNumber: application.application_number || 'PENDING',
      applicationId: application.id,
      name: userName,
      fatherName: application.father_name || '',
      email: userEmail,
      phone: '+91 ' + (application.phone || 'N/A'),
      phoneVerified: application.phone_verified || false,
      course: courseLabel,
      category: categoryLabel,
      targetYear: application.target_exam_year?.toString() || 'N/A',
      location,
      hybridLearning: application.hybrid_learning_accepted || false,
      learningMode: application.learning_mode || 'hybrid',
      center: application.selected_center_id ? 'Center Selected' : null,
      source: application.source || 'website_form',
      utmSource: application.utm_source || null,
      submittedAt,
      academicInfo,
    });

    console.log('Submission emails sent successfully');
  } catch (error) {
    // Log error but don't fail the submission
    console.error('Failed to send submission emails:', error);
  }
}

/**
 * Verify Firebase ID token and get user ID
 */
async function verifyToken(request: NextRequest): Promise<{ userId: string; email: string | null; name: string | null; phone: string | null } | null> {
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
      .select('id, email, first_name, last_name, phone')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    if (!user) {
      return null;
    }

    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
    return { userId: user.id, email: user.email, name, phone: user.phone };
  } catch {
    return null;
  }
}

/**
 * POST /api/application
 *
 * Create or update an application.
 * Requires authentication.
 *
 * Request body: CreateApplicationInput
 *
 * Response:
 * - 201: { success: true, data: LeadProfile }
 * - 400: { success: false, error: 'Validation error' }
 * - 401: { success: false, error: 'Unauthorized' }
 * - 500: { success: false, error: 'Internal error' }
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

    // Validate required fields
    if (!body.phone_verified) {
      return NextResponse.json(
        { success: false, error: 'Phone verification is required to submit an application.' },
        { status: 400 }
      );
    }

    // Check if user wants to submit (status = 'submitted') or save draft
    const isSubmitting = body.status === 'submitted';

    if (isSubmitting) {
      // Validate required fields for submission
      const requiredFields = ['applicant_category', 'interest_course'];
      const missingFields = requiredFields.filter((field) => !body[field]);

      if (missingFields.length > 0) {
        return NextResponse.json(
          { success: false, error: `Missing required fields: ${missingFields.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Sanitize enum values that may come from onboarding with different value sets
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

    // Prepare application data — strip undefined values and sanitize UUIDs
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
      source: 'website_form',
      utm_source: body.utm_source || undefined,
      utm_medium: body.utm_medium || undefined,
      utm_campaign: body.utm_campaign || undefined,
      referral_code: body.referral_code || undefined,
    };

    // Remove undefined keys so they aren't sent to PostgREST
    const applicationData = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined)
    ) as CreateApplicationInput;

    console.log('[Application API] Sanitized payload keys:', Object.keys(applicationData));
    console.log('[Application API] Sanitized payload:', JSON.stringify(applicationData, null, 2));

    // Step 1: Check if user already has an application
    let hasExisting: boolean;
    try {
      hasExisting = await hasExistingApplication(supabase, auth.userId);
      console.log('[Application API] hasExisting:', hasExisting);
    } catch (checkError: any) {
      console.error('[Application API] hasExistingApplication FAILED:', checkError);
      return NextResponse.json(
        { success: false, error: 'Failed to check existing applications.', debug: { step: 'hasExistingApplication', error: checkError?.message, code: checkError?.code } },
        { status: 500 }
      );
    }

    let application;

    if (hasExisting) {
      // Get existing application
      let existing;
      try {
        existing = await getApplicationsByUserId(supabase, auth.userId);
        console.log('[Application API] Existing applications:', existing.length);
      } catch (fetchError: any) {
        console.error('[Application API] getApplicationsByUserId FAILED:', fetchError);
        return NextResponse.json(
          { success: false, error: 'Failed to fetch existing applications.', debug: { step: 'getApplicationsByUserId', error: fetchError?.message, code: fetchError?.code } },
          { status: 500 }
        );
      }

      const draftApplication = existing.find((a) => a.status === 'draft');

      if (draftApplication) {
        // Update existing draft
        try {
          const { data, error } = await supabase
            .from('lead_profiles' as any)
            .update(applicationData)
            .eq('id', draftApplication.id)
            .select()
            .single();

          if (error) throw error;
          application = data;
          console.log('[Application API] Updated draft:', draftApplication.id);
        } catch (updateError: any) {
          console.error('[Application API] UPDATE draft FAILED:', updateError);
          return NextResponse.json(
            { success: false, error: 'Failed to update draft.', debug: { step: 'updateDraft', error: updateError?.message, code: updateError?.code, details: updateError?.details, hint: updateError?.hint } },
            { status: 500 }
          );
        }

        // If submitting, trigger application number generation
        if (isSubmitting) {
          try {
            application = await submitApplication(supabase, draftApplication.id);
            console.log('[Application API] Submitted draft:', application?.application_number);
          } catch (submitError: any) {
            console.error('[Application API] submitApplication FAILED:', submitError);
            return NextResponse.json(
              { success: false, error: 'Failed to submit application.', debug: { step: 'submitDraft', error: submitError?.message, code: submitError?.code, details: submitError?.details } },
              { status: 500 }
            );
          }
        }
      } else {
        // User has existing non-draft application(s) — create a new one for additional course
        try {
          application = await createApplication(supabase, applicationData);
          console.log('[Application API] Created additional application:', application?.id);
        } catch (createError: any) {
          console.error('[Application API] createApplication (additional) FAILED:', createError);
          return NextResponse.json(
            { success: false, error: 'Failed to create application.', debug: { step: 'createAdditional', error: createError?.message, code: createError?.code, details: createError?.details, hint: createError?.hint } },
            { status: 500 }
          );
        }

        if (isSubmitting) {
          try {
            application = await submitApplication(supabase, application.id);
          } catch (submitError: any) {
            console.error('[Application API] submitApplication (additional) FAILED:', submitError);
            return NextResponse.json(
              { success: false, error: 'Failed to submit application.', debug: { step: 'submitAdditional', error: submitError?.message, code: submitError?.code, details: submitError?.details } },
              { status: 500 }
            );
          }
        }
      }
    } else {
      // Create new application
      try {
        application = await createApplication(supabase, applicationData);
        console.log('[Application API] Created new application:', application?.id);
      } catch (createError: any) {
        console.error('[Application API] createApplication FAILED:', JSON.stringify({
          message: createError?.message,
          code: createError?.code,
          details: createError?.details,
          hint: createError?.hint,
          statusCode: createError?.statusCode,
        }));
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to create application.',
            debug: {
              step: 'createNew',
              error: createError?.message,
              code: createError?.code,
              details: createError?.details,
              hint: createError?.hint,
              payload: applicationData,
            },
          },
          { status: 500 }
        );
      }

      // If submitting, trigger application number generation
      if (isSubmitting) {
        try {
          application = await submitApplication(supabase, application.id);
          console.log('[Application API] Submitted new application:', application?.application_number);
        } catch (submitError: any) {
          console.error('[Application API] submitApplication FAILED:', submitError);
          return NextResponse.json(
            { success: false, error: 'Failed to submit application.', debug: { step: 'submitNew', error: submitError?.message, code: submitError?.code, details: submitError?.details } },
            { status: 500 }
          );
        }
      }
    }

    // Update user's first_name if provided
    if (body.first_name) {
      await supabase.from('users' as any).update({ first_name: body.first_name }).eq('id', auth.userId);
    }

    // Send confirmation emails and dispatch notifications if submitting
    if (isSubmitting && application) {
      const userName = body.first_name || auth.name || 'Student';

      // Send confirmation emails (non-blocking)
      if (auth.email) {
        sendSubmissionEmails(
          { ...application, phone: auth.phone || body.phone },
          auth.email,
          userName
        ).catch((err) => console.error('Email sending failed:', err));
      }

      // Dispatch notifications to Telegram + team emails + admin bell (non-blocking)
      notifyNewApplication({
        userName,
        phone: auth.phone || body.phone || 'N/A',
        course: application.interest_course || body.interest_course || '',
        schoolName: body.academic_data?.school_name || body.academic_data?.college_name,
        city: body.city,
        state: body.state,
        applicationNumber: application.application_number || undefined,
      }).catch((err) => console.error('Notification dispatch failed:', err));
    }

    return NextResponse.json(
      { success: true, data: application },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[Application API] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process application. Please try again.',
        debug: {
          step: 'unexpected',
          error: error?.message || String(error),
          code: error?.code,
        },
      },
      { status: 500 }
    );
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
