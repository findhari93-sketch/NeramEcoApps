// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  daysLeft,
  formatPlanAmount,
  isIsoDate,
  matchesPlanFilter,
  planState,
  presetEndDate,
  todayIST,
  validateGivePlan,
} from './helpers';

const plan = (over: Partial<{ status: 'active' | 'revoked' | 'ended'; starts_on: string; ends_on: string }> = {}) => ({
  status: 'active' as const,
  starts_on: '2026-10-01',
  ends_on: '2027-08-31',
  ...over,
});

describe('date helpers', () => {
  it('todayIST uses India time, not UTC', () => {
    // 20:00 UTC on 14 Oct is 01:30 IST on 15 Oct.
    expect(todayIST(new Date('2026-10-14T20:00:00Z'))).toBe('2026-10-15');
    expect(todayIST(new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-14');
  });

  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('addMonths clamps to the last day of short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-10-15', 1)).toBe('2026-11-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('isIsoDate rejects impossible dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('presetEndDate', () => {
  it('trial is one calendar month', () => {
    expect(presetEndDate('trial', '2026-10-15')).toBe('2026-11-15');
  });

  it('season ends on 31 Aug of this year when the start is before it', () => {
    expect(presetEndDate('season', '2026-03-10')).toBe('2026-08-31');
    expect(presetEndDate('season', '2026-08-31')).toBe('2026-08-31');
  });

  it('season moves to next year once 31 Aug has passed', () => {
    expect(presetEndDate('season', '2026-09-01')).toBe('2027-08-31');
    expect(presetEndDate('season', '2026-10-15')).toBe('2027-08-31');
  });

  it('year runs 365 days, ending the day before the anniversary', () => {
    expect(presetEndDate('year', '2026-10-15')).toBe('2027-10-14');
  });
});

describe('daysLeft and planState', () => {
  it('counts days to the last day', () => {
    expect(daysLeft({ ends_on: '2026-10-20' }, '2026-10-15')).toBe(5);
    expect(daysLeft({ ends_on: '2026-10-15' }, '2026-10-15')).toBe(0);
    expect(daysLeft({ ends_on: '2026-10-14' }, '2026-10-15')).toBe(-1);
  });

  it('reads revoked and ended from the status first', () => {
    expect(planState(plan({ status: 'revoked' }), '2026-10-15')).toBe('revoked');
    expect(planState(plan({ status: 'ended' }), '2026-10-15')).toBe('ended');
  });

  it('treats an active plan past its end date as ended (the nightly job has not run yet)', () => {
    expect(planState(plan({ ends_on: '2026-10-14' }), '2026-10-15')).toBe('ended');
  });

  it('is scheduled before the start date', () => {
    expect(planState(plan({ starts_on: '2026-11-01' }), '2026-10-15')).toBe('scheduled');
  });

  it('is expiring within 30 days of the end, active otherwise', () => {
    expect(planState(plan({ ends_on: '2026-11-14' }), '2026-10-15')).toBe('expiring');
    expect(planState(plan({ ends_on: '2026-11-15' }), '2026-10-15')).toBe('active');
    expect(planState(plan({ ends_on: '2026-10-15' }), '2026-10-15')).toBe('expiring');
  });
});

describe('matchesPlanFilter', () => {
  const today = '2026-10-15';
  it('Active includes scheduled and expiring plans', () => {
    expect(matchesPlanFilter(plan(), 'active', today)).toBe(true);
    expect(matchesPlanFilter(plan({ starts_on: '2026-12-01' }), 'active', today)).toBe(true);
    expect(matchesPlanFilter(plan({ ends_on: '2026-10-20' }), 'active', today)).toBe(true);
    expect(matchesPlanFilter(plan({ status: 'ended' }), 'active', today)).toBe(false);
  });

  it('Expiring uses the given window', () => {
    expect(matchesPlanFilter(plan({ ends_on: '2026-11-10' }), 'expiring', today)).toBe(true);
    expect(matchesPlanFilter(plan({ ends_on: '2026-11-10' }), 'expiring', today, 7)).toBe(false);
    expect(matchesPlanFilter(plan({ status: 'revoked', ends_on: '2026-10-20' }), 'expiring', today)).toBe(false);
  });

  it('Ended and Revoked match their state, All matches everything', () => {
    expect(matchesPlanFilter(plan({ status: 'ended' }), 'ended', today)).toBe(true);
    expect(matchesPlanFilter(plan({ status: 'revoked' }), 'revoked', today)).toBe(true);
    expect(matchesPlanFilter(plan({ status: 'revoked' }), 'all', today)).toBe(true);
  });
});

describe('validateGivePlan', () => {
  const today = '2026-10-15';
  const base = { college_id: 'c1', tier: 'gold', starts_on: '2026-10-15', ends_on: '2027-08-31', amount: 0, notes: ' Pilot ' };

  it('accepts a free pilot and trims the note', () => {
    const r = validateGivePlan(base, today);
    expect(r).toEqual({
      ok: true,
      value: { college_id: 'c1', tier: 'gold', starts_on: '2026-10-15', ends_on: '2027-08-31', amount: 0, notes: 'Pilot' },
    });
  });

  it('defaults the start date to today and the amount to 0', () => {
    const r = validateGivePlan({ college_id: 'c1', tier: 'silver', ends_on: '2026-12-01' }, today);
    expect(r.ok && r.value.starts_on).toBe(today);
    expect(r.ok && r.value.amount).toBe(0);
  });

  it('refuses bad input with a plain message', () => {
    expect(validateGivePlan({ ...base, tier: 'free' }, today).ok).toBe(false);
    expect(validateGivePlan({ ...base, college_id: '' }, today).ok).toBe(false);
    expect(validateGivePlan({ ...base, ends_on: '2026-10-01', starts_on: '2026-09-01' }, today)).toEqual({
      ok: false,
      error: 'End date is in the past.',
    });
    expect(validateGivePlan({ ...base, ends_on: '2026-10-14' }, today).ok).toBe(false);
    expect(validateGivePlan({ ...base, amount: -5 }, today).ok).toBe(false);
  });
});

describe('formatPlanAmount', () => {
  it('shows Free trial for 0 and rupees otherwise', () => {
    expect(formatPlanAmount(0)).toBe('Free trial');
    expect(formatPlanAmount(null)).toBe('Free trial');
    expect(formatPlanAmount('40000')).toBe('Rs 40,000');
    expect(formatPlanAmount(150000)).toBe('Rs 1,50,000');
  });
});
