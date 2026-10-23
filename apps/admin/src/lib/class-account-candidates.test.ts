import { describe, it, expect } from 'vitest';
import { pickCandidates } from './class-account-candidates';

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
