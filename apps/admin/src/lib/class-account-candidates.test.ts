import { describe, it, expect } from 'vitest';
import { finishDue, pickCandidates } from './class-account-candidates';

describe('pickCandidates', () => {
  it('takes enrolled students with no Microsoft account and no setup, once each', () => {
    const ids = pickCandidates({
      links: [
        { used_by: 'hansa', submitted_user_id: null, user_id: 'hansa' },
        { used_by: null, submitted_user_id: 'radhika', user_id: null },
      ],
      profiles: [{ user_id: 'hansa' }, { user_id: 'janani' }],
      users: [
        { id: 'hansa', ms_oid: null },
        { id: 'radhika', ms_oid: null },
        { id: 'janani', ms_oid: 'oid-janani' },
      ],
      withSetup: ['radhika'],
      stale: [],
    });
    expect(ids).toEqual(['hansa']);
  });

  it('retries a stopped run only when its account step is not done', () => {
    const ids = pickCandidates({
      links: [],
      profiles: [],
      users: [],
      withSetup: [],
      stale: [
        { user_id: 'a', steps: { account: { status: 'failed' } } },
        { user_id: 'b', steps: { account: { status: 'done' } } },
        { user_id: 'c', steps: {} },
      ],
    });
    expect(ids).toEqual(['a', 'c']);
  });

  it('ignores ids with no users row', () => {
    expect(pickCandidates({ links: [{ used_by: 'gone', submitted_user_id: null, user_id: null }], profiles: [], users: [], withSetup: [], stale: [] })).toEqual([]);
  });
});

describe('finishDue', () => {
  const MIN = 60_000;
  const born = Date.parse('2026-10-22T08:00:00Z');
  const at = (m: number) => new Date(born + m * MIN).toISOString();
  const row = (steps: any) => ({ user_id: 'radhika', created_at: at(0), steps });

  it('takes a made account whose Class Team step failed, once the wait is over', () => {
    const r = row({ account: { status: 'done' }, teams: { status: 'failed', at: at(3) } });
    expect(finishDue(r, born + 12 * MIN)).toBe(false);
    expect(finishDue(r, born + 13 * MIN)).toBe(true);
  });

  it('waits longer after each try, at most 6 hours', () => {
    const tried = (m: number) => row({ account: { status: 'done' }, teams: { status: 'failed', at: at(m) } });
    expect(finishDue(tried(40), born + 79 * MIN)).toBe(false);
    expect(finishDue(tried(40), born + 80 * MIN)).toBe(true);
    expect(finishDue(tried(2 * 24 * 60), born + (2 * 24 * 60 + 360) * MIN)).toBe(true);
  });

  it('leaves alone an account not made yet, or with nothing failed', () => {
    expect(finishDue(row({ account: { status: 'failed', at: at(1) } }), born + 999 * MIN)).toBe(false);
    expect(finishDue(row({ account: { status: 'done' }, teams: { status: 'done', at: at(1) } }), born + 999 * MIN)).toBe(false);
  });
});
