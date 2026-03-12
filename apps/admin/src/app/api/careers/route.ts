// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listJobPostings, createJobPosting } from '@neram/database';

// GET /api/careers - List all job postings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as any;

    const options: { status?: string } = {};
    if (status) options.status = status;

    const data = await listJobPostings(options);
    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error listing job postings:', error);
    return NextResponse.json(
      { error: 'Failed to list job postings' },
      { status: 500 }
    );
  }
}

// POST /api/careers - Create a new job posting
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title, slug, department, description, skills_required,
      employment_type, target_audience, schedule_details,
      location, experience_required, screening_questions,
      contract_terms, status, display_priority, created_by,
    } = body;

    if (!title || !department || !employment_type || !location) {
      return NextResponse.json(
        { error: 'title, department, employment_type, and location are required' },
        { status: 400 }
      );
    }

    const data = await createJobPosting({
      title,
      slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      department,
      description: description || '',
      skills_required: skills_required || [],
      employment_type,
      target_audience: target_audience || 'any',
      schedule_details: schedule_details || null,
      location,
      experience_required: experience_required || null,
      screening_questions: screening_questions || [],
      contract_terms: contract_terms || {},
      status: status || 'draft',
      display_priority: display_priority || 0,
      published_at: status === 'published' ? new Date().toISOString() : null,
      closed_at: null,
      created_by: created_by || null,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Error creating job posting:', error);
    return NextResponse.json(
      { error: 'Failed to create job posting' },
      { status: 500 }
    );
  }
}
