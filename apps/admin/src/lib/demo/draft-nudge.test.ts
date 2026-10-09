import { afterEach, describe, expect, it, vi } from 'vitest';

const claim = vi.fn();
const send = vi.fn();
vi.mock('@neram/database', () => ({
  claimDraftsForDemoNudge: (...a: unknown[]) => claim(...a),
  sendApplyDraftDemoNudge: (...a: unknown[]) => send(...a),
}));

import { inDraftNudgeHours, sendApplyDraftDemoNudges } from './draft-nudge';

// 06:00 UTC = 11:30 IST (inside), 14:00 UTC = 19:30 IST (outside).
const DAY = new Date('2026-10-08T06:00:00Z');
const NIGHT = new Date('2026-10-08T14:00:00Z');

afterEach(() => {
  vi.unstubAllEnvs();
  claim.mockReset();
  send.mockReset();
});

describe('inDraftNudgeHours', () => {
  it('is 10:00 to 19:00 in India', () => {
    expect(inDraftNudgeHours(new Date('2026-10-08T04:29:00Z'))).toBe(false); // 09:59 IST
    expect(inDraftNudgeHours(new Date('2026-10-08T04:30:00Z'))).toBe(true); // 10:00 IST
    expect(inDraftNudgeHours(new Date('2026-10-08T13:29:00Z'))).toBe(true); // 18:59 IST
    expect(inDraftNudgeHours(new Date('2026-10-08T13:30:00Z'))).toBe(false); // 19:00 IST
  });
});

describe('sendApplyDraftDemoNudges', () => {
  it('does nothing unless the flag is on', async () => {
    const r = await sendApplyDraftDemoNudges(DAY);
    expect(r).toEqual({ enabled: false, sent: 0, failed: 0 });
    expect(claim).not.toHaveBeenCalled();
  });

  it('does nothing at night even with the flag on', async () => {
    vi.stubEnv('APPLY_DRAFT_DEMO_NUDGE', 'on');
    await sendApplyDraftDemoNudges(NIGHT);
    expect(claim).not.toHaveBeenCalled();
  });

  it('sends one message per claimed draft and counts failures', async () => {
    vi.stubEnv('APPLY_DRAFT_DEMO_NUDGE', 'on');
    claim.mockResolvedValue([
      { leadProfileId: 'a', userId: 'u1', phone: '919876543210', name: 'Priya' },
      { leadProfileId: 'b', userId: 'u2', phone: '919800000001', name: 'there' },
    ]);
    send.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'WA_X' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await sendApplyDraftDemoNudges(DAY);
    expect(r).toEqual({ enabled: true, sent: 1, failed: 1 });
    expect(send).toHaveBeenCalledWith('919876543210', 'Priya');
    expect(claim).toHaveBeenCalledWith({ now: DAY, limit: 20 });
  });
});
