import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { notifyRsvpToTeacher } from '@/lib/timetable-notifications';

/**
 * GET /api/timetable/rsvp?class_id={id}&classroom_id={id}
 * Teachers: see all RSVPs. Students: see their own.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classId = request.nextUrl.searchParams.get('class_id');
    const classroomId = request.nextUrl.searchParams.get('classroom_id');

    if (!classId || !classroomId) {
      return NextResponse.json({ error: 'Missing class_id and classroom_id' }, { status: 400 });
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

    // Verify class belongs to this classroom
    const { data: classCheck } = await supabase
      .from('nexus_scheduled_classes')
      .select('id')
      .eq('id', classId)
      .eq('classroom_id', classroomId)
      .single();

    if (!classCheck) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
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

    if (enrollment.role === 'teacher') {
      // Teachers see all RSVPs with student info
      const { data, error } = await supabase
        .from('nexus_class_rsvp')
        .select('*, student:users!nexus_class_rsvp_student_id_fkey(id, name, avatar_url)')
        .eq('scheduled_class_id', classId)
        .order('responded_at', { ascending: false });

      if (error) throw error;

      // Also get summary counts
      const attending = (data || []).filter((r: any) => r.response === 'attending').length;
      const notAttending = (data || []).filter((r: any) => r.response === 'not_attending').length;

      return NextResponse.json({
        rsvps: data || [],
        summary: { attending, not_attending: notAttending, total: (data || []).length },
      });
    } else {
      // Students see only their own RSVP
      const { data, error } = await supabase
        .from('nexus_class_rsvp')
        .select('*')
        .eq('scheduled_class_id', classId)
        .eq('student_id', user.id)
        .maybeSingle();

      if (error) throw error;

      return NextResponse.json({ rsvp: data });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load RSVPs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/rsvp
 * Student submits or updates their RSVP.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { class_id, classroom_id, response, reason } = await request.json();

    if (!class_id || !classroom_id || !response) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['attending', 'not_attending'].includes(response)) {
      return NextResponse.json({ error: 'Invalid response value' }, { status: 400 });
    }

    // Mandatory reason when not attending
    if (response === 'not_attending' && (!reason || !reason.trim())) {
      return NextResponse.json({ error: 'Reason is required when not attending' }, { status: 400 });
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

    // Verify class belongs to this classroom
    const { data: classCheck } = await supabase
      .from('nexus_scheduled_classes')
      .select('id')
      .eq('id', class_id)
      .eq('classroom_id', classroom_id)
      .single();

    if (!classCheck) {
      return NextResponse.json({ error: 'Class not found in this classroom' }, { status: 404 });
    }

    // Verify student is enrolled
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });
    }

    // Upsert RSVP
    const { data, error } = await supabase
      .from('nexus_class_rsvp')
      .upsert(
        {
          scheduled_class_id: class_id,
          student_id: user.id,
          response,
          reason: reason || null,
          responded_at: new Date().toISOString(),
        },
        { onConflict: 'scheduled_class_id,student_id' }
      )
      .select('*')
      .single();

    if (error) throw error;

    // Send timetable notification to teacher(s)
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single();

      const { data: classData } = await supabase
        .from('nexus_scheduled_classes')
        .select('title')
        .eq('id', class_id)
        .single();

      if (userData && classData) {
        await notifyRsvpToTeacher(
          classroom_id,
          userData.name || 'A student',
          response,
          reason || null,
          classData.title,
          class_id
        );
      }
    } catch {
      // Don't fail the RSVP if notification fails
    }

    return NextResponse.json({ rsvp: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save RSVP';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
