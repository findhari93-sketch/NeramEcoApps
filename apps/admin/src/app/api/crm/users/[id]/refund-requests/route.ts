// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listRefundRequestsByLeadProfile } from '@neram/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;

    // id is the lead_profile_id (same as the user detail page param)
    // We need to find refund requests for all lead_profiles of this user
    // Since the CRM detail provides the user's lead_profile, we use that
    const requests = await listRefundRequestsByLeadProfile(id);

    return NextResponse.json({ refundRequests: requests });
  } catch (error) {
    console.error('Error fetching refund requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch refund requests' },
      { status: 500 }
    );
  }
}