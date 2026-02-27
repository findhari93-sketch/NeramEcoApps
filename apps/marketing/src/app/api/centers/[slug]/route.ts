import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getCenterBySeoSlug } from '@neram/database/queries';

interface CenterResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * GET /api/centers/[slug]
 *
 * Get a single center by its SEO slug.
 * Public endpoint - no authentication required.
 *
 * Response:
 * - 200: { success: true, data: OfflineCenter }
 * - 404: { success: false, error: 'Center not found' }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse<CenterResponse>> {
  try {
    const { slug } = params;

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Center slug is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const center = await getCenterBySeoSlug(slug, supabase);

    if (!center) {
      return NextResponse.json(
        { success: false, error: 'Center not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: center });
  } catch (error) {
    console.error('Get center by slug error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch center details' },
      { status: 500 }
    );
  }
}
