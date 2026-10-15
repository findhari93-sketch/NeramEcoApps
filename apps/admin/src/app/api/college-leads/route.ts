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
      'id, college_id, name, phone, parent_phone, email, city, nata_score, message, source, ' +
        'status, college_note, status_updated_at, delivered_at, admin_review_status, admin_reviewed_at, admin_reviewed_by, admin_notes, ' +
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

  // Top colleges by leads in the last 90 days, for the summary strip. Not
  // narrowed by the status or college filter, so it always shows the big picture.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('college_leads')
    .select('college_id, status, delivered_at, colleges(name)')
    .gte('created_at', since)
    .limit(10000);
  const byCollege = new Map();
  for (const row of recent ?? []) {
    const r = row as any;
    const s = byCollege.get(r.college_id) ?? { college_id: r.college_id, name: r.colleges?.name ?? 'Unknown college', total: 0, new: 0, delivered: 0 };
    s.total += 1;
    if (r.status === 'new') s.new += 1;
    if (r.delivered_at) s.delivered += 1;
    byCollege.set(r.college_id, s);
  }
  const summary = Array.from(byCollege.values())
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 8);

  return NextResponse.json({ leads: data ?? [], counts: byStatus, summary });
}
