import { describe, expect, it } from 'vitest';
import { buildRoi, furthestStage, istMonth, monthsBetween, phone10, phoneVariants, validateSpendInput, type RoiPerson } from './roi';

const person = (over: Partial<RoiPerson> = {}): RoiPerson => ({
  userId: 'u1',
  name: 'Asha',
  phone10: '9876543210',
  tier: 'confirmed',
  cohortMonth: '2026-10',
  demoBooked: false,
  demoAttended: false,
  joined: false,
  feesPaid: 0,
  ...over,
});

describe('helpers', () => {
  it('reads the month in IST, so 31 Oct 20:00 UTC is November', () => {
    expect(istMonth('2026-10-31T20:00:00Z')).toBe('2026-11');
    expect(istMonth('2026-10-31T18:00:00Z')).toBe('2026-10');
  });
  it('keeps the last 10 digits of a phone and refuses short ones', () => {
    expect(phone10('+91 98765-43210')).toBe('9876543210');
    expect(phone10('9876543210')).toBe('9876543210');
    expect(phone10('12345')).toBeNull();
    expect(phone10(null)).toBeNull();
    expect(phoneVariants('9876543210')).toEqual(['9876543210', '+919876543210', '919876543210']);
  });
  it('lists months across a year end', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
  it('names the furthest stage reached', () => {
    expect(furthestStage(person())).toBe('signed_up');
    expect(furthestStage(person({ demoBooked: true }))).toBe('demo_booked');
    expect(furthestStage(person({ demoBooked: true, demoAttended: true }))).toBe('demo_attended');
    expect(furthestStage(person({ joined: true }))).toBe('joined');
  });
});

describe('buildRoi', () => {
  const months = ['2026-09', '2026-10'];

  it('credits each person to their cohort month and keeps the two tiers apart', () => {
    const report = buildRoi(
      [
        person({ userId: 'a', demoBooked: true, demoAttended: true, joined: true, feesPaid: 25000 }),
        person({ userId: 'b', tier: 'said_google_ad', demoBooked: true, feesPaid: 0 }),
        person({ userId: 'c', cohortMonth: '2026-09' }),
      ],
      { '2026-10': { amount: 5000, source: 'manual' } },
      { '2026-10': 7 },
      months,
    );
    const oct = report.months.find((m) => m.month === '2026-10')!;
    expect(oct.signups).toEqual({ confirmed: 1, said_google_ad: 1 });
    expect(oct.demosBooked).toEqual({ confirmed: 1, said_google_ad: 1 });
    expect(oct.demosAttended).toEqual({ confirmed: 1, said_google_ad: 0 });
    expect(oct.joined).toEqual({ confirmed: 1, said_google_ad: 0 });
    expect(oct.fees).toEqual({ confirmed: 25000, said_google_ad: 0 });
    expect(oct.returnPerRupee).toEqual({ confirmed: 5, withSaid: 5 });
    expect(oct.spendSource).toBe('manual');
    expect(oct.alsoSaidGoogle).toBe(7);
    expect(oct.people.map((p) => p.stage)).toEqual(['joined', 'demo_booked']);
    expect(oct.people[0].phoneLast4).toBe('3210');
    expect(report.total.signups).toEqual({ confirmed: 2, said_google_ad: 1 });
    expect(report.total.spend).toBe(5000);
  });

  it('never divides by zero: no spend means no return figure', () => {
    const report = buildRoi([person({ feesPaid: 1000 })], { '2026-10': { amount: 0, source: 'manual' } }, {}, months);
    const oct = report.months.find((m) => m.month === '2026-10')!;
    expect(oct.spend).toBeNull();
    expect(oct.spendSource).toBeNull();
    expect(oct.returnPerRupee).toBeNull();
    expect(report.total.returnPerRupee).toBeNull();
  });

  it('lists each person with the stages they actually reached, so a drawer matches its count', () => {
    const report = buildRoi([person({ joined: true, feesPaid: 0 })], {}, {}, months);
    const view = report.months[1].people[0];
    expect(view).toMatchObject({ stage: 'joined', demoBooked: false, demoAttended: false, joined: true, feesPaid: 0 });
    expect(report.months[1].demosBooked.confirmed).toBe(0);
  });

  it('works out the total return only from months with spend entered', () => {
    const report = buildRoi(
      [person({ cohortMonth: '2026-09', feesPaid: 0 }), person({ userId: 'b', cohortMonth: '2026-10', feesPaid: 5000 })],
      { '2026-09': { amount: 1000, source: 'manual' } },
      {},
      months,
    );
    expect(report.total.fees.confirmed).toBe(5000);
    expect(report.total.returnPerRupee).toEqual({ confirmed: 0, withSaid: 0 });
  });

  it('ignores people outside the report window', () => {
    const report = buildRoi([person({ cohortMonth: '2025-12' })], {}, {}, months);
    expect(report.total.signups).toEqual({ confirmed: 0, said_google_ad: 0 });
  });
});

describe('validateSpendInput', () => {
  it('accepts a past month with a sane amount, or null to clear', () => {
    expect(validateSpendInput('2026-10', 6480, '2026-10')).toBeNull();
    expect(validateSpendInput('2026-10', null, '2026-10')).toBeNull();
  });
  it('refuses bad months and amounts', () => {
    expect(validateSpendInput('2026-11', 100, '2026-10')).toMatch(/future/);
    expect(validateSpendInput('2025-12', 100, '2026-10')).toMatch(/2026-01/);
    expect(validateSpendInput('2026-13', 100, '2026-10')).toMatch(/YYYY-MM/);
    expect(validateSpendInput('2026-10', -1, '2026-10')).toMatch(/amount/);
    expect(validateSpendInput('2026-10', 2_000_000, '2026-10')).toMatch(/amount/);
    expect(validateSpendInput('2026-10', '500', '2026-10')).toMatch(/amount/);
  });
});
