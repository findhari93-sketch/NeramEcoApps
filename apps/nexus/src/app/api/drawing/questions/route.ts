import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getDrawingQuestions,
  getAvailableDrawingYears,
  enrichDrawingQuestions,
} from '@neram/database/queries/nexus';

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const params = request.nextUrl.searchParams;
    const filters = {
      category: params.get('category') || undefined,
      sub_type: params.get('sub_type') || undefined,
      difficulty_tag: params.get('difficulty_tag') || undefined,
      year: params.get('year') ? parseInt(params.get('year')!) : undefined,
      search: params.get('search') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 20,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    };

    // Resolve Supabase user ID from MS OID for attempt status lookups
    const supabase = getSupabaseAdminClient();
    const { data: dbUser } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    const [{ data, count }, availableYears] = await Promise.all([
      getDrawingQuestions(filters),
      getAvailableDrawingYears(),
    ]);

    // Enrich with QB data (repeat counts, solutions) and attempt statuses
    const enriched = await enrichDrawingQuestions(data, dbUser?.id || null);

    return NextResponse.json({
      questions: enriched,
      total: count,
      available_years: availableYears,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load questions';
    console.error('Drawing questions GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
