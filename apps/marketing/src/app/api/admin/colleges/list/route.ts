// @ts-nocheck
// New outreach columns (contact_status, last_outreach_at, outreach_count) are not in
// the generated Supabase types yet. Using @ts-nocheck matches the pattern in other
// marketing queries.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getStaffSessionOptional } from '@/lib/admin/staff-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getStaffSessionOptional(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  const tier = url.searchParams.get('tier');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('q');

  const supabase = createAdminClient();
  let query = supabase
    .from('colleges')
    .select(
      'id, name, slug, state, state_slug, city, type, neram_tier, coa_approved, naac_grade, admissions_email, email, contact_status, last_outreach_at, outreach_count, claimed, verified, data_completeness, created_at',
    )
    .order('name', { ascending: true });

  if (state) query = query.eq('state', state);
  if (tier) query = query.eq('neram_tier', tier);
  if (status) query = query.eq('contact_status', status);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ colleges: data ?? [] });
}
