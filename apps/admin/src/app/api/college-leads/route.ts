// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'pending';
  const collegeId = url.searchParams.get('college_id');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500);

  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('college_leads')
    .select(
      'id, college_id, name, phone, email, city, nata_score, message, source, ' +
        'status, admin_review_status, admin_reviewed_at, admin_reviewed_by, admin_notes, ' +
        'created_at, colleges!inner(name, slug, state_slug, neram_tier, email, admissions_email)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all') {
    query = query.eq('admin_review_status', status);
  }
  if (collegeId) {
    query = query.eq('college_id', collegeId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also grab counts per status for the dashboard chips
  const { data: counts } = await supabase
    .from('college_leads')
    .select('admin_review_status', { count: 'exact', head: false });

  const byStatus = { pending: 0, approved: 0, rejected: 0, spam: 0 };
  for (const row of counts ?? []) {
    const s = (row as any).admin_review_status as keyof typeof byStatus;
    if (s in byStatus) byStatus[s]++;
  }

  return NextResponse.json({ leads: data ?? [], counts: byStatus });
}
