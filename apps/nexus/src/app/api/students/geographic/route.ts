import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getGeographicHierarchy, searchStudentsGeographic } from '@neram/database';

/**
 * GET /api/students/geographic
 *
 * Query modes:
 *   ?view=hierarchy                          → full country>state>city tree
 *   ?view=hierarchy&country=IN&state=...     → filtered tree
 *   ?search=term&limit=50&offset=0           → flat student search results
 */
export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const view = searchParams.get('view');

    // Search mode: flat student results with location
    if (search && search.trim()) {
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      const result = await searchStudentsGeographic({ search: search.trim(), limit, offset });
      return NextResponse.json(result);
    }

    // Hierarchy mode (default)
    const hierarchy = await getGeographicHierarchy();

    // Apply optional filters
    const countryFilter = searchParams.get('country');
    const stateFilter = searchParams.get('state');

    let filtered = hierarchy;

    if (countryFilter) {
      filtered = filtered.filter(
        (c) => c.country.toLowerCase() === countryFilter.toLowerCase()
      );
    }

    if (stateFilter && filtered.length > 0) {
      filtered = filtered.map((c) => ({
        ...c,
        states: c.states.filter(
          (s) => s.state.toLowerCase() === stateFilter.toLowerCase()
        ),
      }));
    }

    // Compute totals
    const totalStudents = filtered.reduce((sum, c) => sum + c.student_count, 0);
    const totalStates = filtered.reduce((sum, c) => sum + c.state_count, 0);
    const totalCities = filtered.reduce((sum, c) => sum + c.city_count, 0);

    return NextResponse.json({
      hierarchy: filtered,
      totals: {
        students: totalStudents,
        countries: filtered.length,
        states: totalStates,
        cities: totalCities,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load geographic data';
    console.error('Geographic students GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
