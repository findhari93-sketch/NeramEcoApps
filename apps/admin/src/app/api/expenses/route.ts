// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const category = searchParams.get('category') || undefined;
    const assignmentId = searchParams.get('assignmentId') || undefined;
    const settlementStatus = searchParams.get('settlementStatus') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('financial_transactions')
      .select(`
        *,
        assignment:expense_assignments(id, title, staff_name)
      `, { count: 'exact' });

    if (type) query = query.eq('type', type);
    if (category) query = query.eq('category', category);
    if (assignmentId) query = query.eq('assignment_id', assignmentId);
    if (settlementStatus) query = query.eq('settlement_status', settlementStatus);
    if (startDate) query = query.gte('transaction_date', startDate);
    if (endDate) query = query.lte('transaction_date', endDate);
    if (search) query = query.ilike('description', `%${search}%`);

    query = query.order('transaction_date', { ascending: false }).range(offset, offset + limit - 1);

    const { data: transactions, error, count } = await query;

    if (error) {
      console.error('Expenses query error:', error);
      return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
    }

    // Stats for current month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const { data: monthData } = await supabase
      .from('financial_transactions')
      .select('type, category, amount, settlement_status')
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd);

    const stats = {
      total_expenses: 0,
      total_side_income: 0,
      unsettled_count: 0,
      unsettled_amount: 0,
      top_category: '' as string,
      top_category_amount: 0,
    };

    const catTotals: Record<string, number> = {};
    for (const txn of monthData || []) {
      const amt = Number(txn.amount);
      if (txn.type === 'expense') {
        stats.total_expenses += amt;
        catTotals[txn.category] = (catTotals[txn.category] || 0) + amt;
      } else {
        stats.total_side_income += amt;
      }
      if (txn.settlement_status === 'pending' && txn.type === 'expense') {
        stats.unsettled_count++;
        stats.unsettled_amount += amt;
      }
    }
    for (const [cat, amt] of Object.entries(catTotals)) {
      if (amt > stats.top_category_amount) {
        stats.top_category = cat;
        stats.top_category_amount = amt;
      }
    }

    return NextResponse.json({ transactions: transactions || [], total: count || 0, stats });
  } catch (error: any) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, category, amount, description, transaction_date, assignment_id, receipt_url, notes, created_by } = body;

    if (!type || !category || !amount || !description || !transaction_date || !created_by) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('financial_transactions')
      .insert({
        type,
        category,
        amount: parseFloat(amount),
        description,
        transaction_date,
        assignment_id: assignment_id || null,
        receipt_url: receipt_url || null,
        notes: notes || null,
        created_by,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: error.message || 'Failed to create expense' }, { status: 500 });
  }
}
