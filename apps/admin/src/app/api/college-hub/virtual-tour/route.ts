export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

// GET /api/college-hub/virtual-tour?college_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const college_id = searchParams.get('college_id');

  if (!college_id) {
    return NextResponse.json({ error: 'college_id required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('colleges')
    .select('id, name, short_name, neram_tier, virtual_tour_scenes')
    .eq('id', college_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'College not found' }, { status: 404 });
  }

  return NextResponse.json({ college: data });
}

// PATCH /api/college-hub/virtual-tour
// Body: { college_id: string, virtual_tour_scenes: VirtualTourScene[] | null }
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { college_id, virtual_tour_scenes } = body;

    if (!college_id) {
      return NextResponse.json({ error: 'college_id required' }, { status: 400 });
    }

    if (virtual_tour_scenes !== null && !Array.isArray(virtual_tour_scenes)) {
      return NextResponse.json(
        { error: 'virtual_tour_scenes must be an array or null' },
        { status: 400 }
      );
    }

    if (Array.isArray(virtual_tour_scenes)) {
      for (const scene of virtual_tour_scenes) {
        if (!scene.id || !scene.label || !scene.imageUrl) {
          return NextResponse.json(
            { error: 'Each scene must have id, label, and imageUrl' },
            { status: 400 }
          );
        }
      }
    }

    const supabase = createAdminClient();

    const { data: college } = await supabase
      .from('colleges')
      .select('id, neram_tier')
      .eq('id', college_id)
      .single();

    if (!college) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 });
    }

    if (college.neram_tier !== 'platinum') {
      return NextResponse.json(
        { error: 'Virtual tours are only available for Platinum-tier colleges' },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from('colleges')
      .update({
        virtual_tour_scenes: virtual_tour_scenes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', college_id)
      .select('id, name, neram_tier, virtual_tour_scenes')
      .single();

    if (error) {
      console.error('Virtual tour update error:', error);
      return NextResponse.json({ error: 'Failed to update virtual tour' }, { status: 500 });
    }

    return NextResponse.json({ college: data });
  } catch (err) {
    console.error('Virtual tour PATCH error:', err);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
