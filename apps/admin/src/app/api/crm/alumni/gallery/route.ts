// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getGalleryFeed } from '@neram/database';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/crm/alumni/gallery?adminId=&tags=&limit=&offset=
 * Alumni Hall of Fame feed for admin curation. Reuses the shared gallery query
 * directly (no cross-origin call to Nexus). adminId is only used to mark the
 * admin's own reactions, which curation ignores.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const adminId = params.get('adminId');
    if (!adminId || !UUID_REGEX.test(adminId)) {
      return NextResponse.json({ error: 'adminId must be a valid UUID.' }, { status: 400 });
    }

    const tagsParam = params.get('tags');
    const tagSlugs = tagsParam
      ? tagsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const academicYear = params.get('academicYear') || undefined;

    // Admin is staff, so the Hidden audit view is always allowed here.
    const visibilityParam = params.get('visibility');
    const visibility =
      visibilityParam === 'hidden' || visibilityParam === 'all' ? visibilityParam : 'visible';
    const collegeId = params.get('collegeId') || undefined;

    const posts = await getGalleryFeed(adminId, {
      audience: 'alumni',
      tagSlugs,
      academicYear,
      visibility,
      collegeId,
      limit: params.get('limit') ? parseInt(params.get('limit')!) : 24,
      offset: params.get('offset') ? parseInt(params.get('offset')!) : 0,
    });
    return NextResponse.json({ posts });
  } catch (error: any) {
    console.error('CRM alumni gallery error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load gallery' }, { status: 500 });
  }
}
