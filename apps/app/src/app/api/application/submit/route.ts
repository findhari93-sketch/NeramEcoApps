// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to submit an application' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Validate required fields
    const requiredFields = ['fullName', 'email', 'phone', 'gender', 'schoolName', 'board', 'currentClass', 'courseInterest', 'batchPreference', 'sourceCategory'];
    const missingFields = requiredFields.filter(field => !body[field]);

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: 'Validation Error', message: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if user already has a lead profile
    // @ts-ignore - Supabase types not generated
    const { data: existingLead } = await supabase
      .from('lead_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single() as { data: { id: string } | null };

    let leadProfileId: string;

    if (existingLead) {
      // Update existing lead profile
      const { data: updatedLead, error: updateError } = await supabase
        .from('lead_profiles')
        // @ts-ignore - Supabase types not generated
        .update({
          full_name: body.fullName,
          email: body.email,
          phone: body.phone,
          date_of_birth: body.dob || null,
          gender: body.gender,
          address: body.address || null,
          city: body.city || null,
          state: body.state || null,
          pincode: body.pincode || null,
          school_name: body.schoolName,
          board: body.board,
          current_class: body.currentClass,
          stream: body.stream || null,
          course_interest: body.courseInterest,
          batch_preference: body.batchPreference,
          total_cashback_eligible: body.totalCashbackEligible || 0,
          form_step_completed: 6,
          form_completed_at: new Date().toISOString(),
          status: 'new',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLead.id)
        .select()
        .single() as unknown as { data: { id: string } | null; error: unknown };

      if (updateError) {
        console.error('Update lead error:', updateError);
        return NextResponse.json(
          { error: 'Database Error', message: 'Failed to update application' },
          { status: 500 }
        );
      }

      leadProfileId = updatedLead!.id;
    } else {
      // Create new lead profile
      const { data: newLead, error: createError } = await supabase
        .from('lead_profiles')
        // @ts-ignore - Supabase types not generated
        .insert({
          user_id: user.id,
          full_name: body.fullName,
          email: body.email,
          phone: body.phone,
          date_of_birth: body.dob || null,
          gender: body.gender,
          address: body.address || null,
          city: body.city || null,
          state: body.state || null,
          pincode: body.pincode || null,
          school_name: body.schoolName,
          board: body.board,
          current_class: body.currentClass,
          stream: body.stream || null,
          course_interest: body.courseInterest,
          batch_preference: body.batchPreference,
          total_cashback_eligible: body.totalCashbackEligible || 0,
          form_step_completed: 6,
          form_completed_at: new Date().toISOString(),
          status: 'new',
        })
        .select()
        .single() as unknown as { data: { id: string } | null; error: unknown };

      if (createError) {
        console.error('Create lead error:', createError);
        return NextResponse.json(
          { error: 'Database Error', message: 'Failed to create application' },
          { status: 500 }
        );
      }

      leadProfileId = newLead!.id;
    }

    // Create scholarship application if applicable
    if (body.isGovernmentSchool) {
      await supabase
        .from('scholarship_applications')
        // @ts-ignore - Supabase types not generated
        .upsert({
          lead_profile_id: leadProfileId,
          is_government_school: body.isGovernmentSchool,
          government_school_years: body.governmentSchoolYears || 0,
          school_id_card_url: body.schoolIdCardUrl || null,
          income_certificate_url: body.incomeCertificateUrl || null,
          is_low_income: body.isLowIncome || false,
          scholarship_percentage: body.scholarshipPercentage || 0,
          verification_status: 'pending',
        }, {
          onConflict: 'lead_profile_id',
        });
    }

    // Create cashback claims
    if (body.youtubeVerified) {
      await supabase
        .from('cashback_claims')
        // @ts-ignore - Supabase types not generated
        .upsert({
          lead_profile_id: leadProfileId,
          user_id: user.id,
          cashback_type: 'youtube_subscription',
          amount: 50,
          youtube_channel_subscribed: true,
          status: 'verified',
          cashback_phone: body.cashbackPhoneNumber || body.phone,
        }, {
          onConflict: 'lead_profile_id,cashback_type',
        });
    }

    if (body.instagramFollowed && body.instagramUsername) {
      await supabase
        .from('cashback_claims')
        // @ts-ignore - Supabase types not generated
        .upsert({
          lead_profile_id: leadProfileId,
          user_id: user.id,
          cashback_type: 'instagram_follow',
          amount: 50,
          instagram_username: body.instagramUsername,
          status: 'pending', // Admin will verify
          cashback_phone: body.cashbackPhoneNumber || body.phone,
        }, {
          onConflict: 'lead_profile_id,cashback_type',
        });
    }

    // Create source tracking
    await supabase
      .from('source_tracking')
      // @ts-ignore - Supabase types not generated
      .upsert({
        lead_profile_id: leadProfileId,
        source_category: body.sourceCategory,
        source_detail: body.sourceDetail || null,
        friend_referral_name: body.friendReferralName || null,
        friend_referral_phone: body.friendReferralPhone || null,
      }, {
        onConflict: 'lead_profile_id',
      });

    // TODO: Send confirmation email
    // await sendEmail(body.email, 'application-submitted', { name: body.fullName });

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully',
      leadProfileId,
    });
  } catch (error) {
    console.error('Application submit error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
