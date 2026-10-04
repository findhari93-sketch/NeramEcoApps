export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/channels?days=30 - Leads by channel and landing page across
 * the four marketing lead tables. Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { LEAD_TABLES, buildChannelReport, type LeadRow, type LeadTable } from '@/lib/lead-channels';

export async function GET(request: NextRequest) {
  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const supabase = getSupabaseAdminClient();

  const missing: LeadTable[] = [];
  const results = await Promise.all(
    (Object.keys(LEAD_TABLES) as LeadTable[]).map(async (table) => {
      const { data, error } = await (supabase.from(table as never) as any)
        .select('channel, landing_page, page_code')
        .gte('created_at', since)
        .limit(5000);
      if (error) {
        // Before migration 20261029090000 the columns do not exist.
        missing.push(table);
        return [] as LeadRow[];
      }
      return ((data as Array<Omit<LeadRow, 'table'>>) ?? []).map((r) => ({ table, ...r }));
    }),
  );

  return NextResponse.json({ days, since, missingColumns: missing, report: buildChannelReport(results.flat()) });
}
