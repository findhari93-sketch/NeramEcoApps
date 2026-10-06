// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { aggregate, comparePeriods, dailySeries, derive, lastCompleteDayIST, median, pctChange, toTotals, windowEnding } from './metrics';
import { day } from './test-utils/rows';

describe('toTotals and derive', () => {
  it('converts micros to rupees once and derives the ratios', () => {
    const t = toTotals([day('campaign', '2026-10-01', { impressions: 1000, clicks: 50, cost: 2000, conversions: 4 })]);
    expect(t).toMatchObject({ impressions: 1000, clicks: 50, cost: 2000, conversions: 4 });
    expect(derive(t)).toEqual({ ctr: 5, cpc: 40, cpa: 500, convRate: 8, roas: null });
  });

  it('returns null, not zero or Infinity, when a denominator is zero', () => {
    expect(derive(toTotals([]))).toEqual({ ctr: null, cpc: null, cpa: null, convRate: null, roas: null });
  });

  it('pctChange has no baseline when the previous value is zero or missing', () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(null, 5)).toBeNull();
  });
});

describe('dates', () => {
  it('takes yesterday in IST as the last complete day', () => {
    // 20:00 UTC on the 6th is 01:30 IST on the 7th, so the last complete day is the 6th.
    expect(lastCompleteDayIST(new Date('2026-10-06T20:00:00Z'))).toBe('2026-10-06');
    expect(lastCompleteDayIST(new Date('2026-10-06T10:00:00Z'))).toBe('2026-10-05');
  });

  it('builds inclusive windows', () => {
    expect(windowEnding('2026-10-30', 7)).toEqual({ from: '2026-10-24', to: '2026-10-30', days: 7 });
  });
});

describe('aggregate', () => {
  it('sums per entity inside the window only and keeps the latest status', () => {
    const rows = [
      day('keyword', '2026-10-01', { entity_key: 'k', clicks: 5, cost: 100, status: 'ENABLED' }),
      day('keyword', '2026-10-02', { entity_key: 'k', clicks: 7, cost: 150, status: 'PAUSED' }),
      day('keyword', '2026-09-01', { entity_key: 'k', clicks: 99, cost: 999 }),
    ];
    const [a] = aggregate(rows, 'keyword', windowEnding('2026-10-02', 7));
    expect(a).toMatchObject({ key: 'k', clicks: 12, cost: 250, status: 'PAUSED' });
  });
});

describe('comparePeriods and dailySeries', () => {
  it('compares the window with the one before it', () => {
    const rows = [day('campaign', '2026-10-10', { cost: 1000, conversions: 2, clicks: 20 }), day('campaign', '2026-10-03', { cost: 500, conversions: 2, clicks: 10 })];
    const c = comparePeriods(rows, '2026-10-10', 7);
    expect(c.current.cpa).toBe(500);
    expect(c.previous.cpa).toBe(250);
    expect(c.change.cpa).toBe(100);
  });

  it('fills days with no rows as zero', () => {
    const s = dailySeries([day('campaign', '2026-10-02', { cost: 10 })], windowEnding('2026-10-03', 3));
    expect(s.map((d) => d.cost)).toEqual([0, 10, 0]);
  });

  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
