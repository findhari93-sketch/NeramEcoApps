import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { assessApplication, getSupabaseAdminClient } from '@neram/database';
import {
  getLiveDetailRequestForUser,
  markDetailRequestAnswered,
} from '@neram/database/queries';

/**
 * GET /api/student/profile-completion
 * Returns current profile data + which fields are missing.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get lead profile
    const { data: leadProfile } = await supabase
      .from('lead_profiles')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get student profile (for fee info)
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // What the record is actually short of, using the one shared rule so this page,
    // the Admin chip and the Nexus students sheet cannot disagree about whether a
    // student has given us their details. Before this they each had their own list.
    const assessment = assessApplication({ lead: leadProfile, user });
    const missingFields: string[] = [...assessment.missing];

    // Kept alongside the shared set: these are useful to have and are asked for on
    // this page, but a record without them is not incomplete.
    const niceToHave: string[] = [];
    if (!user.phone) niceToHave.push('phone');
    if (!user.gender) niceToHave.push('gender');
    if (!leadProfile?.pincode) niceToHave.push('pincode');

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        first_name: user.first_name,
        email: user.email,
        phone: user.phone,
        date_of_birth: user.date_of_birth,
        gender: user.gender,
      },
      leadProfile: leadProfile ? {
        id: leadProfile.id,
        father_name: leadProfile.father_name,
        applicant_category: leadProfile.applicant_category,
        interest_course: leadProfile.interest_course,
        caste_category: leadProfile.caste_category,
        target_exam_year: leadProfile.target_exam_year,
        school_type: leadProfile.school_type,
        learning_mode: leadProfile.learning_mode,
        address: leadProfile.address,
        city: leadProfile.city,
        district: leadProfile.district,
        state: leadProfile.state,
        pincode: leadProfile.pincode,
      } : null,
      studentProfile: studentProfile ? {
        id: studentProfile.id,
        total_fee: studentProfile.total_fee,
        fee_paid: studentProfile.fee_paid,
        fee_due: studentProfile.fee_due,
      } : null,
      missingFields,
      niceToHave,
      applicationState: assessment.state,
      isComplete: assessment.state === 'complete',
    });
  } catch (error: any) {
    console.error('Profile completion GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch profile' },
      { status: error.message?.includes('token') ? 401 : 500 }
    );
  }
}

/**
 * PATCH /api/student/profile-completion
 * Student updates their own profile (personal + academic + location).
 */
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { userUpdates, leadUpdates } = body;

    // Whitelist allowed user fields (students can only update these)
    const allowedUserFields = ['phone', 'date_of_birth', 'gender', 'first_name', 'last_name'];
    const safeUserUpdates: Record<string, unknown> = {};
    if (userUpdates) {
      for (const key of allowedUserFields) {
        if (key in userUpdates) safeUserUpdates[key] = userUpdates[key];
      }
    }

    // Whitelist allowed lead profile fields
    const allowedLeadFields = [
      'father_name', 'applicant_category', 'interest_course', 'caste_category',
      'target_exam_year', 'school_type', 'learning_mode', 'academic_data',
      'address', 'city', 'district', 'state', 'pincode',
    ];
    const safeLeadUpdates: Record<string, unknown> = {};
    if (leadUpdates) {
      for (const key of allowedLeadFields) {
        if (key in leadUpdates) safeLeadUpdates[key] = leadUpdates[key];
      }
    }

    // Update user fields
    if (Object.keys(safeUserUpdates).length > 0) {
      const { error: userError } = await supabase
        .from('users')
        .update({ ...safeUserUpdates, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (userError) throw userError;
    }

    // Update or create lead profile
    if (Object.keys(safeLeadUpdates).length > 0) {
      const { data: existingLead } = await supabase
        .from('lead_profiles')
        .select('id')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLead) {
        const { error: leadError } = await supabase
          .from('lead_profiles')
          .update({ ...safeLeadUpdates, updated_at: new Date().toISOString() })
          .eq('id', existingLead.id);
        if (leadError) throw leadError;
      } else {
        // Create a lead profile for this student (Entra-synced students may not have one)
        const { error: insertError } = await supabase
          .from('lead_profiles')
          .insert({
            user_id: user.id,
            ...safeLeadUpdates,
            source: 'manual',
            status: 'enrolled',
          });
        if (insertError) throw insertError;
      }
    }

    // A student who filled this in inside Nexus has answered whatever ask was
    // outstanding, so staff stop chasing them. Without this the Students sheet would
    // still read "Asked 4 days ago, not opened" after the student had already done
    // it, which is worse than not tracking the ask at all.
    try {
      const live = await getLiveDetailRequestForUser(user.id, supabase);
      if (live) {
        const { data: lead } = await supabase
          .from('lead_profiles')
          .select('id')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        await markDetailRequestAnswered(live, lead?.id ?? null, supabase);
      }
    } catch (requestError: any) {
      // Closing the ask is bookkeeping. It must never fail the student's save.
      console.warn('[profile-completion] could not close the detail request:', requestError?.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Profile completion PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: error.message?.includes('token') ? 401 : 500 }
    );
  }
}
