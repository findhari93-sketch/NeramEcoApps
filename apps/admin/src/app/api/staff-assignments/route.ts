// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const staffName = searchParams.get('staffName') || undefined;
    const city = searchParams.get('city') || undefined;
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('expense_assignments')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (staffName) query = query.ilike('staff_name', `%${staffName}%`);
    if (city) query = query.ilike('city', `%${city}%`);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: assignments, error, count } = await query;
    if (error) throw error;

    // Get expense totals for each assignment
    const assignmentIds = (assignments || []).map(a => a.id);
    let expenseSummaries: Record<string, { total: number; count: number }> = {};

    if (assignmentIds.length > 0) {
      const { data: txns } = await supabase
        .from('financial_transactions')
        .select('assignment_id, amount')
        .in('assignment_id', assignmentIds);

      for (const txn of txns || []) {
        if (!expenseSummaries[txn.assignment_id]) {
          expenseSummaries[txn.assignment_id] = { total: 0, count: 0 };
        }
        expenseSummaries[txn.assignment_id].total += Number(txn.amount);
        expenseSummaries[txn.assignment_id].count++;
      }
    }

    const enriched = (assignments || []).map(a => ({
      ...a,
      total_spent: expenseSummaries[a.id]?.total || 0,
      expense_count: expenseSummaries[a.id]?.count || 0,
    }));

    return NextResponse.json({ assignments: enriched, total: count || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, staff_name, city, start_date, end_date, notes, created_by } = body;

    if (!title || !staff_name || !start_date || !created_by) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('expense_assignments')
      .insert({ title, staff_name, city: city || null, start_date, end_date: end_date || null, notes: notes || null, created_by })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
