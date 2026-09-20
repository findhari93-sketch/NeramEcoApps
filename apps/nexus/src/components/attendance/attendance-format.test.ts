import { afterEach, describe, expect, it, vi } from 'vitest';
import { istRange } from './attendance-format';

/**
 * Regression coverage for the double-counted IST offset: `istRange` used to
 * add the browser's own `getTimezoneOffset()` on top of the fixed +05:30
 * shift. For a machine whose local zone IS IST, the two cancelled and the
 * date came back as the UTC calendar date, which is "yesterday" for anyone
 * opening the page between IST midnight and 5:29 AM.
 */
describe('istRange', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reads the IST calendar date in the small hours, not yesterday in UTC', () => {
    // 2026-09-16 01:00 IST is 2026-09-15T19:30:00Z. Pretending the host's own
    // local zone is IST (offset -330) reproduces the exact bug: under the old
    // arithmetic, 330 + (-330) is 0, the instant is never shifted, and
    // toISOString reads off "2026-09-15", a full day behind.
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-330);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T19:30:00.000Z'));

    const { to } = istRange(30);

    expect(to).toBe('2026-09-16');
  });

  it('reads the IST calendar date in the afternoon too', () => {
    // 2026-09-16 15:00 IST is 2026-09-16T09:30:00Z, well clear of the bug's
    // midnight-to-5:29-AM window, so both the old and new arithmetic should
    // already agree here; this is the control case.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T09:30:00.000Z'));

    const { to } = istRange(30);

    expect(to).toBe('2026-09-16');
  });

  it('keeps from and to the requested number of days apart', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T09:30:00.000Z'));

    const { from, to } = istRange(14);

    expect(to).toBe('2026-09-16');
    expect(from).toBe('2026-09-02');
  });
});
