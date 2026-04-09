// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, generatePaymentLinkToken } from '@neram/database';

/**
 * POST /api/crm/users/[id]/payment-link
 * Generate a shareable 7-day payment link for a student without email/Google auth.
 * Admin copies the link and shares via WhatsApp or phone call.
 * Overwrites any previously generated token for this lead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = getSupabaseAdminClient();

    // Find the approved lead profile for this user
    const { data: lead, error } = await client
      .from('lead_profiles')
      .select('id, status')
      .eq('user_id', params.id)
      .eq('status', 'approved')
      .single();

    if (error || !lead) {
      return NextResponse.json(
        { error: 'No approved application found for this user' },
        { status: 404 }
      );
    }

    const { token, expiresAt } = await generatePaymentLinkToken(lead.id, client);

    const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://neramclasses.com';
    const link = `${marketingUrl}/pay/link/${token}`;

    return NextResponse.json({ link, expiresAt });
  } catch (error: any) {
    console.error('Payment link generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate payment link' },
      { status: 500 }
    );
  }
}
