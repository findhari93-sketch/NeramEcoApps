import { describe, it, expect } from 'vitest';
import { buildContinuousMonths, type PerformanceTrendMonth } from './PerformanceTrendChart';

/**
 * A month with zero attempts must read as a GAP in the trend, not as a 0%
 * score. The backend only ever sends months that had at least one attempt,
 * so this is the function that fills in the silent months in between and
 * marks them null, which is what makes the chart able to break its line there
 * instead of drawing a plunge to the floor and back.
 */

const month = (m: string, attempts: number, pct: number | null): PerformanceTrendMonth => ({
  month: m,
  label: m,
  attempts,
  average_pct: pct,
});

describe('buildContinuousMonths', () => {
  it('fills a silent month in between with a null (gap) entry', () => {
    const out = buildContinuousMonths([month('2026-06', 3, 70), month('2026-08', 2, 90)]);
    expect(out.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(out[1]).toMatchObject({ month: '2026-07', attempts: 0, average_pct: null });
  });

  it('crosses a year boundary without losing continuity', () => {
    const out = buildContinuousMonths([month('2025-11', 1, 60), month('2026-01', 1, 80)]);
    expect(out.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('returns the months as-is, in order, when there is no gap', () => {
    const out = buildContinuousMonths([month('2026-07', 2, 75), month('2026-08', 1, 82)]);
    expect(out.map((m) => m.month)).toEqual(['2026-07', '2026-08']);
    expect(out.every((m) => m.average_pct != null)).toBe(true);
  });

  it('is empty for no data, rather than throwing', () => {
    expect(buildContinuousMonths([])).toEqual([]);
  });

  it('handles a single month with no range to fill', () => {
    const out = buildContinuousMonths([month('2026-08', 4, 88)]);
    expect(out).toHaveLength(1);
    expect(out[0].month).toBe('2026-08');
  });

  it('is tolerant of unsorted input, since the backend already sorts newest-first', () => {
    const out = buildContinuousMonths([month('2026-08', 2, 90), month('2026-06', 3, 70)]);
    expect(out.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
  });
});
