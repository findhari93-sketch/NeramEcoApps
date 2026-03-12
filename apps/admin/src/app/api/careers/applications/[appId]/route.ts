// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getJobApplicationById, updateJobApplicationStatus } from '@neram/database';

// GET /api/careers/applications/[appId] - Get a single application
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const data = await getJobApplicationById(appId);
    if (!data) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching job application:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job application' },
      { status: 500 }
    );
  }
}

// PUT /api/careers/applications/[appId] - Update application status/notes
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const body = await request.json();
    const { status, admin_notes } = body;

    if (!status) {
      return NextResponse.json(
        { error: 'status is required' },
        { status: 400 }
      );
    }

    const data = await updateJobApplicationStatus(appId, status, admin_notes);
    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Error updating job application:', error);
    let message = 'Failed to update job application';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
