// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

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
    const failed = rows.filter((r: any) => r.delivery_status === 'failed').length;
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

    return NextResponse.json({
      total,
      failed,
      sent: total - failed,
      failureRate,
      primaryErrorPrefix,
      primaryErrorCount,
      windowHours: 24,
    });
  } catch (err: any) {
    console.error('whatsapp-health error:', err);
    return NextResponse.json(
      { total: 0, failed: 0, sent: 0, failureRate: 0, primaryErrorPrefix: null, primaryErrorCount: 0, windowHours: 24 },
      { status: 200 }
    );
  }
}
