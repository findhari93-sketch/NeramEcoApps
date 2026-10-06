/**
 * Autonomy (spec §6). Safe categories (SAFE_AUTO in config.ts: blocking
 * off-scope searches, cutting budgets to hold the cap, pausing wasteful
 * keywords) run automatically from day one. Everything else acts on its own
 * only where an admin has watched it be right.
 *
 *  - A category can be switched to 'auto' in Settings once it has at least 15
 *    decided recommendations with a 90% approval rate (categoryEligibility).
 *    The switch is the admin's; the agent never promotes itself.
 *  - Autonomy level must be 2 or more and the kill switch off.
 *  - Auto-executed changes go through exactly the same path as an admin's
 *    click (actions.ts), with every hard block and the drift check, plus a
 *    daily cap on the number of automatic actions.
 *  - Seven days after an automatic change, measureExecuted compares the
 *    campaign before and after. If CPA got worse by more than the guardrail,
 *    the category is switched back to 'approve' and an alert is raised.
 */

import { writeAudit } from './audit';
import { executeRecommendation, type ExecuteDeps } from './actions';
import { derive, shiftDate, toTotals } from './metrics';
import { transition } from './recommendations';
import { NEGATIVE_INTENTS, NEVER_AUTO_RULES, type Intent } from './rules';
import { saveSettings } from './store';
import { EXECUTABLE_CATEGORIES, isExecutable, type AgentSettings, type ExecutableCategory, type Recommendation } from './types';

export const ELIGIBILITY = { minDecided: 15, minApprovalRate: 0.9 } as const;

export interface CategoryEligibility {
  category: ExecutableCategory;
  decided: number;
  approved: number;
  rate: number | null;
  eligible: boolean;
}

/** Pure: approval record per executable category, from decided recommendations. */
export function categoryEligibility(decided: Array<Pick<Recommendation, 'category' | 'status' | 'decided_by'>>): CategoryEligibility[] {
  return EXECUTABLE_CATEGORIES.map((category) => {
    // Only a person's decisions count. Autopilot approving itself proves nothing.
    const mine = decided.filter((r) => r.category === category && r.decided_by && r.decided_by !== 'autopilot');
    const approved = mine.filter((r) => r.status !== 'rejected').length;
    const rate = mine.length ? approved / mine.length : null;
    return { category, decided: mine.length, approved, rate, eligible: mine.length >= ELIGIBILITY.minDecided && (rate ?? 0) >= ELIGIBILITY.minApprovalRate };
  });
}

/** Pure: may autopilot act on this recommendation right now? */
export function autoDecision(
  rec: Pick<Recommendation, 'category' | 'status' | 'confidence' | 'ai_intent'> & { proposed_change?: Recommendation['proposed_change']; rule_id?: string; evidence?: Recommendation['evidence'] },
  settings: AgentSettings,
): { ok: boolean; reason: string } {
  if (settings.autonomy.kill_switch) return { ok: false, reason: 'kill switch is on' };
  if (settings.autonomy.level < 2) return { ok: false, reason: `autonomy level ${settings.autonomy.level}` };
  if (rec.status !== 'pending_approval') return { ok: false, reason: `status ${rec.status}` };
  if (!isExecutable(rec.category)) return { ok: false, reason: 'advice only' };
  if (settings.autonomy.categories[rec.category] !== 'auto') return { ok: false, reason: 'category needs approval' };
  // Last season's conversions were a different goal: good enough to suggest, never to act alone.
  if (rec.evidence?.proxy) return { ok: false, reason: "based on last season's conversions" };
  if (rec.rule_id && NEVER_AUTO_RULES.includes(rec.rule_id)) return { ok: false, reason: 'this rule always needs a person' };
  if (rec.category === 'add_negative') {
    if ((rec.confidence ?? 0) < settings.guardrails.auto_min_confidence) return { ok: false, reason: 'AI confidence below threshold' };
    if (!NEGATIVE_INTENTS.includes(rec.ai_intent as Intent)) return { ok: false, reason: 'intent not on the block list' };
  }
  if (rec.category === 'budget_cut') {
    const c = rec.proposed_change;
    if (!c || c.kind !== 'budget_change' || !(c.to_micros < c.from_micros)) return { ok: false, reason: 'not a budget cut' };
  }
  if (rec.category === 'bid_cut') {
    const c = rec.proposed_change;
    if (!c || c.kind !== 'keyword_bid' || !(c.to_micros < c.from_micros)) return { ok: false, reason: 'not a bid cut' };
  }
  return { ok: true, reason: 'auto' };
}

