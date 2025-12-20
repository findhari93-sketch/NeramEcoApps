// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, listUsers, createUser, createLeadProfile } from '@neram/database';
import type { UserType, UserStatus, CourseType } from '@neram/database';

// GET /api/leads - List all leads
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as UserStatus | null;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const supabase = getSupabaseAdminClient();

    // Get leads (users with type 'lead')
    const { users, count } = await listUsers({
      userType: 'lead',
      status: status || undefined,
      search,
      limit,
      offset,
      orderBy: 'created_at',
      orderDirection: 'desc',
    }, supabase);

    // Get lead profiles for each user
    const leadsWithProfiles = await Promise.all(
      users.map(async (user) => {
        const { data: profile } = await supabase
          .from('lead_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          status: user.status,
          course: profile?.interest_course || null,
          city: profile?.city || null,
          state: profile?.state || null,
          source: profile?.source || null,
          createdAt: user.created_at,
          reviewedAt: profile?.reviewed_at || null,
          adminNotes: profile?.admin_notes || null,
        };
      })
    );

    return NextResponse.json({
      leads: leadsWithProfiles,
      total: count,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}

// POST /api/leads - Create a new lead
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      email,
      phone,
      course,
      city,
      state,
      source = 'manual',
      applicationData,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Create user
    const user = await createUser({
      name,
      email: email || null,
      phone: phone || null,
      username: null,
      avatar_url: null,
      firebase_uid: null,
      ms_oid: null,
      google_id: null,
      user_type: 'lead' as UserType,
      status: 'pending' as UserStatus,
      email_verified: false,
      phone_verified: false,
      preferred_language: 'en',
      last_login_at: null,
      metadata: null,
    }, supabase);

    // Create lead profile
    const profile = await createLeadProfile({
      user_id: user.id,
      source: source as any,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      referral_code: null,
      interest_course: course as CourseType || null,
      qualification: null,
      school_college: null,
      city: city || null,
      state: state || null,
      application_data: applicationData || null,
      reviewed_by: null,
      reviewed_at: null,
      admin_notes: null,
      rejection_reason: null,
      assigned_fee: null,
      discount_amount: 0,
      coupon_code: null,
      final_fee: null,
      payment_scheme: 'full',
      payment_deadline: null,
      installment_reminder_date: null,
      full_payment_discount: null,
      total_cashback_eligible: 0,
      total_cashback_processed: 0,
      form_step_completed: 0,
      form_completed_at: null,
      email_sent_at: null,
      whatsapp_sent_at: null,
      last_reminder_sent_at: null,
    }, supabase);

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      course: profile.interest_course,
      createdAt: user.created_at,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating lead:', error);
    return NextResponse.json(
      { error: 'Failed to create lead' },
      { status: 500 }
    );
  }
}
