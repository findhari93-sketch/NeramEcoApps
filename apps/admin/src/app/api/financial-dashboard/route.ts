// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // 1. Get all financial transactions in date range
    const { data: transactions } = await supabase
      .from('financial_transactions')
      .select('type, category, amount, transaction_date')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    // 2. Get student fee income from payments table
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, created_at')
      .eq('status', 'paid')
      .gte('created_at', startDate + 'T00:00:00Z')
      .lte('created_at', endDate + 'T23:59:59Z');

    const studentFeeIncome = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);

    // 3. Calculate totals
    let totalExpenses = 0;
    let totalSideIncome = 0;
    const categoryBreakdown: Record<string, number> = {};
    let highestSingleExpense = 0;

    for (const txn of transactions || []) {
      const amt = Number(txn.amount);
      if (txn.type === 'expense') {
        totalExpenses += amt;
        categoryBreakdown[txn.category] = (categoryBreakdown[txn.category] || 0) + amt;
        if (amt > highestSingleExpense) highestSingleExpense = amt;
      } else {
        totalSideIncome += amt;
      }
    }

    const totalIncome = studentFeeIncome + totalSideIncome;
    const netProfit = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    // 4. Get student count for per-student metrics
    const { count: studentCount } = await supabase
      .from('student_profiles')
      .select('id', { count: 'exact', head: true });

    const expensePerStudent = (studentCount && studentCount > 0) ? totalExpenses / studentCount : 0;
    const incomePerStudent = (studentCount && studentCount > 0) ? totalIncome / studentCount : 0;

    // 5. Monthly series (last 6 months)
    const monthlySeries: Array<{ month: string; income: number; expenses: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthLabel = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });

      const { data: mTxns } = await supabase
        .from('financial_transactions')
        .select('type, amount')
        .gte('transaction_date', mStart)
        .lte('transaction_date', mEnd);

      let mExpenses = 0;
      let mSideIncome = 0;
      for (const t of mTxns || []) {
        if (t.type === 'expense') mExpenses += Number(t.amount);
        else mSideIncome += Number(t.amount);
      }

      const { data: mPayments } = await supabase
        .from('payments')
        .select('amount')
        .eq('status', 'paid')
        .gte('created_at', mStart + 'T00:00:00Z')
        .lte('created_at', mEnd + 'T23:59:59Z');

      const mFeeIncome = (mPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);

      monthlySeries.push({ month: monthLabel, income: mFeeIncome + mSideIncome, expenses: mExpenses });
    }

    // 6. Previous period for comparison
    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const prevStart = new Date(start.getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: prevTxns } = await supabase
      .from('financial_transactions')
      .select('type, category, amount')
      .gte('transaction_date', prevStart)
      .lte('transaction_date', prevEnd);

    let prevExpenses = 0;
    let prevSideIncome = 0;
    const prevCategoryBreakdown: Record<string, number> = {};
    for (const txn of prevTxns || []) {
      const amt = Number(txn.amount);
      if (txn.type === 'expense') {
        prevExpenses += amt;
        prevCategoryBreakdown[txn.category] = (prevCategoryBreakdown[txn.category] || 0) + amt;
      } else {
        prevSideIncome += amt;
      }
    }

    const { data: prevPayments } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'paid')
      .gte('created_at', prevStart + 'T00:00:00Z')
      .lte('created_at', prevEnd + 'T23:59:59Z');

    const prevFeeIncome = (prevPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const prevTotalIncome = prevFeeIncome + prevSideIncome;
    const momChange = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : 0;

    // 7. Top assignment by spend
    const { data: topAssignment } = await supabase
      .from('financial_transactions')
      .select('assignment_id, amount')
      .not('assignment_id', 'is', null)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    const assignmentTotals: Record<string, number> = {};
    for (const t of topAssignment || []) {
      assignmentTotals[t.assignment_id] = (assignmentTotals[t.assignment_id] || 0) + Number(t.amount);
    }
    let topAssignmentId = '';
    let topAssignmentAmount = 0;
    for (const [id, amt] of Object.entries(assignmentTotals)) {
      if (amt > topAssignmentAmount) { topAssignmentId = id; topAssignmentAmount = amt; }
    }

    let topAssignmentInfo = null;
    if (topAssignmentId) {
      const { data: aInfo } = await supabase
        .from('expense_assignments')
        .select('title, staff_name')
        .eq('id', topAssignmentId)
        .single();
      topAssignmentInfo = aInfo ? { ...aInfo, total: topAssignmentAmount } : null;
    }

    return NextResponse.json({
      summary: {
        total_income: totalIncome,
        student_fee_income: studentFeeIncome,
        side_income: totalSideIncome,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        profit_margin: Math.round(profitMargin * 10) / 10,
        expense_per_student: Math.round(expensePerStudent),
        income_per_student: Math.round(incomePerStudent),
        mom_change: Math.round(momChange * 10) / 10,
        student_count: studentCount || 0,
      },
      category_breakdown: categoryBreakdown,
      prev_category_breakdown: prevCategoryBreakdown,
      monthly_series: monthlySeries,
      insights: {
        highest_single_expense: highestSingleExpense,
        top_assignment: topAssignmentInfo,
      },
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
