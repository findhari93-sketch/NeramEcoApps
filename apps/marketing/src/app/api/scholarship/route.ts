/**
 * GET /api/scholarship - Get scholarship status for authenticated user
 * POST /api/scholarship - Submit scholarship application with document URLs
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  getSupabaseAdminClient,
  getScholarshipByUserId,
  getApplicationsByUserId,
  createScholarshipApplication,
  updateScholarshipDocuments,
  notifyScholarshipSubmitted,
} from '@neram/database';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {
    // Already initialized
  }
}

/**
 * Helper: verify Firebase token and get user
 */
async function verifyAndGetUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const decodedToken = await getAuth().verifyIdToken(token);
  const adminClient = getSupabaseAdminClient();

  const { data: user } = await (adminClient
    .from('users') as any)
    .select('id, name, email, phone')
    .eq('firebase_uid', decodedToken.uid)
    .single();

  if (!user) return null;
  return { user, adminClient };
}

/**
 * GET /api/scholarship
 * Returns the scholarship application status for the authenticated user.
 * Also returns the lead profile to check eligibility.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAndGetUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, adminClient } = auth;

    // Get user's applications (lead profiles)
    const applications = await getApplicationsByUserId(adminClient, user.id);
    const submittedApplication = applications.find(
      (a) => a.status !== 'draft' && a.status !== 'deleted'
    );

    if (!submittedApplication) {
      return NextResponse.json({
        hasApplication: false,
        scholarshipEligible: false,
        scholarship: null,
      });
    }

    // Check scholarship eligibility from lead profile
    const scholarshipEligible = submittedApplication.scholarship_eligible || false;

    // Get existing scholarship application
    const scholarship = await getScholarshipByUserId(user.id, adminClient);

    return NextResponse.json({
      hasApplication: true,
      applicationNumber: submittedApplication.application_number,
      leadProfileId: submittedApplication.id,
      scholarshipEligible,
      scholarship,
    });
  } catch (error) {
    console.error('Error fetching scholarship:', error);
    return NextResponse.json({ error: 'Failed to fetch scholarship' }, { status: 500 });
  }
}

/**
 * POST /api/scholarship
 * Submit or resubmit scholarship application with document URLs.
 *
 * Body: {
 *   school_id_card_url?: string,
 *   income_certificate_url?: string,
 *   aadhar_card_url?: string,
 *   mark_sheet_url?: string,
 *   school_name?: string,
 *   annual_income_range?: string,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAndGetUser(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user, adminClient } = auth;
    const body = await req.json();

    // Validate required documents
    if (!body.school_id_card_url) {
      return NextResponse.json(
        { error: 'School ID card is required' },
        { status: 400 }
      );
    }
    if (!body.income_certificate_url) {
      return NextResponse.json(
        { error: 'Income certificate is required' },
        { status: 400 }
      );
    }
    if (!body.aadhar_card_url) {
      return NextResponse.json(
        { error: 'Aadhar card is required' },
        { status: 400 }
      );
    }

    // Get user's submitted application
    const applications = await getApplicationsByUserId(adminClient, user.id);
    const submittedApplication = applications.find(
      (a) => a.status !== 'draft' && a.status !== 'deleted'
    );

    if (!submittedApplication) {
      return NextResponse.json(
        { error: 'No application found. Submit an application first.' },
        { status: 400 }
      );
    }

    if (!submittedApplication.scholarship_eligible) {
      return NextResponse.json(
        { error: 'You are not eligible for the scholarship program.' },
        { status: 403 }
      );
    }

    // Check for existing scholarship application
    const existingScholarship = await getScholarshipByUserId(user.id, adminClient);

    let scholarship;

    if (existingScholarship && existingScholarship.scholarship_status !== 'not_eligible') {
      // Update existing (resubmission after revision request)
      scholarship = await updateScholarshipDocuments(
        existingScholarship.id,
        {
          school_id_card_url: body.school_id_card_url,
          income_certificate_url: body.income_certificate_url,
          aadhar_card_url: body.aadhar_card_url,
          mark_sheet_url: body.mark_sheet_url || undefined,
          school_name: body.school_name || undefined,
          annual_income_range: body.annual_income_range || undefined,
        },
        adminClient
      );
    } else {
      // Create new scholarship application
      scholarship = await createScholarshipApplication(
        {
          lead_profile_id: submittedApplication.id,
          user_id: user.id,
          school_name: body.school_name || undefined,
          school_id_card_url: body.school_id_card_url,
          income_certificate_url: body.income_certificate_url,
          aadhar_card_url: body.aadhar_card_url,
          mark_sheet_url: body.mark_sheet_url || undefined,
          annual_income_range: body.annual_income_range || undefined,
        },
        adminClient
      );
    }

    // Notify team (non-blocking)
    notifyScholarshipSubmitted({
      userId: user.id,
      userName: user.name || user.email || 'Student',
      phone: user.phone || 'N/A',
      schoolName: body.school_name || (submittedApplication.academic_data as any)?.school_name,
      applicationNumber: submittedApplication.application_number || undefined,
    }).catch((err) => console.error('Scholarship notification failed:', err));

    return NextResponse.json({ success: true, scholarship });
  } catch (error) {
    console.error('Error submitting scholarship:', error);
    return NextResponse.json(
      { error: 'Failed to submit scholarship application' },
      { status: 500 }
    );
  }
}
