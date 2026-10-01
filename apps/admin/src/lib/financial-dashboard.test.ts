// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildFinancialDashboardResponse, monthLabel, previousPeriod } from './financial-dashboard';

describe('previousPeriod', () => {
  it('is the same number of days immediately before the start, as the old route computed it', () => {
    // 2026-09-01..2026-09-30 is 29 days apart, so the previous period starts 29 days earlier.
    expect(previousPeriod('2026-09-01', '2026-09-30')).toEqual({ prevStart: '2026-08-03', prevEnd: '2026-08-31' });
    expect(previousPeriod('2026-10-01', '2026-10-01')).toEqual({ prevStart: '2026-10-01', prevEnd: '2026-09-30' });
  });
});

describe('monthLabel', () => {
  it('formats the first of a month like the old toLocaleString call', () => {
    expect(monthLabel('2026-09-01')).toBe(new Date(Date.UTC(2026, 8, 1)).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }));
  });
});

describe('buildFinancialDashboardResponse', () => {
  const raw = {
    student_fee_income: '10000.00',
    side_income: 700,
    total_expenses: '4000.00',
    highest_single_expense: 2500,
    category_breakdown: { rent: '1500.00', travel: 2500 },
    prev_fee_income: 2000,
    prev_side_income: 200,
    prev_expenses: 300,
    prev_category_breakdown: { rent: 300 },
    student_count: 83,
    monthly: [
      { month_start: '2026-08-01', fee_income: 0, side_income: 200, expenses: 300 },
      { month_start: '2026-09-01', fee_income: '10000', side_income: 700, expenses: 4000 },
    ],
    top_assignment: { title: 'Drive', staff_name: 'Ravi', total: '3500.00' },
  };

  it('keeps the exact response shape and the old rounding rules', () => {
    const out = buildFinancialDashboardResponse(raw);
    const totalIncome = 10700;
    expect(out.summary).toEqual({
      total_income: totalIncome,
      student_fee_income: 10000,
      side_income: 700,
      total_expenses: 4000,
      net_profit: 6700,
      profit_margin: Math.round(((6700 / totalIncome) * 100) * 10) / 10,
      expense_per_student: Math.round(4000 / 83),
      income_per_student: Math.round(totalIncome / 83),
      mom_change: Math.round((((totalIncome - 2200) / 2200) * 100) * 10) / 10,
      student_count: 83,
    });
    expect(out.category_breakdown).toEqual({ rent: 1500, travel: 2500 });
    expect(out.prev_category_breakdown).toEqual({ rent: 300 });
    expect(out.monthly_series).toEqual([
      { month: monthLabel('2026-08-01'), income: 200, expenses: 300 },
      { month: monthLabel('2026-09-01'), income: 10700, expenses: 4000 },
    ]);
    expect(out.insights).toEqual({
      highest_single_expense: 2500,
      top_assignment: { title: 'Drive', staff_name: 'Ravi', total: 3500 },
    });
  });

  it('returns zeros, not NaN, for an empty period and no students', () => {
    const out = buildFinancialDashboardResponse({});
    expect(out.summary).toEqual({
      total_income: 0,
      student_fee_income: 0,
      side_income: 0,
      total_expenses: 0,
      net_profit: 0,
      profit_margin: 0,
      expense_per_student: 0,
      income_per_student: 0,
      mom_change: 0,
      student_count: 0,
    });
    expect(out.monthly_series).toEqual([]);
    expect(out.insights.top_assignment).toBeNull();
  });
});
