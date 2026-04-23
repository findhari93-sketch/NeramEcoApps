// @ts-nocheck
// Outreach tracking columns (contact_status, last_outreach_at, outreach_count)
// are not in the generated Supabase types yet. Matches the @ts-nocheck
// convention used across other marketing/admin queries.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  const tier = url.searchParams.get('tier');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('q');

  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from('colleges')
    .select(
      'id, name, slug, state, state_slug, city, type, neram_tier, coa_approved, naac_grade, ' +
        'established_year, total_barch_seats, annual_fee_approx, affiliated_university, ' +
        'highlights, data_completeness, email, admissions_email, ' +
        'contact_status, last_outreach_at, outreach_count, claimed, verified, created_at',
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
