// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { markOnboardingStepComplete, markOnboardingStepIncomplete } from '@neram/database/queries';
import { verifyFirebaseToken } from '../../../../_lib/auth';

// PATCH /api/enroll/onboarding-steps/[progressId] - Toggle step completion
export async function PATCH(
  request: NextRequest,
  { params }: { params: { progressId: string } }
) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { progressId } = params;
    const body = await request.json();
    const { isCompleted } = body;

    const supabase = createAdminClient();

    // Verify ownership: the progress record must belong to the authenticated user
    const { data: progress } = await supabase
      .from('student_onboarding_progress')
      .select('id, user_id')
      .eq('id', progressId)
      .single();

    if (!progress) {
      return NextResponse.json(
        { error: 'Onboarding step not found' },
        { status: 404 }
      );
    }

    if (progress.user_id !== auth.userId) {
      return NextResponse.json(
        { error: 'Not authorized to update this step' },
        { status: 403 }
      );
    }

    let result;
    if (isCompleted) {
      result = await markOnboardingStepComplete(progressId, 'student', auth.userId, supabase);
    } else {
      result = await markOnboardingStepIncomplete(progressId, supabase);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        isCompleted: result.is_completed,
        completedAt: result.completed_at,
      },
    });
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    return NextResponse.json(
      { error: 'Failed to update onboarding step' },
      { status: 500 }
    );
  }
}
