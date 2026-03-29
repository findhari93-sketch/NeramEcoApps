// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdminClient();

    const { data: assignment, error } = await supabase
      .from('expense_assignments')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 });
      throw error;
    }

    const { data: expenses } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('assignment_id', params.id)
      .order('transaction_date', { ascending: false });

    const summary = { total: 0, by_category: {} as Record<string, number>, pending_count: 0, settled_count: 0 };
    for (const exp of expenses || []) {
      const amt = Number(exp.amount);
      summary.total += amt;
      summary.by_category[exp.category] = (summary.by_category[exp.category] || 0) + amt;
      if (exp.settlement_status === 'pending') summary.pending_count++;
      else summary.settled_count++;
    }

    return NextResponse.json({ assignment, expenses: expenses || [], summary });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('expense_assignments')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
