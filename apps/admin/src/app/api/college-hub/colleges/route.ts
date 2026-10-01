export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { parseCollegeListQuery } from '@/lib/college-list-query';

const LIST_COLUMNS =
  'id,slug,name,short_name,city,state,type,neram_tier,coa_approved,naac_grade,nirf_rank_architecture,arch_index_score,verified,data_completeness,claimed';

/**
 * GET /api/college-hub/colleges
 *
 * Query (all optional): limit, offset, q (name / short name / city search),
 * tier (neram_tier), verified=true|false, fields=options (id, name, short_name,
 * neram_tier only, for pickers). With no limit it returns every college, as it
 * always has, for the Colleges grid. `total` is the count matching the filters, so
 * a caller can ask for limit=1 and read just the count.
 */
export async function GET(request: NextRequest) {
  const q = parseCollegeListQuery(new URL(request.url).searchParams);
  const supabase = createAdminClient();

  let query = supabase
    .from('colleges')
    .select(q.optionsOnly ? 'id,name,short_name,neram_tier,city' : LIST_COLUMNS, { count: 'exact' })
    .order('name')
    .order('id');
  if (q.search) {
    // Commas and parentheses would break PostgREST's or() syntax.
    const term = q.search.replace(/[,()]/g, ' ');
    query = query.or(`name.ilike.%${term}%,short_name.ilike.%${term}%,city.ilike.%${term}%`);
  }
  if (q.tier) query = query.eq('neram_tier', q.tier);
  if (q.verified !== null) query = query.eq('verified', q.verified);
  if (q.limit !== null) query = query.range(q.offset, q.offset + q.limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? (data ?? []).length });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('colleges').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
