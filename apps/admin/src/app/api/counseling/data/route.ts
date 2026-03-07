export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getRankListYearSummary,
  getRankListCommunityStats,
  getAllotmentYearSummary,
  getAllotmentCommunityStats,
} from '@neram/database';

/**
 * GET /api/counseling/data
 * Fetch rank list entries, allotment entries, or cutoffs with pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const systemId = searchParams.get('systemId');
    const year = parseInt(searchParams.get('year') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!action) {
      return NextResponse.json({ error: 'Missing action parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    if (action === 'rank-list-entries') {
      if (!systemId || !year) {
        return NextResponse.json({ error: 'Missing systemId or year' }, { status: 400 });
      }

      const { data, error, count } = await supabase
        .from('rank_list_entries')
        .select('*', { count: 'exact' })
        .eq('counseling_system_id', systemId)
        .eq('year', year)
        .order('rank', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return NextResponse.json({ entries: data || [], total: count || 0 });
    }

    if (action === 'allotment-entries') {
      if (!systemId || !year) {
        return NextResponse.json({ error: 'Missing systemId or year' }, { status: 400 });
      }

      const { data, error, count } = await supabase
        .from('allotment_list_entries')
        .select('*', { count: 'exact' })
        .eq('counseling_system_id', systemId)
        .eq('year', year)
        .order('rank', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return NextResponse.json({ entries: data || [], total: count || 0 });
    }

    if (action === 'cutoffs') {
      if (!systemId || !year) {
        return NextResponse.json({ error: 'Missing systemId or year' }, { status: 400 });
      }

      let query = supabase
        .from('historical_cutoffs')
        .select('*, college:colleges(name, slug)', { count: 'exact' })
        .eq('counseling_system_id', systemId)
        .eq('year', year);

      const category = searchParams.get('category');
      const round = searchParams.get('round');
      if (category) query = query.eq('category', category);
      if (round) query = query.eq('round', round);

      query = query
        .order('closing_mark', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({ entries: data || [], total: count || 0 });
    }

    if (action === 'rank-list-year-summary') {
      if (!systemId) {
        return NextResponse.json({ error: 'Missing systemId' }, { status: 400 });
      }
      const summary = await getRankListYearSummary(systemId, supabase);
      return NextResponse.json({ summary });
    }

    if (action === 'rank-list-community-stats') {
      if (!systemId || !year) {
        return NextResponse.json({ error: 'Missing systemId or year' }, { status: 400 });
      }
      const stats = await getRankListCommunityStats(systemId, year, supabase);
      const total = stats.reduce((sum, s) => sum + s.count, 0);
      return NextResponse.json({ stats, total });
    }

    if (action === 'allotment-year-summary') {
      if (!systemId) {
        return NextResponse.json({ error: 'Missing systemId' }, { status: 400 });
      }
      const summary = await getAllotmentYearSummary(systemId, supabase);
      return NextResponse.json({ summary });
    }

    if (action === 'allotment-community-stats') {
      if (!systemId || !year) {
        return NextResponse.json({ error: 'Missing systemId or year' }, { status: 400 });
      }
      const stats = await getAllotmentCommunityStats(systemId, year, supabase);
      const total = stats.reduce((sum, s) => sum + s.count, 0);
      return NextResponse.json({ stats, total });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('Counseling data API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
