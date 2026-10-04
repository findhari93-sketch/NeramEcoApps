export const dynamic = 'force-dynamic';

/**
 * GET /api/centres - every offline centre with what its public page still
 * needs (Admin > Centres). Staff only (admin API middleware).
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { completeness, type CentreRow } from '@/lib/centre-editor';

export async function GET() {
  const { data, error } = await (getSupabaseAdminClient().from('offline_centers' as never) as any)
    .select('*') // ~10 rows; '*' so a column missing on one database never breaks the list
    .order('display_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const centres = ((data ?? []) as CentreRow[]).map((row) => ({ ...row, checklist: completeness(row) }));
  return NextResponse.json({ centres }, { headers: { 'Cache-Control': 'no-store' } });
}
