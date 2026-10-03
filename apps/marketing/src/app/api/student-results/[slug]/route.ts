export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_CACHE_HEADERS } from '@/app/api/_lib/public-cache';
import { createAdminClient } from '@neram/database';
import { getStudentResultBySlug } from '@neram/database/queries';

// Vercel-CDN-Cache-Control is needed: next.config.js puts CDN-Cache-Control: no-store on /api/*.
const cacheHeaders = PUBLIC_CACHE_HEADERS;

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
