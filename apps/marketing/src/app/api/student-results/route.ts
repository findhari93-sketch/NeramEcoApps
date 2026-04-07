export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import {
  getStudentResults,
  getStudentResultStats,
  getStudentResultFilterOptions,
  getFeaturedStudentResults,
} from '@neram/database/queries';
import type { StudentResultExamType, StudentResultFilters } from '@neram/database';

const cacheHeaders = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

/**
 * GET /api/student-results
 *
 * Public endpoint to fetch student exam results for the marketing showcase.
 *
 * Query params:
 * - stats=true           -> Aggregate stats (total, avg NATA score, top rank, colleges)
 * - filters=true         -> Filter options (years, colleges, exam_types)
 * - search               -> Text search on student_name
 * - exam_type            -> Filter by exam type (nata, jee_paper2, tnea, other)
 * - year                 -> Filter by exam_year
 * - college              -> Filter by college_name (partial match)
 * - score_min, score_max -> Score range filter
 * - featured_only=true   -> Only featured results
 * - limit (default 12), offset (default 0) -> Pagination
 * - sort                 -> One of: score_desc, rank_asc, name_asc, newest (default)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    // Stats endpoint
    if (searchParams.get('stats') === 'true') {
      const data = await getStudentResultStats(supabase);
      return NextResponse.json({ success: true, data }, { headers: cacheHeaders });
    }

    // Filter options endpoint
    if (searchParams.get('filters') === 'true') {
      const data = await getStudentResultFilterOptions(supabase);
      return NextResponse.json({ success: true, data }, { headers: cacheHeaders });
    }

    // Featured results shortcut (uses display_order sorting)
    if (searchParams.get('featured_only') === 'true' && !searchParams.get('search') && !searchParams.get('exam_type')) {
      const limit = searchParams.get('limit');
      const data = await getFeaturedStudentResults(
        limit ? parseInt(limit, 10) : 6,
        supabase
      );
      return NextResponse.json({ success: true, data, total: data.length }, { headers: cacheHeaders });
    }

    // Build filters for the paginated list
    const filters: StudentResultFilters = {
      search: searchParams.get('search') || undefined,
      exam_type: (searchParams.get('exam_type') as StudentResultExamType) || undefined,
      year: searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined,
      college: searchParams.get('college') || undefined,
      score_min: searchParams.get('score_min') ? parseFloat(searchParams.get('score_min')!) : undefined,
      score_max: searchParams.get('score_max') ? parseFloat(searchParams.get('score_max')!) : undefined,
      featured_only: searchParams.get('featured_only') === 'true' || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 12,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0,
      sort: (searchParams.get('sort') as StudentResultFilters['sort']) || 'newest',
    };

    const { data, total } = await getStudentResults(filters, supabase);

    return NextResponse.json({ success: true, data, total }, { headers: cacheHeaders });
  } catch (error) {
    console.error('Get student results error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch student results' },
      { status: 500 }
    );
  }
}
