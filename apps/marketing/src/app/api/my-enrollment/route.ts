// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyFirebaseToken } from '../_lib/auth';

// GET /api/my-enrollment - Get current user's enrollment data
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get student profile
    const { data: studentProfile, error: spError } = await supabase
      .from('student_profiles')
      .select('id, student_id, user_id, enrollment_date, batch_id, course_id, payment_status, total_fee, fee_paid, fee_due')
      .eq('user_id', auth.userId)
      .single();

    if (spError || !studentProfile) {
      return NextResponse.json({ error: 'No enrollment found', code: 'NOT_ENROLLED' }, { status: 404 });
    }

    // Get lead profile (application details)
    const { data: leadProfile } = await supabase
      .from('lead_profiles')
      .select('id, application_number, interest_course, status, source, first_name, father_name, date_of_birth, gender, country, state, city, district, pincode, address, applicant_category, academic_data, caste_category, target_exam_year, school_type, parent_phone, learning_mode')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get course and batch names
    let courseName = null;
    let batchName = null;
    if (studentProfile.course_id) {
      const { data: course } = await supabase.from('courses').select('name').eq('id', studentProfile.course_id).single();
      courseName = course?.name || null;
    }
    if (studentProfile.batch_id) {
      const { data: batch } = await supabase.from('batches').select('name').eq('id', studentProfile.batch_id).single();
      batchName = batch?.name || null;
    }

    // Get onboarding steps
    const { data: onboardingSteps } = await supabase
      .from('student_onboarding_progress')
      .select(`
        id,
        is_completed,
        completed_at,
        completed_by_type,
        step_definition:onboarding_step_definitions (
          step_key,
          title,
          description,
          icon_name,
          action_type,
          action_config,
          display_order,
          is_required
        )
      `)
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: true });

    const steps = (onboardingSteps || []).map((s: any) => ({
      id: s.id,
      isCompleted: s.is_completed,
      completedAt: s.completed_at,
      completedByType: s.completed_by_type,
      stepKey: s.step_definition?.step_key,
      title: s.step_definition?.title,
      description: s.step_definition?.description,
      iconName: s.step_definition?.icon_name,
      actionType: s.step_definition?.action_type,
      actionConfig: s.step_definition?.action_config || {},
      displayOrder: s.step_definition?.display_order,
      isRequired: s.step_definition?.is_required,
    }));

    return NextResponse.json({
      success: true,
      data: {
        studentId: studentProfile.student_id,
        enrollmentDate: studentProfile.enrollment_date,
        courseName,
        batchName,
        paymentStatus: studentProfile.payment_status,
        totalFee: studentProfile.total_fee,
        feePaid: studentProfile.fee_paid,
        feeDue: studentProfile.fee_due,
        leadProfile: leadProfile || null,
        onboardingSteps: steps,
      },
    });
  } catch (error: any) {
    console.error('[my-enrollment] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch enrollment data' }, { status: 500 });
  }
}