/** Start of today in IST, as an ISO timestamp. */
export function istDayStart(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000).toISOString();
}

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function runAutopilot(deps: Omit<ExecuteDeps, 'actor'>, now = new Date()) {
  const { db, settings } = deps;
  const stats = { considered: 0, executed: 0, validated: 0, failed: 0, skipped: 0, cap_reached: false, reason: '' };
  if (settings.autonomy.kill_switch || settings.autonomy.level < 2) {
    stats.reason = settings.autonomy.kill_switch ? 'kill switch on' : `autonomy level ${settings.autonomy.level}`;
    return stats;
  }
  const autoCats = (Object.keys(settings.autonomy.categories) as ExecutableCategory[]).filter((c) => settings.autonomy.categories[c] === 'auto');
  if (!autoCats.length) {
    stats.reason = 'no category is on auto';
    return stats;
  }

  const { count, error: ce } = await db
    .from('marketing_ai_actions')
    .select('id', { count: 'exact', head: true })
    .eq('actor', 'autopilot')
    .in('status', ['succeeded', 'reverted'])
    .gte('created_at', istDayStart(now));
  if (ce) throw new Error(ce.message);
  let remaining = settings.guardrails.max_auto_actions_per_day - (count ?? 0);

  const { data, error } = await db.from('marketing_ai_recommendations').select('*').eq('status', 'pending_approval').in('category', autoCats).limit(200);
  if (error) throw new Error(error.message);
  const recs = ((data ?? []) as Recommendation[]).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  for (const rec of recs) {
    stats.considered++;
    const d = autoDecision(rec, settings);
    if (!d.ok) {
      stats.skipped++;
      continue;
    }
    if (remaining <= 0) {
      stats.cap_reached = true;
      break;
    }
    await transition(db, rec.id, 'approved', { type: 'autopilot' }, { note: 'Approved automatically: this category is on auto and the change is inside every guardrail.' });
    const outcome = await executeRecommendation({ ...deps, actor: { type: 'autopilot' } }, rec.id);
    if (outcome.status === 'executed' || outcome.status === 'noop') {
      stats.executed++;
      remaining--;
    } else if (outcome.status === 'validated') stats.validated++;
    else stats.failed++;
  }
  return stats;
}

/** Pure: before/after numbers for one campaign around a change date. */
export function measureChange(rows: Array<{ date: string; campaign_id: string | null; level: string; impressions: number; clicks: number; cost_micros: number; conversions: number; conversions_value: number }>, campaignId: string, executedOn: string) {
  const camp = rows.filter((r) => r.level === 'campaign' && r.campaign_id === campaignId);
  const before = toTotals(camp.filter((r) => r.date >= shiftDate(executedOn, -7) && r.date < executedOn));
  const after = toTotals(camp.filter((r) => r.date > executedOn && r.date <= shiftDate(executedOn, 7)));
  const b = derive(before);
  const a = derive(after);
  const cpaChangePct = a.cpa !== null && b.cpa !== null ? Math.round(((a.cpa - b.cpa) / b.cpa) * 1000) / 10 : null;
  return { before: { ...before, ...b }, after: { ...after, ...a }, cpa_change_pct: cpaChangePct };
}

/**
 * Seven days after execution, record what happened. Demote a category whose
 * automatic change made CPA clearly worse.
 */
export async function measureExecuted(db: any, settings: AgentSettings, customerId: string, loadRows: (from: string, to: string) => Promise<any[]>, now = new Date()) {
  const cutoff = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const { data, error } = await db.from('marketing_ai_recommendations').select('*').eq('status', 'executed').lte('executed_at', cutoff).limit(50);
  if (error) throw new Error(error.message);
  const stats = { measured: 0, demoted: [] as string[] };
  const nextSettings: AgentSettings = JSON.parse(JSON.stringify(settings));

  for (const rec of (data ?? []) as Recommendation[]) {
    if (!rec.campaign_id || !rec.executed_at) continue;
    const executedOn = rec.executed_at.slice(0, 10);
    const rows = await loadRows(shiftDate(executedOn, -7), shiftDate(executedOn, 7));
    const result = measureChange(rows, rec.campaign_id, executedOn);
    await transition(db, rec.id, 'measured', { type: 'cron' }, { patch: { measured_result: result }, note: 'Measured 7 days after the change.' });
    stats.measured++;

    const worse = result.cpa_change_pct !== null && result.cpa_change_pct >= settings.guardrails.auto_demote_cpa_worsening_pct;
    if (rec.decided_by === 'autopilot' && worse && isExecutable(rec.category) && nextSettings.autonomy.categories[rec.category] === 'auto') {
      nextSettings.autonomy.categories[rec.category] = 'approve';
      stats.demoted.push(rec.category);
      await writeAudit(db, {
        actor: { type: 'autopilot' },
        event: 'autopilot.demoted',
        entityType: 'category',
        entityId: rec.category,
        before: { mode: 'auto' },
        after: { mode: 'approve' },
        reason: `CPA rose ${result.cpa_change_pct}% in the week after "${rec.title}". Automatic changes in this category now need approval again.`,
        recommendationId: rec.id,
      });
      await db.from('marketing_ai_recommendations').insert({
        rule_id: 'AUTO',
        category: 'alert',
        entity_type: 'category',
        entity_id: rec.category,
        campaign_id: rec.campaign_id,
        title: `Autopilot paused for ${rec.category.replace('_', ' ')}`,
        reason: `CPA rose ${result.cpa_change_pct}% in the 7 days after an automatic change ("${rec.title}"). This category is back on approval. Review the change and undo it if needed.`,
        priority: 'high',
        risk_level: 'low',
        proposed_change: { kind: 'none' },
        evidence: { window: { from: shiftDate(executedOn, -7), to: shiftDate(executedOn, 7), days: 15 }, rows: [], facts: { cpa_before: result.before.cpa, cpa_after: result.after.cpa, cpa_change_pct: result.cpa_change_pct } },
        dedupe_key: `demote:${rec.id}`,
        status: 'pending_approval',
      });
    }
  }
  if (stats.demoted.length) await saveSettings(db, nextSettings, null);
  return stats;
}
