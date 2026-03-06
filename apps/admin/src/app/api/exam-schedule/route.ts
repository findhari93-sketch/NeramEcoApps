// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  listExamSchedules,
  upsertExamSchedule,
} from '@neram/database';

export async function GET() {
  try {
    const client = getSupabaseAdminClient();
    const schedules = await listExamSchedules(client);
    return NextResponse.json({ data: schedules });
  } catch (err) {
    console.error('Error listing exam schedules:', err);
    return NextResponse.json({ error: 'Failed to fetch exam schedules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.exam_type || !body.exam_year) {
      return NextResponse.json(
        { error: 'exam_type and exam_year are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.sessions)) {
      return NextResponse.json(
        { error: 'sessions must be an array' },
        { status: 400 }
      );
    }

    const client = getSupabaseAdminClient();
    const schedule = await upsertExamSchedule(
      {
        exam_type: body.exam_type,
        exam_year: body.exam_year,
        is_active: body.is_active ?? true,
        registration_open_date: body.registration_open_date,
        registration_close_date: body.registration_close_date,
        late_registration_close_date: body.late_registration_close_date,
        sessions: body.sessions,
        brochure_url: body.brochure_url,
        notes: body.notes,
      },
      body.admin_user_id || 'system',
      client
    );

    return NextResponse.json({ data: schedule }, { status: 201 });
  } catch (err) {
    console.error('Error saving exam schedule:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save exam schedule' },
      { status: 500 }
    );
  }
}
