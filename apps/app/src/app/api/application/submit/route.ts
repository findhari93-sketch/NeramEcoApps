export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { createApplication, updateApplication, submitApplication } from '@neram/database/queries';
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

/**
 * POST /api/application/submit
 *
 * Submit a completed application form.
 * Maps the new 4-step form data to DB columns using createApplication/updateApplication.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Authenticate via Firebase token
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decodedToken = await getAuth().verifyIdToken(token);
        const { data: user } = await supabase
          .from('users' as any)
          .select('id')
          .eq('firebase_uid', decodedToken.uid)
          .single() as { data: { id: string } | null };
        userId = user?.id || null;
      } catch {
        // Fall through to cookie-based auth
      }
    }

    // Fallback: try Supabase session auth
    if (!userId) {
      const { createServerClient } = await import('@neram/database');
      const supabaseSession = createServerClient();
      const { data: { user: sessionUser } } = await supabaseSession.auth.getUser();
      if (sessionUser) {
        const { data: dbUser } = await supabase
          .from('users' as any)
          .select('id')
          .eq('firebase_uid', sessionUser.id)
          .single() as { data: { id: string } | null };
        userId = dbUser?.id || null;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to submit an application' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (!body.first_name) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'First name is required' },
        { status: 400 }
      );
    }

    if (!body.interest_course) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Course selection is required' },
        { status: 400 }
      );
    }

    // Update user's first_name on users table
    if (body.first_name) {
      await (supabase.from('users') as any)
        .update({ first_name: body.first_name })
        .eq('id', userId);
    }

    // Build the application input
    const applicationInput = {
      user_id: userId,
      father_name: body.father_name || undefined,
      country: body.country || 'IN',
      city: body.city || undefined,
      state: body.state || undefined,
      district: body.district || undefined,
      pincode: body.pincode || undefined,
      address: body.address || undefined,
      latitude: body.latitude ?? undefined,
      longitude: body.longitude ?? undefined,
      location_source: body.location_source || undefined,
      detected_location: body.detected_location || undefined,
      applicant_category: body.applicant_category || undefined,
      caste_category: body.caste_category || undefined,
      target_exam_year: body.target_exam_year || undefined,
      school_type: body.school_type || undefined,
      academic_data: body.academic_data || undefined,
      interest_course: body.interest_course || undefined,
      selected_course_id: body.selected_course_id || undefined,
      selected_center_id: body.selected_center_id || undefined,
      hybrid_learning_accepted: body.hybrid_learning_accepted ?? undefined,
      learning_mode: body.learning_mode || 'hybrid',
      phone_verified: body.phone_verified ?? false,
      phone_verified_at: body.phone_verified_at || undefined,
      utm_source: body.utm_source || undefined,
      utm_medium: body.utm_medium || undefined,
      utm_campaign: body.utm_campaign || undefined,
      referral_code: body.referral_code || undefined,
      form_step_completed: body.form_step_completed || 4,
      source: (body.source || 'app') as 'website_form' | 'app' | 'referral' | 'manual',
      status: 'submitted' as const,
    };

    let leadProfile;

    if (body.draftId) {
      // Update existing draft and submit
      leadProfile = await updateApplication(supabase, body.draftId, {
        ...applicationInput,
        status: undefined, // Will be set by submitApplication
      });
      leadProfile = await submitApplication(supabase, body.draftId);
    } else {
      // Create new application and submit
      leadProfile = await createApplication(supabase, applicationInput);
      leadProfile = await submitApplication(supabase, leadProfile.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully',
      leadProfileId: leadProfile.id,
      applicationNumber: leadProfile.application_number,
    });
  } catch (error) {
    console.error('Application submit error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
