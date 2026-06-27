// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listColleges, getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/crm/alumni/college-search?q=
 * Lightweight college lookup for the alumni college Autocomplete.
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || '';
    const { colleges } = await listColleges({ search: q || undefined, limit: 20 }, getSupabaseAdminClient());
    const results = (colleges || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      short_name: c.short_name,
      city: c.city,
      state: c.state,
    }));
    return NextResponse.json({ colleges: results });
  } catch (error: any) {
    console.error('CRM alumni college-search error:', error);
    return NextResponse.json({ error: error.message || 'Failed to search colleges' }, { status: 500 });
  }
}
