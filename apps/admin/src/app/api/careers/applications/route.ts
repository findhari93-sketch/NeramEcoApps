// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listJobApplications } from '@neram/database';

// GET /api/careers/applications - List all job applications (optional job_posting_id filter)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobPostingId = searchParams.get('job_posting_id');
    const status = searchParams.get('status') as any;

    const options: { job_posting_id?: string; status?: string } = {};
    if (jobPostingId) options.job_posting_id = jobPostingId;
    if (status) options.status = status;

    const data = await listJobApplications(options);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing job applications:', error);
    return NextResponse.json(
      { error: 'Failed to list job applications' },
      { status: 500 }
    );
  }
}
