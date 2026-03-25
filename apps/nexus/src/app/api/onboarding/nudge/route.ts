import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { recordNudge } from '@neram/database/queries/nexus';

// Reviewer contacts for nudge notifications
const REVIEWER_EMAILS = [
  'TamilSelvan@neramclasses.com',
  'Haribabu@nerasmclasses.onmicrosoft.com',
  'sudarshini@neramclasses.com',
  'Shanthimano@nerasmclasses.onmicrosoft.com',
];

const WHATSAPP_NUMBER = '919176137043';

/**
 * POST /api/onboarding/nudge
 * Send a reminder to reviewers (24h cooldown)
 * Body: { classroom_id }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, name')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { classroom_id } = body;

    if (!classroom_id) {
      return NextResponse.json({ error: 'classroom_id required' }, { status: 400 });
    }

    // Check cooldown and record nudge
    const { allowed, nextNudgeAt } = await recordNudge(user.id, classroom_id);

    if (!allowed) {
      return NextResponse.json({
        error: 'Nudge cooldown active',
        nextNudgeAt,
      }, { status: 429 });
    }

    // Build Teams deep link for chat with reviewers
    const teamsRecipients = REVIEWER_EMAILS.join(',');
    const message = encodeURIComponent(
      `Hi, I'm ${user.name}. I've uploaded my onboarding documents and am waiting for review. Could you please check?`
    );
    const teamsLink = `https://teams.microsoft.com/l/chat/0/0?users=${teamsRecipients}&message=${message}`;

    // Build WhatsApp link (shown after 48h on client side)
    const waMessage = encodeURIComponent(
      `Hi, I'm ${user.name} from Neram Classes. I uploaded my documents and am waiting for review. Could you please check?`
    );
    const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`;

    return NextResponse.json({
      success: true,
      teamsLink,
      whatsappLink,
      reviewerEmails: REVIEWER_EMAILS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send nudge';
    console.error('Nudge POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
