export const dynamic = 'force-dynamic';

/**
 * GET /api/college-hub/content-reviews?tab=pending|recent  (or ?count_only=1 -> { pending_count })
 *   pending: every submission waiting for staff, oldest first.
 *   recent:  the last 100 approved or rejected.
 * -> { data: Submission[], pending_count }
 *    Submission = row + college { id, name, slug, state_slug, city } + diff (DiffRow[]) + section_label
 *    + source ('dashboard' | 'link'), submitter_role, submitter_phone, update_link_id
 * Staff only (admin API middleware).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { SECTION_LABEL, diffSubmission, isSection } from '@/lib/college-content-submissions/apply';

const table = () => getSupabaseAdminClient().from('college_content_submissions' as never) as any;

interface Row {
  id: string;
  college_id: string;
  section: string;
  payload: unknown;
  previous: unknown;
  status: string;
  submitted_by_name: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  source?: 'dashboard' | 'link' | null;
  submitter_role?: string | null;
  submitter_phone?: string | null;
  update_link_id?: string | null;
  colleges: { id: string; name: string; slug: string | null; state_slug: string | null; city: string | null } | null;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('count_only') === '1') {
    const { count, error } = await table().select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ pending_count: count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const tab = request.nextUrl.searchParams.get('tab') === 'recent' ? 'recent' : 'pending';
  const base =
    'id, college_id, section, payload, previous, status, submitted_by_name, submitted_at, reviewed_at, reviewed_by, review_note, colleges(id, name, slug, state_slug, city)';
  // source, submitter_role, submitter_phone and update_link_id came with the update links
  // migration; retry without them where it has not been applied yet.
  const listQuery = (withLinkColumns: boolean) => {
    const q = table().select(withLinkColumns ? `${base}, source, submitter_role, submitter_phone, update_link_id` : base);
    return tab === 'pending'
      ? q.eq('status', 'pending').order('submitted_at', { ascending: true }).limit(200)
      : q.in('status', ['approved', 'rejected']).order('reviewed_at', { ascending: false }).limit(100);
  };

  const [first, pending] = await Promise.all([
    listQuery(true),
    table().select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const list = first.error ? await listQuery(false) : first;
  if (list.error) return NextResponse.json({ error: list.error.message }, { status: 500 });

  const data = ((list.data ?? []) as Row[]).map(({ colleges, ...r }) => ({
    ...r,
    source: r.source ?? 'dashboard',
    submitter_role: r.submitter_role ?? null,
    submitter_phone: r.submitter_phone ?? null,
    update_link_id: r.update_link_id ?? null,
    college: colleges,
    section_label: isSection(r.section) ? SECTION_LABEL[r.section] : r.section,
    diff: isSection(r.section) ? diffSubmission(r.section, r.previous, r.payload) : [],
  }));
  return NextResponse.json({ data, pending_count: pending.count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
}
