// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getJobPostingById, updateJobPosting, deleteJobPosting } from '@neram/database';

// GET /api/careers/[id] - Get a single job posting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getJobPostingById(id);
    if (!data) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching job posting:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job posting' },
      { status: 500 }
    );
  }
}

// PUT /api/careers/[id] - Update a job posting
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      'title', 'slug', 'department', 'description', 'skills_required',
      'employment_type', 'target_audience', 'schedule_details',
      'location', 'experience_required', 'screening_questions',
      'contract_terms', 'status', 'display_priority',
      'published_at', 'closed_at', 'created_by',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const data = await updateJobPosting(id, updates);
    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Error updating job posting:', error);
    let message = 'Failed to update job posting';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/careers/[id] - Delete a job posting
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteJobPosting(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting job posting:', error);
    let message = 'Failed to delete job posting';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
