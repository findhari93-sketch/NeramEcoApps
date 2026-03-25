import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getCampaignStudents,
  recordReminder,
} from '@neram/database';

/**
 * POST /api/review-campaigns/[id]/remind
 *
 * Send reminders to students who haven't completed their review.
 * Targets students with status 'sent' or 'clicked'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller || !['admin', 'teacher'].includes(caller.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get students who were sent but haven't completed
    const { students } = await getCampaignStudents({
      campaignId: params.id,
      limit: 1000,
    });

    const toRemind = students.filter(s => s.status === 'sent' || s.status === 'clicked');

    if (toRemind.length === 0) {
      return NextResponse.json({ error: 'No students to remind' }, { status: 400 });
    }

    // Record reminders
    let reminded = 0;
    for (const s of toRemind) {
      await recordReminder(s.id);
      reminded++;
    }

    // TODO: Actually send reminder notifications via WhatsApp/Email

    return NextResponse.json({
      reminded,
      message: `Recorded reminders for ${reminded} students.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send reminders';
    console.error('Campaign remind error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
