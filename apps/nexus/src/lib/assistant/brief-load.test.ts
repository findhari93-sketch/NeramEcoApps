// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { istDateOf } from './brief-load';

describe('istDateOf', () => {
  it('reads a due time just after midnight IST as the IST date, not the UTC one', () => {
    expect(istDateOf('2026-10-05T19:00:00Z')).toBe('2026-10-06');
  });

  it('keeps a mid-day due time on its own date', () => {
    expect(istDateOf('2026-10-05T06:30:00Z')).toBe('2026-10-05');
  });
});
