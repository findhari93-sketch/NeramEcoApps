// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

// GET /api/batches - List batches (optionally filtered by courseId, isActive)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');
    const courseId = searchParams.get('courseId');

    const supabase = getSupabaseAdminClient();

    let query = supabase
      .from('batches')
      .select('id, name, course_id, start_date, end_date, capacity, enrolled_count, is_active, schedule')
      .order('start_date', { ascending: false });

    if (isActive === 'true') {
      query = query.eq('is_active', true);
    }

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('Error listing batches:', error);
    return NextResponse.json(
      { error: 'Failed to list batches' },
      { status: 500 }
    );
  }
}

// POST /api/batches - Create a new batch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, course_id, start_date, end_date, capacity, schedule } = body;

    if (!name || !course_id || !start_date) {
      return NextResponse.json(
        { error: 'name, course_id, and start_date are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('batches')
      .insert({
        name,
        course_id,
        start_date,
        end_date: end_date || null,
        capacity: capacity || 30,
        schedule: schedule || [],
        is_active: true,
        enrolled_count: 0,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error creating batch:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create batch' },
      { status: 500 }
    );
  }
}
