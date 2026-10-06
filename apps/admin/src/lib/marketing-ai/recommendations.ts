/**
 * The recommendation lifecycle (spec §14):
 *
 *   pending_approval -> approved | rejected | expired
 *   approved         -> executing | rejected | expired
 *   executing        -> executed | failed
 *   failed           -> executing (retry) | rejected
 *   executed         -> measured
 *
 * The agent inserts straight into pending_approval: detection, analysis and
 * recommendation all happen in one nightly run, so the earlier states exist in
 * the schema for completeness but are never held.
 *
 * Every move goes through transition(), which checks the move is legal, makes
 * it conditional on the current status (two admins clicking at once cannot
 * both win) and writes an audit row.
 */

import { writeAudit } from './audit';
import type { Actor, Finding, Recommendation, RecommendationStatus } from './types';

export const TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  detected: ['recommended', 'pending_approval'],
  recommended: ['pending_approval'],
  pending_approval: ['approved', 'rejected', 'expired'],
  approved: ['executing', 'rejected', 'expired'],
  executing: ['executed', 'failed'],
  failed: ['executing', 'rejected'],
  executed: ['measured'],
  rejected: [],
  measured: [],
  expired: [],
};

export const OPEN_STATUSES: RecommendationStatus[] = ['detected', 'recommended', 'pending_approval', 'approved', 'executing'];

export function canTransition(from: RecommendationStatus, to: RecommendationStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class TransitionError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = 'TransitionError';
    this.status = status;
  }
}

export async function getRecommendation(db: any, id: string): Promise<Recommendation | null> {
  const { data, error } = await db.from('marketing_ai_recommendations').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function transition(
  db: any,
  id: string,
  to: RecommendationStatus,
  actor: Actor,
  opts: { note?: string | null; patch?: Record<string, unknown>; event?: string } = {},
): Promise<Recommendation> {
  const rec = await getRecommendation(db, id);
  if (!rec) throw new TransitionError('Recommendation not found', 404);
  if (!canTransition(rec.status, to)) throw new TransitionError(`Cannot move a recommendation from ${rec.status} to ${to}.`);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: to, updated_at: now, ...opts.patch };
  if (to === 'approved' || to === 'rejected') {
    update.decided_by = actor.type === 'admin' ? actor.id : actor.type;
    update.decided_at = now;
    if (opts.note !== undefined) update.decision_note = opts.note;
  }

  const { data, error } = await db
    .from('marketing_ai_recommendations')
    .update(update)
    .eq('id', id)
    .eq('status', rec.status)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new TransitionError('Someone else changed this recommendation first. Refresh and try again.');

  await writeAudit(db, {
    actor,
    event: opts.event ?? `recommendation.${to}`,
    entityType: rec.entity_type,
    entityId: rec.entity_id,
    before: { status: rec.status },
    after: { status: to },
    reason: opts.note ?? rec.title,
    runId: rec.run_id,
    recommendationId: id,
  });
  return data;
}

/** Findings to rows. Pure, so the mapping is tested without a database. */
export function findingToRow(f: Finding, runId: string | null) {
  return {
    rule_id: f.ruleId,
    category: f.category,
    entity_type: f.entityType,
    entity_id: f.entityId,
    campaign_id: f.campaignId,
    title: f.title,
    reason: f.reason,
    priority: f.priority,
    risk_level: f.risk,
    estimated_impact: f.estimatedImpact ?? null,
    proposed_change: f.proposedChange,
    evidence: f.evidence,
    ai_assessment: f.aiAssessment ?? null,
    ai_intent: f.aiIntent ?? null,
    confidence: f.confidence ?? null,
    dedupe_key: f.dedupeKey,
    run_id: runId,
  };
}

/**
 * Insert new findings and refresh open ones with fresh numbers.
 *
 * A finding an admin rejected in the last 30 days is not raised again: saying
 * no once should be enough. An approved or executing one keeps its proposal,
 * because the admin approved that exact change; only its evidence refreshes.
 */
export async function persistFindings(db: any, findings: Finding[], runId: string | null) {
  const stats = { created: 0, refreshed: 0, skipped_rejected: 0 };
  if (!findings.length) return stats;
  const keys = findings.map((f) => f.dedupeKey);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const open = new Map<string, Recommendation>();
  const rejected = new Set<string>();
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const { data: openRows, error: e1 } = await db.from('marketing_ai_recommendations').select('id, dedupe_key, status').in('dedupe_key', chunk).in('status', OPEN_STATUSES);
    if (e1) throw new Error(e1.message);
    for (const r of openRows ?? []) open.set(r.dedupe_key, r);
    const { data: rejRows, error: e2 } = await db.from('marketing_ai_recommendations').select('dedupe_key').in('dedupe_key', chunk).eq('status', 'rejected').gte('decided_at', since);
    if (e2) throw new Error(e2.message);
    for (const r of rejRows ?? []) rejected.add(r.dedupe_key);
  }

  const inserts: ReturnType<typeof findingToRow>[] = [];
  for (const f of findings) {
    const row = findingToRow(f, runId);
    const existing = open.get(f.dedupeKey);
    if (existing) {
      const patch: Record<string, unknown> = { evidence: row.evidence, reason: row.reason, run_id: runId, updated_at: new Date().toISOString() };
      if (existing.status === 'pending_approval') {
        Object.assign(patch, {
          title: row.title,
          priority: row.priority,
          proposed_change: row.proposed_change,
          ai_assessment: row.ai_assessment,
          ai_intent: row.ai_intent,
          confidence: row.confidence,
          estimated_impact: row.estimated_impact,
        });
      }
      const { error } = await db.from('marketing_ai_recommendations').update(patch).eq('id', existing.id);
      if (error) throw new Error(error.message);
      stats.refreshed++;
    } else if (rejected.has(f.dedupeKey)) {
      stats.skipped_rejected++;
    } else {
      inserts.push(row);
    }
  }
  if (inserts.length) {
    const { error } = await db.from('marketing_ai_recommendations').insert(inserts.map((r) => ({ ...r, status: 'pending_approval' })));
    if (error) throw new Error(error.message);
    stats.created = inserts.length;
  }
  return stats;
}

/** Pending recommendations nobody acted on in 14 days are stale; their evidence has moved on. */
export async function expireStale(db: any): Promise<number> {
  const { data, error } = await db
    .from('marketing_ai_recommendations')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'pending_approval')
    .lt('expires_at', new Date().toISOString())
    .select('id');
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
