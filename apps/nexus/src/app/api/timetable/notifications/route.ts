import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { httpStatusForError, messageOf, throwIfReadFailed } from '@/lib/api-errors';

/**
 * GET /api/timetable/notifications?classroom_id={id}&limit=20&offset=0&countOnly=true
 *
 * Lists timetable-specific notifications for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom_id');
    const countOnly = request.nextUrl.searchParams.get('countOnly') === 'true';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    throwIfReadFailed(userError, 'the signed-in user');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (countOnly) {
      const { count, error } = await supabase
        .from('nexus_timetable_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('classroom_id', classroomId)
        .eq('is_read', false);

      throwIfReadFailed(error, 'the unread count');
      return NextResponse.json({ count: count || 0 });
    }

    const { data, error, count } = await supabase
      .from('nexus_timetable_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    throwIfReadFailed(error, 'the notifications');

    return NextResponse.json({ notifications: data || [], count: count || 0 });
  } catch (err) {
    // 401 for an expired token, 503 for a failed read: the poller can tell
    // "sign in again" from "try later".
    return NextResponse.json({ error: messageOf(err, 'Failed to load notifications') }, { status: httpStatusForError(err) });
  }
}

/**
 * PATCH /api/timetable/notifications — Mark as read
 * Body: { id } or { markAll: true, classroom_id }
 */
export async function PATCH(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();

    const supabase = getSupabaseAdminClient() as any;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();
    throwIfReadFailed(userError, 'the signed-in user');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (body.markAll && body.classroom_id) {
      const { error } = await supabase
        .from('nexus_timetable_notifications')
        .update({ is_read: true, read_at: now })
        .eq('user_id', user.id)
        .eq('classroom_id', body.classroom_id)
        .eq('is_read', false);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.id) {
      const { error } = await supabase
        .from('nexus_timetable_notifications')
        .update({ is_read: true, read_at: now })
        .eq('id', body.id)
        .eq('user_id', user.id);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Provide id or markAll + classroom_id' }, { status: 400 });
  } catch (err) {
    // 401 for an expired token, 503 for a failed read: the poller can tell
    // "sign in again" from "try later".
    return NextResponse.json({ error: messageOf(err, 'Failed to update notification') }, { status: httpStatusForError(err) });
  }
}
