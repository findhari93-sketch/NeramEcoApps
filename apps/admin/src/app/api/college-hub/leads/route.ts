// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_leads')
    .select('*, colleges(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    ...r,
    college_name: (r.colleges as { name: string } | null)?.name ?? 'Unknown',
  }));
  return NextResponse.json({ data: rows });
}
