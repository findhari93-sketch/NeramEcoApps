export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, isWhatsAppRepliesEnabled } from '@neram/database';

/**
 * GET /api/messages/counts
 * Totals per status across ALL contact messages (not just the loaded page),
 * so the Messages KPIs are correct on every tab. Also says whether WhatsApp
 * replies are switched on, so the UI can disable that button until they are.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const countFor = async (status?: 'unread' | 'read' | 'replied') => {
      let query = supabase.from('contact_messages').select('id', { count: 'exact', head: true });
      if (status) query = query.eq('status', status);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    };

    const [total, unread, read, replied] = await Promise.all([
      countFor(),
      countFor('unread'),
      countFor('read'),
      countFor('replied'),
    ]);

    return NextResponse.json({
      success: true,
      total,
      unread,
      read,
      replied,
      whatsappRepliesEnabled: isWhatsAppRepliesEnabled(),
    });
  } catch (error: any) {
    console.error('Error fetching contact message counts:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch message counts' },
      { status: 500 }
    );
  }
}
