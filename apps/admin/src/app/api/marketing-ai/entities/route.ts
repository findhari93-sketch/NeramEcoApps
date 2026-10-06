export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing-ai/entities?level=campaign|ad_group|keyword|search_term|device|ad|hour|geo&days=30
 * Per-entity totals and derived metrics for the window ending on the last
 * ingested day. Search terms carry the latest AI intent label. Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readAdsEnv } from '@/lib/marketing-ai/config';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { aggregate, derive, lastCompleteDayIST, windowEnding } from '@/lib/marketing-ai/metrics';
import { db, loadEntityDays } from '@/lib/marketing-ai/store';
import type { Level } from '@/lib/marketing-ai/types';

const LEVELS: Level[] = ['campaign', 'ad_group', 'keyword', 'search_term', 'device', 'ad', 'hour', 'geo'];

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const params = new URL(request.url).searchParams;
    const level = (LEVELS as string[]).includes(params.get('level') || '') ? (params.get('level') as Level) : 'campaign';
    const days = [7, 14, 30].includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
    const client = db();
    const env = readAdsEnv();

    const { data: last } = await client.from('ads_entity_daily').select('date').eq('customer_id', env.customerId).eq('level', level).order('date', { ascending: false }).limit(1);
    const endDate: string = last?.[0]?.date ?? lastCompleteDayIST();
    const w = windowEnding(endDate, days);
    const rows = await loadEntityDays(client, env.customerId, w.from, w.to, [level]);

    let intents: Record<string, { intent: string; confidence: number; reason: string }> = {};
    if (level === 'search_term') {
      const { data: run } = await client.from('marketing_ai_runs').select('stats').eq('kind', 'analyze').eq('status', 'succeeded').order('started_at', { ascending: false }).limit(1);
      intents = run?.[0]?.stats?.intents ?? {};
    }

    const items = aggregate(rows, level, w)
      .map((a) => ({ ...a, ...derive(a), intent: intents[a.key] ?? null }))
      .sort((a, b) => b.cost - a.cost);

    return NextResponse.json({ level, window: w, items });
  } catch (err) {
    return errorResponse(err, 'entities');
  }
}
