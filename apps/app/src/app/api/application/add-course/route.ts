export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, notifyNewApplication } from '@neram/database';
import {
  getLatestSubmittedApplication,
  createApplication,
  submitApplication,
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

// Course labels for notifications
const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both NATA & JEE Paper 2',
};

/**
 * Verify Firebase ID token and get user ID + info
 */
async function verifyToken(request: NextRequest): Promise<{
  userId: string;
  userName: string;
  phone: string;
} | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users' as any)
      .select('id, first_name, last_name, phone')
      .eq('firebase_uid', decodedToken.uid)
      .single() as { data: { id: string; first_name: string | null; last_name: string | null; phone: string | null } | null };

    if (!user) return null;

    const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Student';
    return { userId: user.id, userName, phone: user.phone || '' };
  } catch {
    return null;
  }
}

/**
 * POST /api/application/add-course
 *
 * Create a new application for an additional course, copying personal/academic
 * data from the user's latest submitted application.
 *
 * Request body:
 * - interest_course: 'nata' | 'jee_paper2' | 'both'
 * - learning_mode?: 'hybrid' | 'online_only'
 * - selected_center_id?: string
 * - selected_course_id?: string
 *
 * Response:
 * - 201: { success: true, data: LeadProfile }
 * - 400: { success: false, error: 'Validation error' }
 * - 401: { success: false, error: 'Unauthorized' }
 * - 404: { success: false, error: 'No existing application found' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function POST(request: NextRequest) {
  const auth = await verifyToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Please log in.' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Validate required fields
    if (!body.interest_course) {
      return NextResponse.json(
        { success: false, error: 'Please select a course.' },
        { status: 400 }
      );
    }

    // Get existing application to copy data from
    const existing = await getLatestSubmittedApplication(supabase, auth.userId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'No existing application found. Please submit a full application first.' },
        { status: 404 }
      );
    }

    // Check if user already has an application for this course
    const { data: duplicateCheck } = await supabase
      .from('lead_profiles' as any)
      .select('id')
      .eq('user_id', auth.userId)
      .eq('interest_course', body.interest_course)
      .is('deleted_at', null)
      .not('status', 'eq', 'deleted')
      .limit(1);

    if (duplicateCheck && duplicateCheck.length > 0) {
      return NextResponse.json(
        { success: false, error: `You already have an application for ${COURSE_LABELS[body.interest_course] || body.interest_course}.` },
        { status: 400 }
      );
    }

    // Copy personal, location, and academic data from existing application
    const applicationData: CreateApplicationInput = {
      user_id: auth.userId,
      father_name: existing.father_name ?? undefined,
      country: existing.country ?? undefined,
      city: existing.city ?? undefined,
      state: existing.state ?? undefined,
      district: existing.district ?? undefined,
      pincode: existing.pincode ?? undefined,
      address: existing.address ?? undefined,
      latitude: existing.latitude ?? undefined,
      longitude: existing.longitude ?? undefined,
      location_source: existing.location_source ?? undefined,
      applicant_category: existing.applicant_category ?? undefined,
      academic_data: existing.academic_data ?? undefined,
      caste_category: existing.caste_category ?? undefined,
      target_exam_year: existing.target_exam_year ?? undefined,
      phone_verified: existing.phone_verified ?? undefined,
      phone_verified_at: existing.phone_verified_at ?? undefined,
      // New course-specific fields from request
      interest_course: body.interest_course,
      selected_course_id: body.selected_course_id || undefined,
      selected_center_id: body.selected_center_id || undefined,
      learning_mode: body.learning_mode || 'hybrid',
      hybrid_learning_accepted: body.learning_mode === 'hybrid',
      // Status: submit immediately
      status: 'submitted',
      source: 'app',
    };

    // Create and submit the new application
    let application = await createApplication(supabase, applicationData);
    application = await submitApplication(supabase, application.id);

    // Dispatch notifications
    try {
      await notifyNewApplication({
        userId: auth.userId,
        userName: auth.userName,
        phone: auth.phone,
        course: COURSE_LABELS[body.interest_course] || body.interest_course,
        applicationNumber: application.application_number || undefined,
        city: existing.city || undefined,
        state: existing.state || undefined,
      });
    } catch (err) {
      console.error('Notification dispatch failed:', err);
    }

    return NextResponse.json(
      { success: true, data: application },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add course error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add course. Please try again.' },
      { status: 500 }
    );
  }
}