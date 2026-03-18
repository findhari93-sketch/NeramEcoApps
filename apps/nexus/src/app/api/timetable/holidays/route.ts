import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyHolidayMarked } from '@/lib/timetable-notifications';

/**
 * GET /api/timetable/holidays?classroom_id={id}&start={date}&end={date}
 * Returns holidays for a classroom within a date range.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const start = request.nextUrl.searchParams.get('start');
    const end = request.nextUrl.searchParams.get('end');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Verify user is enrolled
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    let query = supabase
      .from('nexus_classroom_holidays')
      .select('*')
      .eq('classroom_id', classroomId)
      .order('holiday_date', { ascending: true });

    if (start) query = query.gte('holiday_date', start);
    if (end) query = query.lte('holiday_date', end);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ holidays: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load holidays';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/holidays — Create a holiday (teacher only)
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { classroom_id, holiday_date, title, description } = await request.json();

    if (!classroom_id || !holiday_date || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can manage holidays' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('nexus_classroom_holidays')
      .insert({
        classroom_id,
        holiday_date,
        title,
        description: description || null,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A holiday already exists on this date' }, { status: 409 });
      }
      throw error;
    }

    // Notify students
    try {
      if (data) {
        await notifyHolidayMarked(classroom_id, holiday_date, title);
      }
    } catch {
      // Don't fail creation if notification fails
    }

    return NextResponse.json({ holiday: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create holiday';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/timetable/holidays — Remove a holiday (teacher only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id, classroom_id } = await request.json();

    if (!id || !classroom_id) {
      return NextResponse.json({ error: 'Missing id and classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment || enrollment.role !== 'teacher') {
      return NextResponse.json({ error: 'Only teachers can manage holidays' }, { status: 403 });
    }

    const { error } = await supabase
      .from('nexus_classroom_holidays')
      .delete()
      .eq('id', id)
      .eq('classroom_id', classroom_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete holiday';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
