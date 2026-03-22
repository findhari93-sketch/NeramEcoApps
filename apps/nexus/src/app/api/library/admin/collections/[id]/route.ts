import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getCollectionWithVideos,
  updateCollection,
  deleteCollection,
} from '@neram/database/queries/nexus';

/**
 * GET /api/library/admin/collections/[id]
 *
 * Get a collection with its videos.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const { id } = await params;
    const collection = await getCollectionWithVideos(id);

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    return NextResponse.json({ data: collection });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load collection';
    console.error('Admin collection GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/library/admin/collections/[id]
 *
 * Update a collection.
 * Body: Partial collection fields (title, description, is_published, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const collection = await updateCollection(id, body);

    return NextResponse.json({ data: collection });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update collection';
    console.error('Admin collection PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/library/admin/collections/[id]
 *
 * Delete a collection.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    if (user.user_type !== 'teacher' && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: teacher/admin only' }, { status: 403 });
    }

    const { id } = await params;

    await deleteCollection(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete collection';
    console.error('Admin collection DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
