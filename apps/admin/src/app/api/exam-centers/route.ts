import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listNataExamCenters,
  createNataExamCenter,
} from '@neram/database';

// GET /api/exam-centers — List with filters & pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const client = getSupabaseAdminClient();

    const options = {
      state: searchParams.get('state') || undefined,
      city: searchParams.get('city') || undefined,
      confidence: (searchParams.get('confidence') as 'HIGH' | 'MEDIUM' | 'LOW') || undefined,
      tier: (searchParams.get('tier') as 'Metro' | 'Tier-1' | 'Tier-2' | 'Tier-3' | 'International') || undefined,
      tcsIonOnly: searchParams.get('tcs_ion') === 'true' || undefined,
      barchOnly: searchParams.get('barch') === 'true' || undefined,
      newOnly: searchParams.get('new_only') === 'true' || undefined,
      year: searchParams.get('year') ? Number(searchParams.get('year')) : undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 500,
      offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : 0,
    };

    const result = await listNataExamCenters(options, client);

    return NextResponse.json({
      data: result.centers,
      count: result.count,
    });
  } catch (error) {
    console.error('Error listing exam centers:', error);
    const msg = error instanceof Error ? error.message : 'Failed to list exam centers';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/exam-centers — Create single center
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const client = getSupabaseAdminClient();

    // Validate required fields
    const { state, city_brochure, latitude, longitude, year } = body;
    if (!state || !city_brochure || latitude == null || longitude == null || !year) {
      return NextResponse.json(
        { error: 'state, city_brochure, latitude, longitude, and year are required' },
        { status: 400 }
      );
    }

    // Validate confidence enum
    if (body.confidence && !['HIGH', 'MEDIUM', 'LOW'].includes(body.confidence)) {
      return NextResponse.json(
        { error: 'confidence must be HIGH, MEDIUM, or LOW' },
        { status: 400 }
      );
    }

    // Validate city_population_tier enum
    if (body.city_population_tier && !['Metro', 'Tier-1', 'Tier-2', 'Tier-3', 'International'].includes(body.city_population_tier)) {
      return NextResponse.json(
        { error: 'city_population_tier must be Metro, Tier-1, Tier-2, Tier-3, or International' },
        { status: 400 }
      );
    }

    const created = await createNataExamCenter(body, client);

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error('Error creating exam center:', error);
    const msg = error instanceof Error ? error.message : 'Failed to create exam center';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
