// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { setAlumniFeatured } from '@neram/database';

/**
 * POST /api/crm/alumni/gallery/feature
 * Pin / unpin an alumnus submission in the Hall of Fame.
 * Body: { submissionId: string, featured: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { submissionId, featured } = body;
    if (!submissionId) {
      return NextResponse.json({ error: 'submissionId is required' }, { status: 400 });
    }
    await setAlumniFeatured(submissionId, !!featured);
    return NextResponse.json({ success: true, featured: !!featured });
  } catch (error: any) {
    console.error('CRM alumni gallery feature error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
  }
}
