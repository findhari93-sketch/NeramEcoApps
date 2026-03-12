export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getPublishedJobBySlug } from '@neram/database';

/**
 * GET /api/careers/[slug]
 *
 * Get a single published job posting by slug.
 * Public endpoint - no authentication required.
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

    const client = createServerClient();
    const job = await getPublishedJobBySlug(slug, client);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job posting not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    console.error('Error fetching job posting:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job posting' },
      { status: 500 }
    );
  }
}
