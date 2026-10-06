/**
 * The marketing_ai_audit_log writer. Every approval, rejection, mutation,
 * autopilot decision and settings change goes through here (spec §23).
 *
 * Never throws: a failed audit write is logged loudly but must not undo or
 * hide the change it describes. Callers that need an audit row as a
 * precondition (a mutation) write it before calling Google, and again after.
 */

import { actorLabel, type Actor } from './types';

export interface AuditEntry {
  actor: Actor;
  event: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  runId?: string | null;
  recommendationId?: string | null;
  actionId?: string | null;
  result?: string | null;
}

export async function writeAudit(db: any, e: AuditEntry): Promise<void> {
  try {
    const { error } = await db.from('marketing_ai_audit_log').insert({
      actor: actorLabel(e.actor),
      actor_type: e.actor.type,
      event: e.event,
      entity_type: e.entityType ?? null,
      entity_id: e.entityId ?? null,
      before: e.before ?? null,
      after: e.after ?? null,
      reason: e.reason ?? null,
      run_id: e.runId ?? null,
      recommendation_id: e.recommendationId ?? null,
      action_id: e.actionId ?? null,
      result: e.result ?? null,
    });
    if (error) console.error('[marketing-ai] audit write failed:', error.message, e.event);
  } catch (err: any) {
    console.error('[marketing-ai] audit write threw:', err?.message, e.event);
  }
}
