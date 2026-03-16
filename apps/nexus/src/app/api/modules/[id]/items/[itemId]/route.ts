import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PUT /api/modules/[id]/items/[itemId]
 * Update a module item.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title, item_type, content_url, youtube_video_id, sort_order, metadata,
      description, video_source, sharepoint_video_url, video_duration_seconds,
      chapter_number, is_published, is_active,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (item_type !== undefined) updateData.item_type = item_type;
    if (content_url !== undefined) updateData.content_url = content_url;
    if (youtube_video_id !== undefined) updateData.youtube_video_id = youtube_video_id;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (video_source !== undefined) updateData.video_source = video_source;
    if (sharepoint_video_url !== undefined) updateData.sharepoint_video_url = sharepoint_video_url;
    if (video_duration_seconds !== undefined) updateData.video_duration_seconds = video_duration_seconds;
    if (chapter_number !== undefined) updateData.chapter_number = chapter_number;
    if (is_published !== undefined) updateData.is_published = is_published;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: item, error } = await supabase
      .from('nexus_module_items')
      .update(updateData)
      .eq('id', itemId)
      .eq('module_id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ item });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update module item';
    console.error('Module item PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/modules/[id]/items/[itemId]
 * Delete a module item.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('nexus_module_items')
      .delete()
      .eq('id', itemId)
      .eq('module_id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete module item';
    console.error('Module item DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
