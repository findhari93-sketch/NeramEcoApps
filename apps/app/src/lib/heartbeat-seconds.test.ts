// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { MAX_HEARTBEAT_SECONDS, sanitizeHeartbeatSeconds } from './heartbeat-seconds';

/**
 * The tracker now batches up to 5 minutes per send (plus hide/pagehide
 * flushes), so the route takes whatever was counted, but never trusts it
 * blindly: the number comes from the browser and is added to a running total.
 */
describe('sanitizeHeartbeatSeconds', () => {
  it('passes a normal 5 minute batch through', () => {
    expect(sanitizeHeartbeatSeconds(300)).toBe(300);
    expect(sanitizeHeartbeatSeconds(42)).toBe(42);
  });

  it('clamps a batch that is longer than any real interval', () => {
    expect(MAX_HEARTBEAT_SECONDS).toBeGreaterThanOrEqual(300);
    expect(sanitizeHeartbeatSeconds(86_400)).toBe(MAX_HEARTBEAT_SECONDS);
  });

  it('turns junk into 0', () => {
    expect(sanitizeHeartbeatSeconds(-5)).toBe(0);
    expect(sanitizeHeartbeatSeconds(Number.NaN)).toBe(0);
    expect(sanitizeHeartbeatSeconds(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeHeartbeatSeconds('300')).toBe(300);
    expect(sanitizeHeartbeatSeconds('lots')).toBe(0);
    expect(sanitizeHeartbeatSeconds(null)).toBe(0);
    expect(sanitizeHeartbeatSeconds(undefined)).toBe(0);
    expect(sanitizeHeartbeatSeconds({})).toBe(0);
  });

  it('rounds down to whole seconds', () => {
    expect(sanitizeHeartbeatSeconds(12.9)).toBe(12);
  });
});
