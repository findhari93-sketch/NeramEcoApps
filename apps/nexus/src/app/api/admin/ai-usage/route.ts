import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  getAiSpend,
  getAiUsageBreakdown,
  getRecentAiEvents,
  utcDay,
  utcMonthStart,
} from '@neram/database';
import { AI_FEATURES, costOf, featureById, getAiControls } from '@neram/ai';
import { canUser } from '@/lib/staff-capabilities';

/**
 * What the AI has cost, and what each feature spent.
 *
 * Deliberately NOT served through /api/settings, which is an unauthenticated
 * public read. The caps and the on/off modes live there because they are not
 * secret; the spend figures do not, and this route is gated on the same
 * system.settings capability that guards writing them.
 *
 * Everything is computed from the ai_usage_daily rollup rather than by summing
 * the event table, so the page stays a couple of indexed reads no matter how
 * many calls have been logged.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  /**
   * Auth is settled before the main try, so a missing token cannot fall into
   * the catch-all below.
   *
   * verifyMsToken throws a plain Error, so folding it into the general handler
   * answered an anonymous caller with a 500 carrying the internal error text.
   * A refusal is not a server fault: 500 is indistinguishable from the route
   * being broken, which is exactly the wrong signal on the page you open when
   * you suspect something is wrong.
   */
  let msUser: Awaited<ReturnType<typeof verifyMsToken>>;
  try {
    msUser = await verifyMsToken(request.headers.get('Authorization'));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .single();

    // Gate on the capability, not user_type: the internal team keeps
    // user_type='admin' for Admin app access, so a raw check would let a
    // manager read the whole spend picture. Same rule as PATCH /api/settings.
    if (!user || !canUser(user, 'system.settings')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = utcDay();
    const monthStart = utcMonthStart();

    const [controls, todayTotals, monthTotals, breakdown, recent] = await Promise.all([
      getAiControls(),
      getAiSpend(today, today),
      getAiSpend(monthStart, today),
      getAiUsageBreakdown(monthStart, today),
      getRecentAiEvents(50),
    ]);

    // Roll the per-model rows up per feature, which is the question the page
    // exists to answer: which feature is spending the most.
    const byFeatureMap = new Map<
      string,
      { featureId: string; calls: number; blockedCalls: number; tokens: number; costUsd: number }
    >();
    const byModelMap = new Map<string, { model: string; calls: number; costUsd: number }>();

    for (const row of breakdown) {
      const f = byFeatureMap.get(row.feature_id) ?? {
        featureId: row.feature_id,
        calls: 0,
        blockedCalls: 0,
        tokens: 0,
        costUsd: 0,
      };
      f.calls += row.calls;
      f.blockedCalls += row.blocked_calls;
      f.tokens += Number(row.prompt_tokens) + Number(row.output_tokens);
      f.costUsd += Number(row.cost_usd);
      byFeatureMap.set(row.feature_id, f);

      if (row.model) {
        const m = byModelMap.get(row.model) ?? { model: row.model, calls: 0, costUsd: 0 };
        m.calls += row.calls;
        m.costUsd += Number(row.cost_usd);
        byModelMap.set(row.model, m);
      }
    }

    /**
     * Every registered feature appears, even at zero.
     *
     * A feature missing from the list would read as "not spending" when it can
     * equally mean "switched off" or "quietly broken", and telling those apart
     * is most of the point. The mode and label come from the registry so a row
     * with no usage is still actionable.
     */
    const byFeature = AI_FEATURES.map((def) => {
      const seen = byFeatureMap.get(def.id);
      const calls = seen?.calls ?? 0;
      const costUsd = seen?.costUsd ?? 0;
      return {
        featureId: def.id,
        label: def.label,
        app: def.app,
        group: def.group,
        trigger: def.trigger,
        tier: def.tier,
        supportsManual: def.supportsManual,
        mode: controls.modes[def.id] ?? def.defaultMode,
        calls,
        blockedCalls: seen?.blockedCalls ?? 0,
        tokens: seen?.tokens ?? 0,
        costUsd,
        avgCostUsd: calls > 0 ? costUsd / calls : 0,
      };
    }).sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);

    // Anything logged under an id no longer in the registry, so a renamed
    // feature's history does not silently vanish from the totals.
    const orphans = [...byFeatureMap.values()]
      .filter((f) => !featureById(f.featureId))
      .map((f) => ({ ...f, label: `${f.featureId} (retired)` }));

    /**
     * Straight-line projection: today's rate held for the rest of the month.
     *
     * Crude on purpose. It answers "at this pace, does the cap hold" and
     * nothing more; a smarter model would imply a confidence the data does not
     * support this early in a month.
     */
    const now = new Date();
    const daysElapsed = now.getUTCDate();
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
    ).getUTCDate();
    const projectedMonthUsd =
      daysElapsed > 0 ? (monthTotals.costUsd / daysElapsed) * daysInMonth : 0;

    return NextResponse.json({
      controls,
      today: {
        calls: todayTotals.calls,
        blockedCalls: todayTotals.blockedCalls,
        tokens: todayTotals.promptTokens + todayTotals.outputTokens,
        costUsd: todayTotals.costUsd,
      },
      month: {
        calls: monthTotals.calls,
        blockedCalls: monthTotals.blockedCalls,
        tokens: monthTotals.promptTokens + monthTotals.outputTokens,
        costUsd: monthTotals.costUsd,
        projectedUsd: projectedMonthUsd,
        daysElapsed,
        daysInMonth,
      },
      byFeature,
      orphans,
      byModel: [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd),
      recent: recent.map((e) => ({
        id: e.id,
        featureId: e.feature_id,
        label: featureById(e.feature_id)?.label ?? e.feature_id,
        app: e.app,
        model: e.model,
        keyTier: e.key_tier,
        tokens: e.total_tokens,
        costUsd: e.estimated_cost_usd === null ? null : Number(e.estimated_cost_usd),
        latencyMs: e.latency_ms,
        status: e.status,
        error: e.error,
        createdAt: e.created_at,
      })),
      /**
       * Proof the price table is not lying. If the panel and the model both
       * agree on what 1M input tokens costs, the totals above can be trusted;
       * an unpriced model is the one case where they cannot.
       */
      priceCheck: {
        unpricedModels: [...byModelMap.keys()].filter(
          (m) => costOf(m, { promptTokens: 1, outputTokens: 1, totalTokens: 2 }) === null
        ),
      },
    });
  } catch (err) {
    // Logged in full, returned as a fixed string: the detail is for us, and
    // this route is reachable by anyone who can guess the path.
    const message = err instanceof Error ? err.message : 'Failed to load AI usage';
    console.error('GET /api/admin/ai-usage error:', message);
    return NextResponse.json({ error: 'Failed to load AI usage' }, { status: 500 });
  }
}
