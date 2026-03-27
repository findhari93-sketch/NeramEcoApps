// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, bulkMarkOnboardingStepComplete } from '@neram/database';

// PATCH /api/onboarding-steps/bulk - Mark a step as complete for multiple students
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentProfileIds, stepDefinitionId, adminUserId } = body;

    if (!studentProfileIds || !Array.isArray(studentProfileIds) || studentProfileIds.length === 0) {
      return NextResponse.json(
        { error: 'studentProfileIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!stepDefinitionId) {
      return NextResponse.json(
        { error: 'stepDefinitionId is required' },
        { status: 400 }
      );
    }

    if (!adminUserId) {
      return NextResponse.json(
        { error: 'adminUserId is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Use the existing bulk mark function
    const updatedRows = await bulkMarkOnboardingStepComplete(
      studentProfileIds,
      stepDefinitionId,
      adminUserId,
      supabase
    );

    // Also update the status column to 'completed' for all affected rows
    const { error: statusError } = await supabase
      .from('student_onboarding_progress')
      .update({ status: 'completed' })
      .in('student_profile_id', studentProfileIds)
      .eq('step_definition_id', stepDefinitionId);

    if (statusError) {
      console.warn('Warning: failed to update status column:', statusError.message);
    }

    return NextResponse.json({
      success: true,
      updatedCount: updatedRows.length,
      data: updatedRows,
    });
  } catch (error) {
    console.error('Error bulk updating onboarding steps:', error);
    return NextResponse.json(
      { error: 'Failed to bulk update onboarding steps' },
      { status: 500 }
    );
  }
}
