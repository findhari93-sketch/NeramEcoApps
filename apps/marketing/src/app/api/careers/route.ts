export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getPublishedJobPostings } from '@neram/database';
import type { EmploymentType } from '@neram/database';

/**
 * GET /api/careers
 *
 * List published job postings, optionally filtered by department or employment type.
 * Public endpoint - no authentication required.
 *
 * Query params:
 * - department: string (optional)
 * - employment_type: 'full_time' | 'part_time' | 'contract' | 'internship' (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department') || undefined;
    const employmentType = searchParams.get('employment_type') as EmploymentType | undefined;

    // Validate employment_type if provided
    const validTypes: EmploymentType[] = ['full_time', 'part_time', 'contract', 'internship'];
    if (employmentType && !validTypes.includes(employmentType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid employment_type. Must be one of: full_time, part_time, contract, internship' },
        { status: 400 }
      );
    }

    const client = createServerClient();
    const jobs = await getPublishedJobPostings(
      { department, employment_type: employmentType },
      client
    );

    return NextResponse.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Error fetching job postings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job postings' },
      { status: 500 }
    );
  }
}
