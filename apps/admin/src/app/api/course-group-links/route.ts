// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getAllCourseGroupLinks,
  getCourseGroupLinks,
  upsertCourseGroupLinks,
} from '@neram/database';

// GET /api/course-group-links - List course group links
// Optional query param: ?courseId=xxx to filter by course
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');

    if (courseId) {
      const links = await getCourseGroupLinks(courseId, supabase);
      return NextResponse.json({ data: links });
    }

    const allLinks = await getAllCourseGroupLinks(supabase);
    return NextResponse.json({ data: allLinks });
  } catch (error: any) {
    console.error('Error fetching course group links:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch course group links' },
      { status: 500 }
    );
  }
}

// PUT /api/course-group-links - Upsert course group links
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      course_id,
      whatsapp_group_url,
      teams_group_chat_url,
      teams_group_chat_id,
      teams_class_team_url,
      teams_class_team_id,
    } = body;

    if (!course_id) {
      return NextResponse.json(
        { error: 'course_id is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const result = await upsertCourseGroupLinks(
      {
        course_id,
        whatsapp_group_url: whatsapp_group_url || null,
        teams_group_chat_url: teams_group_chat_url || null,
        teams_group_chat_id: teams_group_chat_id || null,
        teams_class_team_url: teams_class_team_url || null,
        teams_class_team_id: teams_class_team_id || null,
      },
      supabase
    );

    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error('Error upserting course group links:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save course group links' },
      { status: 500 }
    );
  }
}
