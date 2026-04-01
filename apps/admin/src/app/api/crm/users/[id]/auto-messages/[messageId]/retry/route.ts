// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/crm/users/[id]/auto-messages/[messageId]/retry
 *
 * Reset a failed auto message to pending so the cron picks it up again.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const supabase = getSupabaseAdminClient();

    const { error } = await (supabase as any)
      .from('auto_messages')
      .update({
        delivery_status: 'pending',
        error_message: null,
        send_after: new Date().toISOString(), // Send immediately on next cron run
      })
      .eq('id', params.messageId)
      .eq('user_id', params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error retrying auto message:', error);
    return NextResponse.json(
      { error: 'Failed to retry message' },
      { status: 500 }
    );
  }
}
