export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import {
  getHomepageTestimonials,
  getTestimonials,
  getTestimonialFilterOptions,
  getTestimonialStats,
} from '@neram/database/queries';
import type { TestimonialLearningMode, ExamType } from '@neram/database';

/**
 * GET /api/testimonials
 *
 * Public endpoint to fetch student testimonials.
 *
 * Query params:
 * - homepage=true        -> Homepage testimonials (is_homepage=true, ordered)
 * - filters=true         -> Distinct filter options (years, cities, courses, modes)
 * - stats=true           -> Aggregate stats (total, avgRating, citiesCount, featuredCount)
 * - year, city, course_name, learning_mode, exam_type -> Filtered list
 * - limit, offset        -> Pagination (default: 12, 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);

    const cacheHeaders = { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

    // Homepage testimonials
    if (searchParams.get('homepage') === 'true') {
      const data = await getHomepageTestimonials(supabase);
      return NextResponse.json({ success: true, data }, { headers: cacheHeaders });
    }

    // Filter options
    if (searchParams.get('filters') === 'true') {
      const data = await getTestimonialFilterOptions(supabase);
      return NextResponse.json({ success: true, data }, { headers: cacheHeaders });
    }

    // Stats
    if (searchParams.get('stats') === 'true') {
      const data = await getTestimonialStats(supabase);
      return NextResponse.json({ success: true, data }, { headers: cacheHeaders });
    }

    // Filtered list with pagination
    const year = searchParams.get('year');
    const city = searchParams.get('city');
    const courseName = searchParams.get('course_name');
    const learningMode = searchParams.get('learning_mode') as TestimonialLearningMode | null;
    const examType = searchParams.get('exam_type') as ExamType | null;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const result = await getTestimonials(
      {
        year: year ? parseInt(year, 10) : undefined,
        city: city || undefined,
        course_name: courseName || undefined,
        learning_mode: learningMode || undefined,
        exam_type: examType || undefined,
        limit: limit ? parseInt(limit, 10) : 12,
        offset: offset ? parseInt(offset, 10) : 0,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      data: result.data,
      count: result.count,
    }, { headers: cacheHeaders });
  } catch (error) {
    console.error('Get testimonials error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch testimonials' },
      { status: 500 }
    );
  }
}
