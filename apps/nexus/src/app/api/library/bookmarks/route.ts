import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getStudentBookmarks,
  createBookmark,
  deleteBookmark,
} from '@neram/database/queries/nexus';

/**
 * GET /api/library/bookmarks
 *
 * Get the student's bookmarks.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const bookmarks = await getStudentBookmarks(user.id);

    return NextResponse.json({ data: bookmarks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load bookmarks';
    console.error('Bookmarks GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/library/bookmarks
 *
 * Create a bookmark.
 * Body: { video_id, timestamp_seconds?, note? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const body = await request.json();
    const { video_id, timestamp_seconds, note } = body;

    if (!video_id) {
      return NextResponse.json({ error: 'Missing required field: video_id' }, { status: 400 });
    }

    const bookmark = await createBookmark({
      student_id: user.id,
      video_id,
      timestamp_seconds,
      note,
    });

    return NextResponse.json({ data: bookmark }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create bookmark';
    console.error('Bookmarks POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/library/bookmarks?id={bookmarkId}
 *
 * Delete a bookmark.
 */
export async function DELETE(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
    }

    await deleteBookmark(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete bookmark';
    console.error('Bookmarks DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
