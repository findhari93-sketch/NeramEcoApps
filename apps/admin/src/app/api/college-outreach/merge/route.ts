// @ts-nocheck
// Merge a duplicate college into a surviving one.
// Re-points outreach history to the survivor, then soft-marks the duplicate
// (status='duplicate', duplicate_of=survivor). The duplicate row is NOT deleted,
// so no FK-referencing rows (fees, cutoffs, leads, saves) are orphaned; it is
// simply hidden from the public site by the status='active' filter.
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const duplicateId = body?.duplicate_id;
  const survivorId = body?.survivor_id;

  if (!duplicateId || !survivorId) {
    return NextResponse.json({ error: 'duplicate_id and survivor_id are required' }, { status: 400 });
  }
  if (duplicateId === survivorId) {
    return NextResponse.json({ error: 'A college cannot be merged into itself' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: rows, error: rowsErr } = await supabase
    .from('colleges')
    .select('id, name')
    .in('id', [duplicateId, survivorId]);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  if (!rows || rows.length !== 2) {
    return NextResponse.json({ error: 'Both the duplicate and the survivor must exist' }, { status: 404 });
  }

  // Re-point outreach history to the survivor (no unique constraint on college_id).
  const { error: logErr } = await supabase
    .from('college_outreach_log')
    .update({ college_id: survivorId })
    .eq('college_id', duplicateId);
  if (logErr) {
    return NextResponse.json({ error: `Failed to re-point outreach log: ${logErr.message}` }, { status: 500 });
  }

  const { data: dup, error: dupErr } = await supabase
    .from('colleges')
    .update({
      status: 'duplicate',
      duplicate_of: survivorId,
      deactivated_reason: 'Merged duplicate',
      deactivated_at: new Date().toISOString(),
    })
    .eq('id', duplicateId)
    .select('id, name, status, duplicate_of')
    .single();
  if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 500 });

  return NextResponse.json({ success: true, duplicate: dup, survivor_id: survivorId });
}
