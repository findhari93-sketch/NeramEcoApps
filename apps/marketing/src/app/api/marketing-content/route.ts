// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getPublishedMarketingContent, getAchievementsByAcademicYear, getAchievementAcademicYears } from '@neram/database';

// GET /api/marketing-content - Returns published marketing content
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') as any;
    const limit = searchParams.get('limit');
    const pinnedOnly = searchParams.get('pinnedOnly') === 'true';
    const academicYear = searchParams.get('academic_year');
    const yearsOnly = searchParams.get('years_only') === 'true';

    // Special endpoint: get list of academic years
    if (yearsOnly) {
      const years = await getAchievementAcademicYears();
      return NextResponse.json({ years });
    }

    // Special endpoint: achievements by academic year
    if (type === 'achievement' && academicYear) {
      const content = await getAchievementsByAcademicYear(academicYear);
      return NextResponse.json({ content });
    }

    const content = await getPublishedMarketingContent({
      type: type || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      pinnedOnly,
    });

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Error fetching marketing content:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketing content' },
      { status: 500 }
    );
  }
}