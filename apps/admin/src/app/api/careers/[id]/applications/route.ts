// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listJobApplications } from '@neram/database';

// GET /api/careers/[id]/applications - List applications for a specific job posting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as any;

    const options: { job_posting_id: string; status?: string } = {
      job_posting_id: id,
    };
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
