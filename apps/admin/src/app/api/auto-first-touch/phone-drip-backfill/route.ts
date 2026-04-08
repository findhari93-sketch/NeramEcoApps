// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/auto-first-touch/phone-drip-backfill
 *
 * One-time backfill: schedules phone drip emails for all existing leads who:
 * - user_type = 'lead'
 * - firebase_uid IS NOT NULL (signed in via app)
 * - phone_verified = false
 * - email_opt_out = false
 * - email IS NOT NULL
 * - No existing phone_drip_1 row in auto_messages
 *
 * Safe to call multiple times (createAutoMessage uses ON CONFLICT DO NOTHING).
 */

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, schedulePhoneDrip } from '@neram/database';

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();

    // Get leads eligible for drip
    const { data: leads, error: leadsError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('user_type', 'lead')
      .eq('phone_verified', false)
      .eq('email_opt_out', false)
      .not('firebase_uid', 'is', null)
      .not('email', 'is', null);

    if (leadsError) throw leadsError;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, message: 'No eligible leads found', scheduled: 0 });
    }

    // Filter out leads that already have phone_drip_1 scheduled
    const { data: existing } = await supabase
      .from('auto_messages')
      .select('user_id')
      .eq('message_type', 'phone_drip_1')
      .eq('channel', 'email');

    const existingIds = new Set((existing ?? []).map((r: any) => r.user_id));
    const eligibleLeads = leads.filter((l: any) => !existingIds.has(l.id));

    if (eligibleLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All eligible leads already have drip scheduled',
        scheduled: 0,
        total_leads: leads.length,
      });
    }

    let scheduled = 0;
    const errors: string[] = [];

    for (const lead of eligibleLeads) {
      try {
        // Anchor 25 min ago so Email 1 fires in ~5 min (30 min delay - 25 min offset)
        await schedulePhoneDrip(lead.id, {
          userName: lead.name,
          email: lead.email,
        }, supabase, Date.now() - 25 * 60 * 1000);
        scheduled++;
      } catch (err: any) {
        errors.push(`${lead.id}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      total_eligible: eligibleLeads.length,
      scheduled,
      errors: errors.length > 0 ? errors : undefined,
      note: 'Email 1 sends in approximately 5 minutes. Subsequent emails follow the drip schedule.',
    });

  } catch (error: any) {
    console.error('Phone drip backfill error:', error);
    return NextResponse.json(
      { error: 'Failed to backfill phone drip' },
      { status: 500 }
    );
  }
}
