import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, sendTemplateEmail } from '@neram/database';
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

// Course type labels
const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both NATA & JEE Paper 2',
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
      .from('users')
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

    // Prepare application data
    const applicationData: CreateApplicationInput = {
      user_id: auth.userId,
      father_name: body.father_name,
      country: body.country || 'IN',
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
      hybrid_learning_accepted: body.hybrid_learning_accepted || false,
      status: isSubmitting ? 'submitted' : 'draft',
      phone_verified: body.phone_verified,
      phone_verified_at: body.phone_verified_at,
      source: 'website_form',
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      referral_code: body.referral_code,
    };

    // Check if user already has an application
    const hasExisting = await hasExistingApplication(supabase, auth.userId);

    let application;

    if (hasExisting) {
      // Get existing application
      const existing = await getApplicationsByUserId(supabase, auth.userId);
      const draftApplication = existing.find((a) => a.status === 'draft');

      if (draftApplication) {
        // Update existing draft
        const { data, error } = await supabase
          .from('lead_profiles')
          .update(applicationData)
          .eq('id', draftApplication.id)
          .select()
          .single();

        if (error) throw error;
        application = data;

        // If submitting, trigger application number generation
        if (isSubmitting) {
          application = await submitApplication(supabase, draftApplication.id);
        }
      } else {
        // User already has a non-draft application
        return NextResponse.json(
          {
            success: false,
            error: 'You already have an active application. Please contact support if you need to make changes.',
          },
          { status: 400 }
        );
      }
    } else {
      // Create new application
      application = await createApplication(supabase, applicationData);

      // If submitting, trigger application number generation
      if (isSubmitting) {
        application = await submitApplication(supabase, application.id);
      }
    }

    // Send confirmation emails if submitting
    if (isSubmitting && application && auth.email) {
      // Don't await - send emails in background
      const userName = auth.name || body.first_name || 'Student';
      sendSubmissionEmails(
        { ...application, phone: auth.phone || body.phone },
        auth.email,
        userName
      ).catch((err) => console.error('Email sending failed:', err));
    }

    return NextResponse.json(
      { success: true, data: application },
      { status: 201 }
    );
  } catch (error) {
    console.error('Application submission error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process application. Please try again.' },
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
