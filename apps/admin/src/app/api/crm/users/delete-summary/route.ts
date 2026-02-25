import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userIds } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'userIds array is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    // Count related data in parallel
    const [
      leadProfiles,
      studentProfiles,
      demoRegistrations,
      payments,
      onboardingSessions,
      documents,
      scholarships,
      cashbackClaims,
      adminNotes,
      profileHistory,
    ] = await Promise.all([
      supabase
        .from('lead_profiles')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('student_profiles')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('demo_class_registrations')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('onboarding_sessions')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('application_documents')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('scholarship_applications')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('cashback_claims')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('admin_user_notes')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
      supabase
        .from('user_profile_history')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds),
    ]);

    const summary = {
      users: userIds.length,
      leadProfiles: leadProfiles.count || 0,
      studentProfiles: studentProfiles.count || 0,
      demoRegistrations: demoRegistrations.count || 0,
      payments: payments.count || 0,
      onboardingSessions: onboardingSessions.count || 0,
      documents: documents.count || 0,
      scholarships: scholarships.count || 0,
      cashbackClaims: cashbackClaims.count || 0,
      adminNotes: adminNotes.count || 0,
      profileHistory: profileHistory.count || 0,
    };

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('Delete summary error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate deletion summary' },
      { status: 500 }
    );
  }
}
