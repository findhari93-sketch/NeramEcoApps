import { describe, expect, it } from 'vitest';
import { blockedMessage } from './useAutoDraft';

describe('blockedMessage', () => {
  it('names the feature switch when the flag is off', () => {
    expect(blockedMessage(null, false)).toEqual({
      phase: 'off',
      message: 'Gemini drafts are switched off. An admin can turn them on in Features.',
    });
    expect(blockedMessage('flag_off').phase).toBe('off');
  });

  it('treats a spent daily budget as a budget, not a switch', () => {
    const b = blockedMessage('daily_cap');
    expect(b.phase).toBe('budget');
    expect(b.message).toMatch(/Today's Gemini budget is used up/);
  });

  it('says month when the monthly cap is the reason', () => {
    expect(blockedMessage('monthly_cap').message).toMatch(/This month's/);
  });

  it('offers a retry for a temporary Gemini limit, not a switch', () => {
    const b = blockedMessage('rate_limited');
    expect(b.phase).toBe('failed');
    expect(b.message).toMatch(/busy right now/);
  });

  it('points at AI usage when the mode is off', () => {
    expect(blockedMessage('feature_off').message).toMatch(/AI usage/);
  });

  it('never uses a dash in what the teacher reads', () => {
    for (const reason of [null, 'flag_off', 'daily_cap', 'monthly_cap', 'feature_off', 'master_off']) {
      expect(blockedMessage(reason).message).not.toMatch(/—|--/);
    }
  });
});
