import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { getActiveCenters } from '@neram/database/queries';

interface CentersResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * GET /api/centers
 *
 * Get all active offline learning centers.
 * Public endpoint - no authentication required.
 *
 * Response:
 * - 200: { success: true, data: OfflineCenter[] }
 * - 500: { success: false, error: 'Internal error' }
 */
export async function GET(_request: NextRequest): Promise<NextResponse<CentersResponse>> {
  try {
    const supabase = createAdminClient();
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
