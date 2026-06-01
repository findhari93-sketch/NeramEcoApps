// @ts-nocheck
// PATCH the lifecycle `status` of a college (active / duplicate / defunct / unverified).
// Deactivating records a reason + timestamp; reactivating clears them.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = ['active', 'duplicate', 'defunct', 'unverified'];

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.college_id || !ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: 'college_id and a valid status are required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status: body.status };
  if (body.status === 'defunct' || body.status === 'unverified') {
    updates.deactivated_reason = (body.reason ?? '').trim() || null;
    updates.deactivated_at = new Date().toISOString();
  } else if (body.status === 'active') {
    updates.deactivated_reason = null;
    updates.deactivated_at = null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('colleges')
    .update(updates)
    .eq('id', body.college_id)
    .select('id, name, status, deactivated_reason')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, college: data });
}
