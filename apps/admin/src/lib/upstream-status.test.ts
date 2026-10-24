import { describe, it, expect } from 'vitest';
import { UPSTREAM_FAILED, upstreamStatus } from './upstream-status';

describe('upstreamStatus', () => {
  it('is 424, never a status Cloudflare swaps for its own page', () => {
    expect(UPSTREAM_FAILED).toBe(424);
  });

  it("keeps the service's own 4xx/5xx so the screen can tell a refusal from an outage", () => {
    expect(upstreamStatus(403)).toBe(403);
    expect(upstreamStatus(404)).toBe(404);
    expect(upstreamStatus(429)).toBe(429);
    expect(upstreamStatus(500)).toBe(500);
    expect(upstreamStatus(503)).toBe(503);
  });

  it('turns 502 and 504 into 424', () => {
    expect(upstreamStatus(502)).toBe(424);
    expect(upstreamStatus(504)).toBe(424);
  });

  it('turns a missing or non-error status into 424', () => {
    expect(upstreamStatus(undefined)).toBe(424);
    expect(upstreamStatus(0)).toBe(424);
    expect(upstreamStatus(200)).toBe(424);
  });
});
