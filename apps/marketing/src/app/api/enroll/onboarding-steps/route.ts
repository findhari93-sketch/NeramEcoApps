// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getStudentOnboardingProgressByUserId } from '@neram/database/queries';
import { verifyFirebaseToken } from '../../_lib/auth';

// GET /api/enroll/onboarding-steps - Get onboarding steps for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const steps = await getStudentOnboardingProgressByUserId(auth.userId, supabase);

    return NextResponse.json({
      success: true,
      data: steps.map((step) => ({
        id: step.id,
        isCompleted: step.is_completed,
        completedAt: step.completed_at,
        completedByType: step.completed_by_type,
        stepKey: step.step_definition?.step_key,
        title: step.step_definition?.title,
        description: step.step_definition?.description,
        iconName: step.step_definition?.icon_name,
        actionType: step.step_definition?.action_type,
        actionConfig: step.step_definition?.action_config,
        displayOrder: step.step_definition?.display_order,
        isRequired: step.step_definition?.is_required,
      })),
    });
  } catch (error) {
    console.error('Error fetching onboarding steps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding steps' },
      { status: 500 }
    );
  }
}
