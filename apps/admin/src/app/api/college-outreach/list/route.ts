// @ts-nocheck
// Outreach tracking columns (contact_status, last_outreach_at, outreach_count)
// are not in the generated Supabase types yet. Matches the @ts-nocheck
// convention used across other marketing/admin queries.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, fetchAllRows } from '@neram/database';
import { parseCollegeListQuery } from '@/lib/college-list-query';
import { summariseOutreach } from '@/lib/college-outreach/list-stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only what the outreach table and its Edit dialog read. The email templates read
// highlights, established_year and data_completeness, but the send route loads
// those itself, so the list no longer ships them for every college.
const ROW_COLUMNS =
  'id, name, slug, state, state_slug, city, type, neram_tier, naac_grade, ' +
  'total_barch_seats, annual_fee_approx, affiliated_university, ' +
  'email, admissions_email, phone, website, ' +
  'contact_status, last_outreach_at, outreach_count, verified, ' +
  'status, email_source, duplicate_of';

const PAGE_SIZE = 100;

/**
 * GET /api/college-outreach/list
 *
 * Filters: state, tier, status (contact_status), lifecycle ('' = active, 'all'),
 * needs_email=true, q (name). Paging: limit (default 100, max 500) and offset.
 * Returns { colleges, total, stats } where total and stats cover every college
 * matching the filters, not just the page. fields=options returns id, name and
 * city for every match (the merge picker), unpaged.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  const tier = url.searchParams.get('tier');
  const status = url.searchParams.get('status'); // contact_status (outreach stage)
  const lifecycle = url.searchParams.get('lifecycle'); // colleges.status; '' or absent => active, 'all' => no filter
  const needsEmail = url.searchParams.get('needs_email') === 'true';
  const search = url.searchParams.get('q');
  const optionsOnly = url.searchParams.get('fields') === 'options';
  const { limit, offset } = parseCollegeListQuery(url.searchParams, PAGE_SIZE);

  const supabase = getSupabaseAdminClient();

  const filtered = (columns: string, count?: 'exact') => {
    let query = supabase.from('colleges').select(columns, count ? { count } : undefined);
    if (state) query = query.eq('state', state);
    if (tier) query = query.eq('neram_tier', tier);
    if (status) query = query.eq('contact_status', status);
    // Lifecycle: default to active so the dashboard hides duplicate/defunct/unverified
    // unless the user explicitly asks for a specific one or 'all'.
    if (lifecycle && lifecycle !== 'all') query = query.eq('status', lifecycle);
    else if (!lifecycle) query = query.eq('status', 'active');
    if (needsEmail) query = query.is('admissions_email', null).is('email', null);
    if (search) query = query.ilike('name', `%${search}%`);
    return query.order('name', { ascending: true }).order('id', { ascending: true });
  };

  try {
    if (optionsOnly) {
      const colleges = await fetchAllRows(() => filtered('id, name, city'));
      return NextResponse.json({ colleges, total: colleges.length });
    }

    const [page, statRows] = await Promise.all([
      filtered(ROW_COLUMNS, 'exact').range(offset, offset + (limit ?? PAGE_SIZE) - 1),
      // Four narrow columns for the stat chips, across every match.
      fetchAllRows(() => filtered('contact_status, admissions_email, email, neram_tier')),
    ]);
    if (page.error) throw page.error;

    return NextResponse.json({
      colleges: page.data ?? [],
      total: page.count ?? statRows.length,
      offset,
      limit: limit ?? PAGE_SIZE,
      stats: summariseOutreach(statRows),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load colleges' }, { status: 500 });
  }
}
