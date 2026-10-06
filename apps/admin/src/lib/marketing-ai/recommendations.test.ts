// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canTransition, expireStale, persistFindings, transition } from './recommendations';
import { createFakeDb } from './test-utils/fake-db';
import type { Finding } from './types';

const finding = (key: string, over: Partial<Finding> = {}): Finding => ({
  ruleId: 'R1',
  category: 'add_negative',
  entityType: 'search_term',
  entityId: key,
  campaignId: 'c1',
  title: `Block ${key}`,
  reason: 'r',
  priority: 'high',
  risk: 'low',
  proposedChange: { kind: 'add_negative', campaign_id: 'c1', text: key, match_type: 'EXACT' },
  evidence: { window: { from: '2026-10-01', to: '2026-10-30', days: 30 }, rows: [] },
  dedupeKey: `neg:${key}`,
  ...over,
});

describe('lifecycle', () => {
  it('allows only the documented moves', () => {
    expect(canTransition('pending_approval', 'approved')).toBe(true);
    expect(canTransition('approved', 'executing')).toBe(true);
    expect(canTransition('pending_approval', 'executing')).toBe(false); // no execution without approval
    expect(canTransition('rejected', 'approved')).toBe(false);
    expect(canTransition('executed', 'pending_approval')).toBe(false);
  });

  it('records who decided and writes an audit row', async () => {
    const db = createFakeDb({ marketing_ai_recommendations: [{ id: 'r', status: 'pending_approval', entity_type: 'keyword', entity_id: 'k', title: 't', run_id: null }] });
    const out = await transition(db, 'r', 'rejected', { type: 'admin', id: 'a1' }, { note: 'Free seekers do sign up for our free tools' });
    expect(out).toMatchObject({ status: 'rejected', decided_by: 'a1', decision_note: 'Free seekers do sign up for our free tools' });
    expect(db.tables.marketing_ai_audit_log[0]).toMatchObject({ event: 'recommendation.rejected', actor: 'a1', actor_type: 'admin', before: { status: 'pending_approval' }, after: { status: 'rejected' } });
  });

  it('refuses an illegal move', async () => {
    const db = createFakeDb({ marketing_ai_recommendations: [{ id: 'r', status: 'rejected' }] });
    await expect(transition(db, 'r', 'approved', { type: 'admin', id: 'a1' })).rejects.toThrow(/Cannot move/);
  });
});

describe('persistFindings', () => {
  it('inserts new findings, refreshes open ones and does not re-raise a recent rejection', async () => {
    const db = createFakeDb({
      marketing_ai_recommendations: [
        { id: 'open', dedupe_key: 'neg:a', status: 'pending_approval', title: 'old', reason: 'old' },
        { id: 'rej', dedupe_key: 'neg:b', status: 'rejected', decided_at: new Date().toISOString() },
      ],
    });
    const stats = await persistFindings(db, [finding('a'), finding('b'), finding('c')], 'run1');
    expect(stats).toEqual({ created: 1, refreshed: 1, skipped_rejected: 1 });
    const rows = db.tables.marketing_ai_recommendations;
    expect(rows.find((r) => r.id === 'open')).toMatchObject({ title: 'Block a', run_id: 'run1' });
    expect(rows.find((r) => r.dedupe_key === 'neg:c')).toMatchObject({ status: 'pending_approval', category: 'add_negative' });
  });

  it('keeps the proposal an admin already approved, refreshing only the evidence', async () => {
    const db = createFakeDb({ marketing_ai_recommendations: [{ id: 'ok', dedupe_key: 'neg:a', status: 'approved', title: 'approved title' }] });
    await persistFindings(db, [finding('a', { title: 'new title' })], 'run2');
    expect(db.tables.marketing_ai_recommendations[0]).toMatchObject({ title: 'approved title', run_id: 'run2' });
  });

  it('expires stale pending recommendations', async () => {
    const db = createFakeDb({
      marketing_ai_recommendations: [
        { id: '1', status: 'pending_approval', expires_at: '2020-01-01T00:00:00Z' },
        { id: '2', status: 'pending_approval', expires_at: '2999-01-01T00:00:00Z' },
      ],
    });
    expect(await expireStale(db)).toBe(1);
  });
});
