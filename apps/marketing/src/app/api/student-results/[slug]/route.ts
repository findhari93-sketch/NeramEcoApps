export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getStudentResultBySlug } from '@neram/database/queries';

const cacheHeaders = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

/**
 * GET /api/student-results/[slug]
 *
 * Public endpoint to fetch a single student result by its URL slug.
 * Only returns published results.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Slug is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const data = await getStudentResultBySlug(slug, supabase);

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Student result not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data }, { headers: cacheHeaders });
  } catch (error) {
    console.error('Get student result by slug error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch student result' },
      { status: 500 }
    );
  }
}
