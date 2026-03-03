// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has a student profile (means fully enrolled)
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('id, enrollment_date, status, batch_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!studentProfile) {
      return NextResponse.json(
        { enrolled: false },
        { status: 200 }
      );
    }

    // Get the lead profile for course info
    const { data: leadProfile } = await supabase
      .from('lead_profiles')
      .select('interest_course')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get the most recent paid payment for receipt info
    const { data: payment } = await supabase
      .from('payments')
      .select('amount, receipt_number')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const COURSE_LABELS: Record<string, string> = {
      nata: 'NATA Preparation Course',
      jee_paper2: 'JEE Paper 2 Preparation Course',
      both: 'NATA & JEE Combined Course',
      not_sure: 'Architecture Entrance Course',
    };

    return NextResponse.json({
      enrolled: true,
      enrollmentDate: studentProfile.enrollment_date,
      courseName: COURSE_LABELS[leadProfile?.interest_course || ''] || 'Architecture Entrance Course',
      receiptNumber: payment?.receipt_number || null,
      amountPaid: payment?.amount || 0,
      batchAssigned: !!studentProfile.batch_id,
    });
  } catch (error) {
    console.error('Student status error:', error);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}