import { describe, it, expect } from 'vitest';
import { effectiveTier, istToday } from './plan';

describe('effectiveTier', () => {
  const today = '2026-10-15';

  it('keeps a paid tier inside its dates', () => {
    expect(effectiveTier({ neram_tier: 'gold', tier_start_date: '2026-04-18', tier_end_date: '2027-04-18' }, today)).toBe('gold');
    expect(effectiveTier({ neram_tier: 'silver', tier_start_date: today, tier_end_date: today }, today)).toBe('silver');
  });

  it('drops an ended plan to free', () => {
    expect(effectiveTier({ neram_tier: 'platinum', tier_start_date: '2025-01-01', tier_end_date: '2026-10-14' }, today)).toBe('free');
  });

  it('does not switch on a plan before it starts', () => {
    expect(effectiveTier({ neram_tier: 'gold', tier_start_date: '2026-11-01', tier_end_date: '2027-11-01' }, today)).toBe('free');
  });

  it('treats unknown or missing tiers as free', () => {
    expect(effectiveTier({ neram_tier: 'tier-1' }, today)).toBe('free');
    expect(effectiveTier({ neram_tier: null }, today)).toBe('free');
    expect(effectiveTier({}, today)).toBe('free');
  });

  it('keeps a paid tier with no dates (older rows)', () => {
    expect(effectiveTier({ neram_tier: 'gold' }, today)).toBe('gold');
  });
});

describe('istToday', () => {
  it('rolls over at midnight India time, not UTC', () => {
    expect(istToday(new Date('2026-10-14T18:29:00Z'))).toBe('2026-10-14');
    expect(istToday(new Date('2026-10-14T18:31:00Z'))).toBe('2026-10-15');
  });
});
