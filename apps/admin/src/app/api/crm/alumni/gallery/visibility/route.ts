// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { setGalleryVisibility } from '@neram/database';

/**
 * POST /api/crm/alumni/gallery/visibility
 * Show / hide an alumnus submission in the gallery (curation).
 * Body: { submissionId: string, visible: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { submissionId, visible } = body;
    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }
    await setGalleryVisibility(submissionId, !!visible);
    return NextResponse.json({ success: true, visible: !!visible });
  } catch (error: any) {
    console.error('CRM alumni gallery visibility error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
  }
}
