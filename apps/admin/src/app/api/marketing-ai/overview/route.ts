export const dynamic = 'force-dynamic';

/**
 * GET /api/marketing-ai/overview - Account health (7 vs 7, 30 vs 30 days), the
 * daily trend, recommendation counts, run status, conversion uploads and the
 * autopilot record. Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { categoryEligibility } from '@/lib/marketing-ai/autopilot';
import { DAYS_PER_BILLING_MONTH, effectiveTargets, missingLiveEnv, readAdsEnv } from '@/lib/marketing-ai/config';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse } from '@/lib/marketing-ai/http';
import { comparePeriods, dailySeries, lastCompleteDayIST, shiftDate, toTotals, windowEnding } from '@/lib/marketing-ai/metrics';
import { countSignups } from '@/lib/marketing-ai/funnel';
import { notServingCampaigns } from '@/lib/marketing-ai/rules';
import { db, latestRuns, loadEntityDays, loadSettings } from '@/lib/marketing-ai/store';

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    const env = readAdsEnv();
    const settings = await loadSettings(client);
    const runs = await latestRuns(client);

    // Measure against the last day that was actually ingested, so a missed night does not read as zero spend.
    const { data: last } = await client.from('ads_entity_daily').select('date').eq('customer_id', env.customerId).eq('level', 'campaign').order('date', { ascending: false }).limit(1);
    const endDate: string = last?.[0]?.date ?? lastCompleteDayIST();
    const rows = await loadEntityDays(client, env.customerId, shiftDate(endDate, -59), endDate, ['campaign']);

    const { data: recs, error: re } = await client.from('marketing_ai_recommendations').select('status, priority, category, decided_by').gte('created_at', new Date(Date.now() - 90 * 86_400_000).toISOString()).limit(5000);
    if (re) throw new Error(re.message);
    const byStatus: Record<string, number> = {};
    const pendingByPriority: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of recs ?? []) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.status === 'pending_approval') pendingByPriority[r.priority] = (pendingByPriority[r.priority] ?? 0) + 1;
    }
    const decided = (recs ?? []).filter((r: any) => ['approved', 'rejected', 'executing', 'executed', 'failed', 'measured'].includes(r.status));

    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: uploads } = await client.from('ads_conversion_uploads').select('conversion_type, status, value_inr').gte('created_at', since30).limit(5000);
    const conversions: Record<string, Record<string, number>> = {};
    for (const u of uploads ?? []) {
      conversions[u.conversion_type] ??= {};
      conversions[u.conversion_type][u.status] = (conversions[u.conversion_type][u.status] ?? 0) + 1;
    }

    const { count: autoActions7d } = await client
      .from('marketing_ai_actions')
      .select('id', { count: 'exact', head: true })
      .eq('actor', 'autopilot')
      .eq('status', 'succeeded')
      .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString());

    // This month against the cap that applies now (season or off-season).
    const targets = effectiveTargets(settings, endDate);
    const monthStart = `${endDate.slice(0, 7)}-01`;
    const mtd = toTotals(rows.filter((r) => r.date >= monthStart));
    const day = Number(endDate.slice(8, 10));
    const [y, m] = endDate.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const latestBudgets = new Map<string, number>();
    // Rows are in date order, so the last one seen per campaign is its current state.
    for (const r of rows) {
      if (r.date < shiftDate(endDate, -6)) continue;
      if (r.status === 'ENABLED' && r.budget_micros) latestBudgets.set(r.entity_key, r.budget_micros / 1e6);
      else latestBudgets.delete(r.entity_key);
    }
    const dailyBudgets = [...latestBudgets.values()].reduce((s, v) => s + v, 0);

    // Neram's own count of OTP-verified sign-ups in the same days as the spend above (IST).
    const signups = await countSignups(
      client,
      new Date(`${monthStart}T00:00:00+05:30`).toISOString(),
      new Date(`${shiftDate(endDate, 1)}T00:00:00+05:30`).toISOString(),
    ).catch(() => null);

    // What the agent did lately, for the activity feed.
    const { data: acts } = await client
      .from('marketing_ai_actions')
      .select('id, recommendation_id, operation, status, actor, validate_only, revert_payload, reverted_by_action_id, created_at, error')
      .order('created_at', { ascending: false })
      .limit(10);
    const actRecIds = [...new Set((acts ?? []).map((a: any) => a.recommendation_id).filter(Boolean))];
    const { data: actRecs } = actRecIds.length ? await client.from('marketing_ai_recommendations').select('id, title, category').in('id', actRecIds) : { data: [] };
    const recById = new Map((actRecs ?? []).map((r: any) => [r.id, r]));
    const activity = (acts ?? []).map((a: any) => ({
      id: a.id,
      recommendation_id: a.recommendation_id,
      title: (recById.get(a.recommendation_id) as any)?.title ?? a.operation,
      category: (recById.get(a.recommendation_id) as any)?.category ?? null,
      status: a.status,
      automatic: a.actor === 'autopilot',
      dry_run: a.validate_only,
      error: a.error,
      created_at: a.created_at,
      can_undo: a.status === 'succeeded' && !a.reverted_by_action_id && !!a.revert_payload,
    }));

    // Campaigns that are enabled but showing no ads (R0), for the red banner.
    const notServing = [...notServingCampaigns({ rows, endDate, settings, intents: new Map() }).values()].map((c) => ({
      campaign_id: c.campaign_id,
      name: c.campaign_name,
      reasons: (c.primary_status ?? '').split('|').filter(Boolean),
    }));
    // How far back the ingested history reaches, for "Load history".
    const { data: first } = await client.from('ads_entity_daily').select('date').eq('customer_id', env.customerId).eq('level', 'campaign').order('date', { ascending: true }).limit(1);

    const { data: reports } = await client.from('marketing_ai_reports').select('week_start, summary, next_steps, facts, created_at').order('week_start', { ascending: false }).limit(1);

    return NextResponse.json({
      signups: signups && {
        ...signups,
        spent: mtd.cost,
        cost_per_google_signup: signups.from_google_ads ? Math.round(mtd.cost / signups.from_google_ads) : null,
      },
      activity,
      report: reports?.[0] ?? null,
      budget: {
        ...targets,
        season_months: settings.targets.season.months,
        month: endDate.slice(0, 7),
        spent: mtd.cost,
        projected: Math.round((mtd.cost / day) * daysInMonth),
        daily_budgets: Math.round(dailyBudgets),
        budgets_allow: Math.round(dailyBudgets * DAYS_PER_BILLING_MONTH),
      },
      connection: {
        mode: env.mode,
        apiVersion: env.apiVersion,
        customerId: env.customerId,
        missing: env.mode === 'live' ? missingLiveEnv(env) : [],
        mutationsAllowed: env.allowMutations,
        conversionActions: { phone: !!env.conversionActionPhone, demo: !!env.conversionActionDemo, paid: !!env.conversionActionPaid },
      },
      endDate,
      notServing,
      historyFrom: first?.[0]?.date ?? null,
      hasData: rows.length > 0,
      last7: comparePeriods(rows, endDate, 7),
      last30: comparePeriods(rows, endDate, 30),
      trend: dailySeries(rows, windowEnding(endDate, 30)),
      recommendations: { byStatus, pendingByPriority },
      eligibility: categoryEligibility(decided),
      settings,
      runs: runs.byKind,
      conversions,
      autopilot: { actions7d: autoActions7d ?? 0 },
    });
  } catch (err) {
    return errorResponse(err, 'overview');
  }
}
