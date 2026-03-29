// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();

    const { data: assignment, error: aErr } = await supabase
      .from('expense_assignments')
      .update({ status: 'settled', settled_at: now, updated_at: now })
      .eq('id', params.id)
      .select()
      .single();

    if (aErr) throw aErr;

    const { error: tErr } = await supabase
      .from('financial_transactions')
      .update({ settlement_status: 'settled', settled_at: now, updated_at: now })
      .eq('assignment_id', params.id)
      .eq('settlement_status', 'pending');

    if (tErr) throw tErr;

    return NextResponse.json({ assignment, message: 'Assignment settled successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
