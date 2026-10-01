import { NextRequest, NextResponse } from 'next/server';
import { getColleges } from '@/lib/college-hub/queries';
import { BROWSE_PAGE_SIZE, parseListingFilters, toListingCollege } from '@/lib/college-hub/listing-filter';
import { PUBLIC_CACHE_HEADERS } from '@/app/api/_lib/public-cache';

/**
 * GET /api/colleges/browse?type=&exam=&city=&coa=&naac=&minFee=&maxFee=&q=&sort=&page=&state=&counseling=
 *
 * Filtered results for the "Browse all colleges" section of /colleges. The page
 * itself is static (ISR) and renders the default first page; when the URL has
 * filters the section fetches here. Public data only, edge-cached per query
 * string (PUBLIC_CACHE_HEADERS), so repeat filter combinations never reach the
 * function.
 */
export const dynamic = 'force-dynamic';

const MAX_PAGE = 50;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filters = parseListingFilters(sp, { limit: BROWSE_PAGE_SIZE });
  if ((filters.page ?? 1) > MAX_PAGE) {
    return NextResponse.json({ data: [], count: 0 }, { headers: PUBLIC_CACHE_HEADERS });
  }
  if (filters.search) filters.search = filters.search.slice(0, 80);
  try {
    const { data, count } = await getColleges(filters);
    return NextResponse.json({ data: data.map(toListingCollege), count }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (error) {
    console.error('[colleges/browse] query failed:', error);
    return NextResponse.json({ error: 'Failed to load colleges' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
