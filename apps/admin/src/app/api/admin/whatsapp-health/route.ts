// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient, getWhatsAppSendBlock } from '@neram/database';
import { blockReasons } from '@/lib/whatsapp-block';

/**
 * GET /api/admin/whatsapp-health
 *
 * Returns WhatsApp send health for the last 24h. Used by the dashboard
 * banner to surface systemic delivery failures (e.g. Meta dev-mode rejection)
 * before they go unnoticed for days.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('auto_messages')
      .select('delivery_status, error_message')
      .eq('channel', 'whatsapp')
      .gte('created_at', since);

    if (error) throw error;

    const rows = data ?? [];
    const total = rows.length;
    // Rows held because the account cannot send (WA_ACCOUNT_BLOCKED) are still
    // pending, but nothing is going out: count them as failing.
    const failed = rows.filter(
      (r: any) =>
        r.delivery_status === 'failed' ||
        (r.delivery_status === 'pending' && (r.error_message ?? '').startsWith('WA_ACCOUNT_BLOCKED')),
    ).length;
    const failureRate = total > 0 ? failed / total : 0;

    const errorPrefixCounts: Record<string, number> = {};
    for (const r of rows) {
      const msg: string | null = (r as any).error_message;
      if (!msg) continue;
      const match = msg.match(/^(WA_[A-Z_0-9]+)/);
      const key = match ? match[1] : 'OTHER';
      errorPrefixCounts[key] = (errorPrefixCounts[key] ?? 0) + 1;
    }

    let primaryErrorPrefix: string | null = null;
    let primaryErrorCount = 0;
    for (const [k, v] of Object.entries(errorPrefixCounts)) {
      if (v > primaryErrorCount) {
        primaryErrorPrefix = k;
        primaryErrorCount = v;
      }
    }

    // Held rows only say that sending is blocked. Ask Meta why, right now, so
    // the banner names the real blocker (the phone can show Connected while
    // the WhatsApp Business Account itself is not active).
    let liveBlock: string | null = null;
    if (primaryErrorPrefix === 'WA_ACCOUNT_BLOCKED') {
      const block = await getWhatsAppSendBlock();
      liveBlock = block ? blockReasons(block) : null;
    }

    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const managerUrl = wabaId
      ? `https://business.facebook.com/latest/whatsapp_manager/overview/?asset_id=${encodeURIComponent(wabaId)}`
      : null;

    return NextResponse.json({
      total,
      failed,
      sent: total - failed,
      failureRate,
      primaryErrorPrefix,
      primaryErrorCount,
      liveBlock,
      managerUrl,
      windowHours: 24,
    });
  } catch (err: any) {
    console.error('whatsapp-health error:', err);
    return NextResponse.json(
      { total: 0, failed: 0, sent: 0, failureRate: 0, primaryErrorPrefix: null, primaryErrorCount: 0, liveBlock: null, managerUrl: null, windowHours: 24 },
      { status: 200 }
    );
  }
}
