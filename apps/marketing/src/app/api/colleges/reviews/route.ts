// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

// GET /api/colleges/reviews?college_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const college_id = searchParams.get('college_id');
  if (!college_id) return NextResponse.json({ error: 'college_id required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('college_reviews')
    .select(
      'id,reviewer_name,reviewer_year,rating_overall,rating_studio,rating_faculty,rating_campus,rating_placements,rating_value,rating_infrastructure,title,body,pros,cons,created_at'
    )
    .eq('college_id', college_id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/colleges/reviews
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      college_id,
      reviewer_name,
      reviewer_year,
      firebase_uid,
      rating_overall,
      rating_studio,
      rating_faculty,
      rating_campus,
      rating_placements,
      rating_value,
      rating_infrastructure,
      title,
      review_body,
      pros,
      cons,
    } = body;

    if (!college_id || !reviewer_name || !review_body || !rating_overall) {
      return NextResponse.json(
        { error: 'Required: college_id, reviewer_name, review_body, rating_overall' },
        { status: 400 }
      );
    }
    if (review_body.length < 30) {
      return NextResponse.json(
        { error: 'Review must be at least 30 characters' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('college_reviews')
      .insert({
        college_id,
        reviewer_name,
        reviewer_year: reviewer_year ?? null,
        firebase_uid: firebase_uid ?? null,
        rating_overall,
        rating_studio: rating_studio ?? null,
        rating_faculty: rating_faculty ?? null,
        rating_campus: rating_campus ?? null,
        rating_placements: rating_placements ?? null,
        rating_value: rating_value ?? null,
        rating_infrastructure: rating_infrastructure ?? null,
        title: title ?? null,
        body: review_body,
        pros: pros ?? null,
        cons: cons ?? null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
