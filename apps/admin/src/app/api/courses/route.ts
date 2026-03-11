// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

// GET /api/courses - List courses with batch counts
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();

    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    // Fetch batch counts per course
    const { data: batches } = await supabase
      .from('batches')
      .select('course_id, id, is_active');

    const batchCountMap: Record<string, { total: number; active: number }> = {};
    for (const b of (batches || [])) {
      if (!batchCountMap[b.course_id]) {
        batchCountMap[b.course_id] = { total: 0, active: 0 };
      }
      batchCountMap[b.course_id].total++;
      if (b.is_active) batchCountMap[b.course_id].active++;
    }

    // Fetch enrolled student counts per course
    const { data: studentCounts } = await supabase
      .from('student_profiles')
      .select('course_id');

    const studentCountMap: Record<string, number> = {};
    for (const s of (studentCounts || [])) {
      if (s.course_id) {
        studentCountMap[s.course_id] = (studentCountMap[s.course_id] || 0) + 1;
      }
    }

    const coursesWithStats = (courses || []).map((c: any) => ({
      ...c,
      batch_count: batchCountMap[c.id]?.total || 0,
      active_batch_count: batchCountMap[c.id]?.active || 0,
      enrolled_students: studentCountMap[c.id] || 0,
    }));

    return NextResponse.json({ data: coursesWithStats });
  } catch (error: any) {
    console.error('Error listing courses:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list courses' },
      { status: 500 }
    );
  }
}

// POST /api/courses - Create a new course
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, course_type, slug, description, regular_fee, duration_months, total_lessons } = body;

    if (!name || !course_type) {
      return NextResponse.json(
        { error: 'name and course_type are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('courses')
      .insert({
        name,
        course_type,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        description: description || null,
        regular_fee: regular_fee || 0,
        duration_months: duration_months || 6,
        total_lessons: total_lessons || 0,
        is_active: true,
        features: [],
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create course' },
      { status: 500 }
    );
  }
}
