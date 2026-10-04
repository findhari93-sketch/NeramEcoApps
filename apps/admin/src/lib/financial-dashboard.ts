/**
 * The Financial Dashboard response, built from one SQL call.
 *
 * The route used to run 16 sequential queries (two per month for six months, plus
 * the period, the previous period and the top assignment) and sum amounts in JS
 * from unpaged selects, which stop at PostgREST's 1,000-row ceiling. The sums now
 * happen in financial_dashboard_summary (migration 20261026090000); this module
 * only does the arithmetic the page shows, with the same rounding as before.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The comparison window: the same number of days, ending the day before `startDate`. */
export function previousPeriod(startDate: string, endDate: string): { prevStart: string; prevEnd: string } {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const periodDays = Math.ceil((end.getTime() - start.getTime()) / DAY_MS);
  return {
    prevStart: new Date(start.getTime() - periodDays * DAY_MS).toISOString().split('T')[0],
    prevEnd: new Date(start.getTime() - DAY_MS).toISOString().split('T')[0],
  };
}

/** "Sep 26" for '2026-09-01', matching the old `toLocaleString('en-IN', { month: 'short', year: '2-digit' })`. */
export function monthLabel(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString('en-IN', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

function numberMap(obj: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) out[k] = num(v);
  return out;
}

export interface FinancialDashboardResponse {
  summary: {
    total_income: number;
    student_fee_income: number;
    side_income: number;
    total_expenses: number;
    net_profit: number;
    profit_margin: number;
    expense_per_student: number;
    income_per_student: number;
    mom_change: number;
    student_count: number;
  };
  category_breakdown: Record<string, number>;
  prev_category_breakdown: Record<string, number>;
  monthly_series: Array<{ month: string; income: number; expenses: number }>;
  insights: {
    highest_single_expense: number;
    top_assignment: { title: string; staff_name: string; total: number } | null;
  };
}

/** Map the RPC payload to the response the Financial Dashboard page reads. */
export function buildFinancialDashboardResponse(raw: any): FinancialDashboardResponse {
  const r = raw && typeof raw === 'object' ? raw : {};
  const studentFeeIncome = num(r.student_fee_income);
  const sideIncome = num(r.side_income);
  const totalExpenses = num(r.total_expenses);
  const studentCount = num(r.student_count);

  const totalIncome = studentFeeIncome + sideIncome;
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
  const expensePerStudent = studentCount > 0 ? totalExpenses / studentCount : 0;
  const incomePerStudent = studentCount > 0 ? totalIncome / studentCount : 0;

  const prevTotalIncome = num(r.prev_fee_income) + num(r.prev_side_income);
  const momChange = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0;

  const monthly = Array.isArray(r.monthly) ? r.monthly : [];
  const top = r.top_assignment;

  return {
    summary: {
      total_income: totalIncome,
      student_fee_income: studentFeeIncome,
      side_income: sideIncome,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      profit_margin: Math.round(profitMargin * 10) / 10,
      expense_per_student: Math.round(expensePerStudent),
      income_per_student: Math.round(incomePerStudent),
      mom_change: Math.round(momChange * 10) / 10,
      student_count: studentCount,
    },
    category_breakdown: numberMap(r.category_breakdown),
    prev_category_breakdown: numberMap(r.prev_category_breakdown),
    monthly_series: monthly.map((m: any) => ({
      month: monthLabel(String(m.month_start)),
      income: num(m.fee_income) + num(m.side_income),
      expenses: num(m.expenses),
    })),
    insights: {
      highest_single_expense: num(r.highest_single_expense),
      top_assignment:
        top && typeof top === 'object'
          ? { title: top.title, staff_name: top.staff_name, total: num(top.total) }
          : null,
    },
  };
}
