export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  getAllStudentResults,
  createStudentResult,
  generateStudentResultSlug,
} from '@neram/database';
import type { StudentResultExamType } from '@neram/database';

/**
 * GET /api/admin/student-results
 *
 * List all student results (including unpublished) with optional filters.
 * Query params: search, exam_type, year, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const exam_type = (searchParams.get('exam_type') || undefined) as StudentResultExamType | undefined;
    const yearStr = searchParams.get('year');
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    const limitStr = searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offsetStr = searchParams.get('offset');
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const client = getSupabaseAdminClient();
    const result = await getAllStudentResults(
      { search, exam_type, year, limit, offset },
      client
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching student results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch student results' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/student-results
 *
 * Create a new student result. Auto-generates a unique slug.
 * Body: JSON with student result fields (excluding id, slug, created_at, updated_at)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      student_name,
      exam_type,
      exam_year,
      score,
      max_score,
      rank,
      percentile,
      college_name,
      college_city,
      course_name,
      student_quote,
      photo_url,
      scorecard_url,
      scorecard_watermarked_url,
      is_featured,
      is_published,
      display_order,
    } = body;

    if (!student_name || !exam_type || !exam_year) {
      return NextResponse.json(
        { error: 'student_name, exam_type, and exam_year are required' },
        { status: 400 }
      );
    }

    const client = getSupabaseAdminClient();

    // Generate a unique slug
    let baseSlug = generateStudentResultSlug(student_name, exam_type, exam_year);
    let slug = baseSlug;
    let suffix = 1;

    // Check for slug uniqueness, append -2, -3, etc. if taken
    while (true) {
      const { data: existing } = await client
        .from('student_results')
        .select('id')
        .eq('slug', slug)
        .limit(1);

      if (!existing || existing.length === 0) {
        break;
      }
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    const result = await createStudentResult(
      {
        student_name,
        slug,
        exam_type,
        exam_year: parseInt(String(exam_year), 10),
        score: score != null ? parseFloat(String(score)) : null,
        max_score: max_score != null ? parseFloat(String(max_score)) : null,
        rank: rank != null ? parseInt(String(rank), 10) : null,
        percentile: percentile != null ? parseFloat(String(percentile)) : null,
        college_name: college_name || null,
        college_city: college_city || null,
        course_name: course_name || null,
        student_quote: student_quote || null,
        photo_url: photo_url || null,
        scorecard_url: scorecard_url || null,
        scorecard_watermarked_url: scorecard_watermarked_url || null,
        is_featured: is_featured ?? false,
        is_published: is_published ?? false,
        display_order: display_order ?? 0,
      },
      client
    );

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create student result' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error('Error creating student result:', error);
    return NextResponse.json(
      { error: 'Failed to create student result' },
      { status: 500 }
    );
  }
}
