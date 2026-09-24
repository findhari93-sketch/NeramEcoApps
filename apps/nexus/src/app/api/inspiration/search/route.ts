import { NextRequest, NextResponse } from 'next/server';
import {
  getInspirationFacets,
  listClassFeaturedItems,
  listUserClassroomIds,
  searchInspiration,
} from '@neram/database/queries/nexus';
import { resolveInspirationCaller } from '@/lib/inspiration-access';
import { presentClassFeatured, presentRow } from '@/lib/inspiration-present';
import { staffClassroomIds } from '@/lib/sketchbook-access';
import { parseInspirationQuery, parseScope, toFilters } from '@/lib/inspiration-query';
import { errorResponse } from '@/lib/api-errors';

const PAGE = 30;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * GET /api/inspiration/search?q=&type=&exam=&by=&year=&sort=&offset=&scope=&saved=1
 * GET /api/inspiration/search?featured=class   the "Featured from your class" row
 *
 * All ranking and every visibility rule live in nexus_inspiration_search. This
 * route decides only what the caller may ask for (a student is held to the
 * visible scope whatever the query string says) and what the answer may carry
 * (presentRow adds teacher fields for staff only).
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await resolveInspirationCaller(request.headers.get('Authorization'));
    const params = request.nextUrl.searchParams;

    // The class wall rides on this route rather than a new one: the page already
    // calls it, and the row is just another read of the same visible shelf.
    if (params.get('featured') === 'class') {
      const classroomIds = caller.staff
        ? await staffClassroomIds(caller.user)
        : await listUserClassroomIds(caller.user.id, 'student');
      const rows = await listClassFeaturedItems(classroomIds, caller.user.id);
      return NextResponse.json(
        { items: rows.map((entry) => presentClassFeatured(entry, { staff: caller.staff })) },
        { headers: NO_STORE },
      );
    }
    const state = parseInspirationQuery(request.nextUrl.search);
    const offset = Math.max(Math.floor(Number(params.get('offset')) || 0), 0);
    const savedOnly = params.get('saved') === '1';
    const scope = caller.staff && !savedOnly ? parseScope(params.get('scope')) : 'visible';
    const filters = toFilters(state, { offset, limit: PAGE, scope, savedOnly });

    const [result, facets] = await Promise.all([
      searchInspiration(filters, caller.user.id),
      offset === 0 && !savedOnly ? getInspirationFacets(filters, caller.user.id) : Promise.resolve(null),
    ]);

    return NextResponse.json(
      {
        items: result.rows.map((row) => presentRow(row, { staff: caller.staff })),
        total: result.total,
        matchKind: result.matchKind,
        facets,
        hasMore: offset + result.rows.length < result.total,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not search Inspiration');
  }
}
