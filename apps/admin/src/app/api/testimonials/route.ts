// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listTestimonialsAdmin,
  createTestimonial,
  getTestimonialStats,
} from '@neram/database';
import type { TestimonialLearningMode } from '@neram/database';

// GET /api/testimonials - List testimonials with filters + stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search') || undefined;
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;
    const city = searchParams.get('city') || undefined;
    const course_name = searchParams.get('course_name') || undefined;
    const learning_mode = searchParams.get('learning_mode') as TestimonialLearningMode | undefined;
    const is_active = searchParams.get('is_active') !== null
      ? searchParams.get('is_active') === 'true'
      : undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;
    const include_stats = searchParams.get('include_stats') === 'true';

    const client = getSupabaseAdminClient();

    const result = await listTestimonialsAdmin(
      { search, year, city, course_name, learning_mode, is_active, limit, offset },
      client
    );

    let stats = null;
    if (include_stats) {
      stats = await getTestimonialStats(client);
    }

    return NextResponse.json({ data: result.data, count: result.count, stats });
  } catch (error) {
    console.error('Error listing testimonials:', error);
    return NextResponse.json(
      { error: 'Failed to list testimonials' },
      { status: 500 }
    );
  }
}

// POST /api/testimonials - Create a new testimonial
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      student_name,
      student_photo,
      content,
      exam_type,
      score,
      rank,
      college_admitted,
      year,
      course_name,
      course_slug,
      city,
      state,
      learning_mode,
      rating,
      video_url,
      is_featured,
      is_homepage,
      display_order,
      is_active,
    } = body;

    // Validate required fields
    if (!student_name || !content || !exam_type || !year || !course_name || !city) {
      return NextResponse.json(
        { error: 'Required fields: student_name, content, exam_type, year, course_name, city' },
        { status: 400 }
      );
    }

    // Validate exam_type
    if (!['NATA', 'JEE_PAPER_2', 'BOTH'].includes(exam_type)) {
      return NextResponse.json(
        { error: 'exam_type must be one of: NATA, JEE_PAPER_2, BOTH' },
        { status: 400 }
      );
    }

    // Validate learning_mode
    if (learning_mode && !['online', 'hybrid', 'offline'].includes(learning_mode)) {
      return NextResponse.json(
        { error: 'learning_mode must be one of: online, hybrid, offline' },
        { status: 400 }
      );
    }

    const client = getSupabaseAdminClient();

    const data = await createTestimonial(
      {
        student_name,
        student_photo: student_photo || null,
        content: typeof content === 'string' ? { en: content } : content,
        exam_type,
        score: score != null ? Number(score) : null,
        rank: rank != null ? Number(rank) : null,
        college_admitted: college_admitted || null,
        year: Number(year),
        course_name,
        course_slug: course_slug || null,
        city,
        state: state || 'Tamil Nadu',
        learning_mode: learning_mode || 'offline',
        rating: rating != null ? Number(rating) : null,
        video_url: video_url || null,
        is_featured: is_featured ?? false,
        is_homepage: is_homepage ?? false,
        display_order: display_order ?? 0,
        is_active: is_active ?? true,
      },
      client
    );

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to create testimonial' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating testimonial:', error);
    return NextResponse.json(
      { error: 'Failed to create testimonial' },
      { status: 500 }
    );
  }
}
