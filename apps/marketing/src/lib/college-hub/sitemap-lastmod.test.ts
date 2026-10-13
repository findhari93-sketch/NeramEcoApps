import { describe, it, expect } from 'vitest';
import { COLLEGE_LASTMOD_FALLBACK, collegeLastModified, stateLastModified } from './sitemap-lastmod';

describe('collegeLastModified', () => {
  it('takes the newest of updated_at, last_data_update and faqs_generated_at', () => {
    expect(
      collegeLastModified({
        updated_at: '2026-10-01T00:00:00Z',
        last_data_update: '2026-08-01T00:00:00Z',
        faqs_generated_at: '2026-10-09T05:00:00Z',
      }).toISOString(),
    ).toBe('2026-10-09T05:00:00.000Z');
    expect(
      collegeLastModified({ updated_at: '2026-07-01T00:00:00Z', last_data_update: '2026-09-15T00:00:00Z' }).toISOString(),
    ).toBe('2026-09-15T00:00:00.000Z');
  });

  it('ignores bad dates and falls back only when nothing is usable', () => {
    expect(collegeLastModified({ updated_at: 'garbage', last_data_update: '2026-01-02T00:00:00Z' }).toISOString()).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    expect(collegeLastModified({})).toEqual(COLLEGE_LASTMOD_FALLBACK);
  });
});

describe('stateLastModified', () => {
  it('uses the newest college per state and skips rows without a state', () => {
    const m = stateLastModified([
      { state_slug: 'tamil-nadu', updated_at: '2026-05-01T00:00:00Z' },
      { state_slug: 'tamil-nadu', updated_at: '2026-09-01T00:00:00Z' },
      { state_slug: 'kerala', last_data_update: '2026-03-01T00:00:00Z' },
      { state_slug: null, updated_at: '2026-10-01T00:00:00Z' },
    ]);
    expect([...m.keys()].sort()).toEqual(['kerala', 'tamil-nadu']);
    expect(m.get('tamil-nadu')!.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(m.get('kerala')!.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});
