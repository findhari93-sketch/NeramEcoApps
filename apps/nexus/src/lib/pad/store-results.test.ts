import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  meta: vi.fn(),
  promptSession: vi.fn(),
  roster: vi.fn(),
}));

vi.mock('./sessions', () => ({
  padDb: () => ({ rpc: mocks.rpc }),
  loadSessionMeta: mocks.meta,
  loadPromptSessionId: mocks.promptSession,
  rosterIds: mocks.roster,
}));

import { storeRoundResults, storeRoundResultsForPrompt } from './store-results';

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { ok: true, stored: 3 }, error: null });
  mocks.meta.mockReset().mockResolvedValue({ id: 's1', classroom_id: 'room', batch_id: null, status: 'ended' });
  mocks.promptSession.mockReset().mockResolvedValue('s1');
  mocks.roster.mockReset().mockResolvedValue(['a', 'b', 'c']);
});

describe('storeRoundResults', () => {
  it('stores the round against the class roster', async () => {
    await storeRoundResults('s1', 't1');
    expect(mocks.rpc).toHaveBeenCalledWith('pad_store_round_results', { p_actor: 't1', p_session: 's1', p_roster: ['a', 'b', 'c'] });
  });

  it('never throws: the teacher action already succeeded', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(storeRoundResults('s1', 't1')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('storeRoundResultsForPrompt', () => {
  it('stores again after a change to a question of an ended round', async () => {
    await storeRoundResultsForPrompt('p1', 't1');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('costs nothing while the round is still running', async () => {
    mocks.meta.mockResolvedValue({ id: 's1', classroom_id: 'room', batch_id: null, status: 'live' });
    await storeRoundResultsForPrompt('p1', 't1');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
