// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyFirebaseToken } from '../../../_lib/auth';

/**
 * GET /api/application/[id]/details
 *
 * Get full application details including related data
 * (source tracking, scholarship, cashback claims).
 * Used by the View Application dialog.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await verifyFirebaseToken(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch lead profile
    const { data: application, error: appError } = await supabase
      .from('lead_profiles' as any)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (appError && appError.code !== 'PGRST116') throw appError;

    if (!application) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if ((application as any).user_id !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch related data in parallel (including user for name/email/phone)
    const [sourceResult, scholarshipResult, cashbackResult, userResult] = await Promise.all([
      supabase
        .from('source_tracking' as any)
        .select('*')
        .eq('lead_profile_id', id)
        .maybeSingle(),
      supabase
        .from('scholarship_applications' as any)
        .select('*')
        .eq('lead_profile_id', id)
        .maybeSingle(),
      supabase
        .from('cashback_claims' as any)
        .select('*')
        .eq('lead_profile_id', id),
      (supabase
        .from('users') as any)
        .select('first_name, last_name, email, phone')
        .eq('id', auth.userId)
        .single(),
    ]);

    // Enrich application with user name/contact fields
    const enrichedApplication = {
      ...application,
      full_name: [userResult.data?.first_name, userResult.data?.last_name].filter(Boolean).join(' ') || null,
      email: userResult.data?.email || application.email || null,
      phone: userResult.data?.phone || application.phone || null,
    };

    return NextResponse.json({
      success: true,
      data: {
        application: enrichedApplication,
        sourceTracking: sourceResult.data || null,
        scholarship: scholarshipResult.data || null,
        cashbackClaims: cashbackResult.data || [],
      },
    });
  } catch (error) {
    console.error('Get application details error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch application details' },
      { status: 500 }
    );
  }
}