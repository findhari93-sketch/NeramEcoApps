import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => null, tokenReady: false }) }));

import { SWEEP_EVERY_MS, shouldSweep } from './useDraftSweep';

describe('shouldSweep', () => {
  it('sweeps when it never has, or when the last one was long enough ago', () => {
    expect(shouldSweep(1_000_000, null)).toBe(true);
    expect(shouldSweep(1_000_000, 'garbage')).toBe(true);
    expect(shouldSweep(1_000_000 + SWEEP_EVERY_MS, '1000000')).toBe(true);
  });
  it('waits when the last sweep was recent', () => {
    expect(shouldSweep(1_000_000 + 5_000, '1000000')).toBe(false);
  });
});
