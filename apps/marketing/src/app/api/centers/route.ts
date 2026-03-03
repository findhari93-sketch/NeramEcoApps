export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getActiveCenters, getCenterBySlug } from '@neram/database/queries';

interface CentersResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * GET /api/centers
 *
 * Get all active offline learning centers, or a single center by slug.
 * Public endpoint - no authentication required.
 *
 * Query params:
 * - slug (optional): Return a single center matching the slug
 *
 * Response:
 * - 200: { success: true, data: OfflineCenter[] | OfflineCenter }
 * - 404: { success: false, error: 'Center not found' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function GET(request: NextRequest): Promise<NextResponse<CentersResponse>> {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (slug) {
      const center = await getCenterBySlug(supabase, slug);
      if (!center || !center.is_active) {
        return NextResponse.json(
          { success: false, error: 'Center not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: center });
    }

    const centers = await getActiveCenters(supabase);

    return NextResponse.json({
      success: true,
      data: centers,
    });
  } catch (error) {
    console.error('Get centers error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning centers' },
      { status: 500 }
    );
  }
}