// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getStudentOnboardingProgress,
  markOnboardingStepComplete,
  markOnboardingStepIncomplete,
  initializeStudentOnboarding,
} from '@neram/database';

// GET /api/onboarding-steps/students/[studentProfileId] - Get student's onboarding progress
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentProfileId: string }> }
) {
  try {
    const { studentProfileId } = await params;
    const supabase = getSupabaseAdminClient();
    const progress = await getStudentOnboardingProgress(studentProfileId, supabase);

    return NextResponse.json({ success: true, data: progress });
  } catch (error) {
    console.error('Error fetching student onboarding progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding progress' },
      { status: 500 }
    );
  }
}

// PATCH /api/onboarding-steps/students/[studentProfileId] - Admin marks step complete/incomplete
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentProfileId: string }> }
) {
  try {
    const { studentProfileId } = await params;
    const body = await request.json();
    const { progressId, action, adminUserId, adminNotes } = body;

    if (!progressId || !action || !adminUserId) {
      return NextResponse.json(
        { error: 'progressId, action, and adminUserId are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    let result;
    if (action === 'complete') {
      result = await markOnboardingStepComplete(
        progressId,
        'admin',
        adminUserId,
        supabase,
        adminNotes
      );
    } else if (action === 'incomplete') {
      result = await markOnboardingStepIncomplete(progressId, supabase);
    } else {
      return NextResponse.json(
        { error: 'action must be "complete" or "incomplete"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    return NextResponse.json(
      { error: 'Failed to update onboarding step' },
      { status: 500 }
    );
  }
}

// POST /api/onboarding-steps/students/[studentProfileId] - Initialize onboarding for existing student
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ studentProfileId: string }> }
) {
  try {
    const { studentProfileId } = await params;
    const body = await request.json();
    const { userId, enrollmentType } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    await initializeStudentOnboarding(
      studentProfileId,
      userId,
      enrollmentType || 'regular',
      supabase
    );

    const progress = await getStudentOnboardingProgress(studentProfileId, supabase);

    return NextResponse.json({ success: true, data: progress });
  } catch (error) {
    console.error('Error initializing onboarding:', error);
    return NextResponse.json(
      { error: 'Failed to initialize onboarding' },
      { status: 500 }
    );
  }
}
